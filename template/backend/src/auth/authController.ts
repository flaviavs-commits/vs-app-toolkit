import { isIP } from 'node:net'
import jwt, { type SignOptions } from 'jsonwebtoken'
import type { Request, Response } from 'express'
import prisma from '../lib/prisma.js'
import { clientIp } from '../lib/clientIp.js'
import {
  JANELA_DE_CONCORRENCIA_MS,
  emitirRefresh,
  familiaVenceuEm,
  hashDoRefresh,
  revogarFamilia,
  rotacionar,
} from './refreshTokens.js'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Membership {
  isMember: boolean
  memberUntil: Date | null
}

interface PartnerFields extends Membership {
  email: string
  nome: string
  accessToken: string | null
}

// Campos de auth/membership expostos ao frontend. Cada app pode estender a
// serialização do usuário com seus próprios campos de negócio.
export function serializeUser(user: {
  id: string
  email: string
  nome: string
  isMember: boolean
  memberUntil: Date | null
}) {
  return {
    id: user.id,
    email: user.email,
    nome: user.nome,
    isMember: user.isMember,
    memberUntil: user.memberUntil,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// O provedor (hoje o Meu Ecoo) responde 403 tanto para conta que não pode entrar quanto para o
// token de serviço deste app recusado, e só o `code` do corpo separa os dois (campo que o VS
// antigo não manda: sem `code`, o 403 segue como erro de configuração). A mensagem vem destas
// constantes, nunca do texto do provedor.
const MENSAGEM_DE_CONTA: Record<string, string> = {
  CONTA_DESATIVADA: 'Conta desativada. Fale com o suporte.',
  CONTA_NAO_VERIFICADA: 'Confirme seu e-mail para entrar. Use o link que enviamos quando você criou a conta.',
}
const MENSAGEM_DE_CONFIGURACAO = 'Erro de configuração do serviço. Contate o suporte.'
const MUITAS_TENTATIVAS = 'Muitas tentativas. Aguarde alguns minutos.'

// Respostas da renovação da sessão (POST /api/auth/refresh). O `code` é o que o front lê.
const SESSAO_INVALIDA = { error: 'Sessão inválida — faça login novamente', code: 'SESSAO_INVALIDA' }
const SESSAO_EXPIRADA = { error: 'Sessão expirada — faça login novamente', code: 'SESSAO_EXPIRADA' }
const RENOVACAO_EM_ANDAMENTO = { error: 'Renovação em andamento', code: 'RENOVACAO_EM_ANDAMENTO' }
const RENOVACAO_INDISPONIVEL = {
  error: 'Não foi possível renovar a sessão agora. Tente novamente.',
  code: 'RENOVACAO_INDISPONIVEL',
}

// Quem está entrando, para o limite por IP do Meu Ecoo: o mesmo valor que o limite de tentativas
// deste app usa (lib/clientIp.ts). Só vai se for um IP válido; senão o cabeçalho é omitido.
function cabecalhoDoIp(req: Request): Record<string, string> {
  const ip = clientIp(req)
  return isIP(ip) !== 0 ? { 'X-Client-IP': ip } : {}
}

function mensagemDeConta(body: any): string | undefined {
  return typeof body?.code === 'string' ? MENSAGEM_DE_CONTA[body.code] : undefined
}

function signToken(userId: string, email: string): string {
  const options: SignOptions = {
    // Sessão curta: quem mantém a pessoa logada é o refresh token (refreshTokens.ts).
    expiresIn: (process.env.JWT_EXPIRES_IN || '30m') as SignOptions['expiresIn'],
  }
  return jwt.sign({ userId, email }, process.env.JWT_SECRET as string, options)
}

// Extrai email, nome, status de membership e o access token do VS da resposta do login.
// Os logins (parceiro e Google) e a renovação serializam o usuário com `UsuarioSerializer`
// (que inclui is_member_active / member_until) e devolvem tokens: { access, refresh }.
function extractPartnerFields(partnerResponse: any): PartnerFields {
  const data = partnerResponse.data ?? partnerResponse
  const partnerUser = data.user ?? partnerResponse.user ?? partnerResponse
  const accessToken = data.tokens?.access ?? partnerResponse.tokens?.access ?? null
  return {
    email: (partnerUser.email ?? '').toLowerCase(),
    nome: partnerUser.name ?? partnerUser.nome ?? partnerUser.full_name ?? '',
    isMember: !!partnerUser.is_member_active,
    memberUntil: partnerUser.member_until ? new Date(partnerUser.member_until) : null,
    accessToken,
  }
}

// Pede ao VS o status de membership mais recente via `/api/auth/verify-membership/`
// (com o access token do usuário). O VS é a FONTE DE VERDADE: ele decide quem é membro
// — admin, concessão manual no painel (que trava o status) OU assinatura ativa no
// Betalabs. Esta chamada só sincroniza o status atual; não impõe a regra do Betalabs.
// Em caso de falha, mantemos o status do login (fallback seguro: não bloqueia por rede).
async function verifyMembership(
  accessToken: string | null,
  fallback: Membership,
): Promise<Membership> {
  if (!accessToken || !process.env.PARTNER_VERIFY_MEMBERSHIP_URL) {
    return fallback
  }
  try {
    const raw = await fetch(process.env.PARTNER_VERIFY_MEMBERSHIP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!raw.ok) return fallback
    const body: any = await raw.json()
    const payload = body.data ?? body
    return {
      isMember: !!payload.is_member,
      memberUntil: payload.member_until ? new Date(payload.member_until) : fallback.memberUntil,
    }
  } catch (err) {
    console.error('[VS] verify membership error:', (err as Error).message)
    return fallback
  }
}

// Depois que o provedor aceitou a pessoa: sincroniza o membership, espelha o usuário
// e responde com o nosso JWT e o refresh token. Caminho comum aos logins por senha e Google.
async function abrirSessao(res: Response, partner: PartnerFields, email: string) {
  const { nome, isMember, memberUntil, accessToken } = partner
  const membership = await verifyMembership(accessToken, { isMember, memberUntil })

  const user = await prisma.user.upsert({
    where: { email },
    update: { nome, ...membership },
    create: { email, nome, ...membership },
  })

  const token = signToken(user.id, user.email)
  const refreshToken = await emitirRefresh(prisma, user.id)
  res.json({ token, refreshToken, user: serializeUser(user) })
}

// Chama uma rota de parceiro do Meu Ecoo com o token de serviço deste app (login por senha, troca do
// código do login único) e traduz a recusa para a resposta do app. Devolve o corpo quando o Meu Ecoo
// aceitou; senão já respondeu o erro e devolve null.
async function chamarMeuEcoo(
  req: Request,
  res: Response,
  url: string | URL,
  corpo: object,
  mensagemPadrao: string,
): Promise<any | null> {
  try {
    const raw = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': process.env.PARTNER_AUTH_SERVICE_TOKEN as string,
        ...cabecalhoDoIp(req),
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(8000),
    })

    if (!raw.ok) {
      const body: any = await raw.json().catch(() => ({}))
      if (raw.status === 403) {
        // Conta que não pode entrar → 403 com a mensagem da conta. Qualquer outro 403 (token de
        // serviço recusado, ou um provedor antigo sem `code`) é erro de configuração nosso → 502.
        const conta = mensagemDeConta(body)
        if (conta) res.status(403).json({ error: conta })
        else res.status(502).json({ error: MENSAGEM_DE_CONFIGURACAO })
        return null
      }
      if (raw.status === 429) {
        res.status(429).json({ error: MUITAS_TENTATIVAS })
        return null
      }
      // O Meu Ecoo manda a mensagem em `error`; `detail` e `message` são do contrato do VS.
      res.status(raw.status).json({ error: body.error || body.detail || body.message || mensagemPadrao })
      return null
    }

    return await raw.json()
  } catch (err) {
    console.error('[VS] auth error:', (err as Error).message)
    res.status(502).json({
      error: 'Serviço de autenticação indisponível. Tente novamente.',
    })
    return null
  }
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Login email+senha. Proxy server-to-server para o VS (parceiro interno) com o
// X-Service-Token. Se o VS aceitar → upsert local + emite nosso JWT.
export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' })
  }

  const partnerResponse = await chamarMeuEcoo(
    req,
    res,
    process.env.PARTNER_AUTH_URL as string,
    { email, password },
    'Credenciais inválidas',
  )
  if (!partnerResponse) return

  await abrirSessao(res, extractPartnerFields(partnerResponse), email.toLowerCase())
}

// ── POST /api/auth/meu-ecoo ───────────────────────────────────────────────────
// Login único (B7 do Meu Ecoo): o "Abrir" do Meu Ecoo leva um código de uso único para este app na
// URL (`?meuecoo_codigo=`) e o front o manda para cá. O servidor o troca por sessão no Meu Ecoo
// (POST /api/partner/auth/trocar-codigo), com o token de serviço do app: o código só vale uma vez,
// por pouco tempo e só para o app que o pediu. A resposta tem o formato do login de parceiro, então
// daí em diante é o mesmo caminho (membership, espelho do usuário, JWT e refresh token). O e-mail
// vem do Meu Ecoo, nunca do corpo.
export async function loginComCodigoDoMeuEcoo(req: Request, res: Response) {
  const codigo = typeof req.body?.codigo === 'string' ? req.body.codigo.trim() : ''
  if (!codigo || codigo.length > 200) {
    return res.status(400).json({ error: 'Código é obrigatório' })
  }

  const url = new URL('/api/partner/auth/trocar-codigo', process.env.PARTNER_AUTH_URL)
  const partnerResponse = await chamarMeuEcoo(req, res, url, { codigo }, 'Código inválido ou expirado.')
  if (!partnerResponse) return

  const partner = extractPartnerFields(partnerResponse)
  if (!partner.email) {
    return res.status(502).json({ error: 'Resposta de autenticação inválida.' })
  }

  await abrirSessao(res, partner, partner.email)
}

// ── POST /api/auth/google ─────────────────────────────────────────────────────
// Login com Google via Firebase. O frontend obtém o id_token (signInWithPopup) e
// o envia aqui. Repassamos ao provedor (rota pública /api/auth/firebase/google), que
// valida o token Firebase. O token de serviço vai junto só para o Meu Ecoo gravar por
// qual app a pessoa entrou (`ultimo_app`) e aceitar o `X-Client-IP`; sem ele o login segue.
export async function loginGoogle(req: Request, res: Response) {
  const { idToken } = req.body as { idToken?: string }

  if (!idToken) {
    return res.status(400).json({ error: 'idToken é obrigatório' })
  }

  const tokenDeServico = process.env.PARTNER_AUTH_SERVICE_TOKEN
  let partnerResponse: any
  try {
    const raw = await fetch(process.env.PARTNER_AUTH_GOOGLE_URL as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tokenDeServico ? { 'X-Service-Token': tokenDeServico } : {}),
        ...cabecalhoDoIp(req),
      },
      body: JSON.stringify({ id_token: idToken }),
      signal: AbortSignal.timeout(8000),
    })

    if (!raw.ok) {
      const body: any = await raw.json().catch(() => ({}))
      if (raw.status === 403) {
        const conta = mensagemDeConta(body)
        if (conta) return res.status(403).json({ error: conta })
      }
      if (raw.status === 429) return res.status(429).json({ error: MUITAS_TENTATIVAS })
      const message =
        body.error || body.message || body.detail || 'Não foi possível autenticar com o Google.'
      return res.status(raw.status).json({ error: message })
    }

    partnerResponse = await raw.json()
  } catch (err) {
    console.error('[VS] google auth error:', (err as Error).message)
    return res.status(502).json({
      error: 'Serviço de autenticação indisponível. Tente novamente.',
    })
  }

  const partner = extractPartnerFields(partnerResponse)
  if (!partner.email) {
    return res.status(502).json({ error: 'Resposta de autenticação inválida.' })
  }

  await abrirSessao(res, partner, partner.email)
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Liberado a qualquer logado (não exige membership). O frontend usa no bootstrap
// para restaurar a sessão e decidir se mostra o app ou a tela de acesso restrito.
export async function getMe(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })
  res.json(serializeUser(user))
}

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
// Renovação da sessão: troca um refresh token válido por um par novo (rotação). Público: quem
// autoriza é o próprio refresh token. Antes de consumi-lo, reconsulta o Meu Ecoo: conta desativada
// ou apagada revoga a família, e a assinatura volta atualizada no `user`.
export async function refresh(req: Request, res: Response) {
  try {
    const sessao = await buscarSessao(req.body?.refreshToken)
    if (!sessao) return res.status(401).json(SESSAO_INVALIDA)
    if (sessao.usadoEm || sessao.revogadoEm) return await recusarReuso(res, sessao)

    const agora = Date.now()
    if (sessao.expiraEm.getTime() <= agora || familiaVenceuEm(sessao.familiaIniciadaEm).getTime() <= agora) {
      return res.status(401).json(SESSAO_EXPIRADA)
    }

    const renovacao = await reconsultarMeuEcoo(sessao.user.email)
    if ('recusa' in renovacao) {
      const { status, body, revogaFamilia } = renovacao.recusa
      if (revogaFamilia) await revogarFamilia(sessao.familiaId)
      return res.status(status).json(body)
    }

    const { nome, isMember, memberUntil } = renovacao.partner
    const user = await prisma.user.update({ where: { id: sessao.userId }, data: { nome, isMember, memberUntil } })

    const refreshToken = await rotacionar(sessao)
    if (!refreshToken) {
      // Outra requisição consumiu o token no meio do caminho: relê e aplica a regra de reuso.
      const atual = await prisma.sessaoDeRenovacao.findUnique({ where: { id: sessao.id } })
      return atual ? await recusarReuso(res, atual) : res.status(401).json(SESSAO_INVALIDA)
    }

    res.json({ token: signToken(user.id, user.email), refreshToken, user: serializeUser(user) })
  } catch (err) {
    console.error('[auth] refresh error:', (err as Error).message)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
// Revoga a família do refresh token. Sempre 204, exista o token ou não: não revela nada.
export async function logout(req: Request, res: Response) {
  try {
    const sessao = await buscarSessao(req.body?.refreshToken)
    if (sessao) await revogarFamilia(sessao.familiaId)
  } catch (err) {
    console.error('[auth] logout error:', (err as Error).message)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
  res.status(204).end()
}

function buscarSessao(refreshToken: unknown) {
  if (typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 200) return null
  return prisma.sessaoDeRenovacao.findUnique({
    where: { tokenHash: hashDoRefresh(refreshToken) },
    include: { user: { select: { email: true } } },
  })
}

// Token já consumido (ou de família revogada) reapareceu. Dentro da janela é a outra aba
// renovando ao mesmo tempo (409, sem revogar); fora dela é reuso, e a família inteira cai.
async function recusarReuso(
  res: Response,
  sessao: { familiaId: string; usadoEm: Date | null; revogadoEm: Date | null },
) {
  const emAndamento =
    !sessao.revogadoEm && !!sessao.usadoEm && Date.now() - sessao.usadoEm.getTime() < JANELA_DE_CONCORRENCIA_MS
  if (emAndamento) return res.status(409).json(RENOVACAO_EM_ANDAMENTO)
  await revogarFamilia(sessao.familiaId)
  return res.status(401).json(SESSAO_INVALIDA)
}

type Renovacao =
  | { partner: PartnerFields }
  | { recusa: { status: number; body: object; revogaFamilia: boolean } }

const MEU_ECOO_INDISPONIVEL: Renovacao = {
  recusa: { status: 503, body: RENOVACAO_INDISPONIVEL, revogaFamilia: false },
}

// Reconsulta a conta no Meu Ecoo com o token de serviço deste app (mesma origem do login de
// parceiro). Só recusa a sessão para o que o Meu Ecoo diz da conta; qualquer outra falha (rede,
// 5xx, limite, rota ainda não publicada) é indisponibilidade e não consome nem revoga nada.
async function reconsultarMeuEcoo(email: string): Promise<Renovacao> {
  try {
    const raw = await fetch(new URL('/api/partner/auth/renovar', process.env.PARTNER_AUTH_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': process.env.PARTNER_AUTH_SERVICE_TOKEN as string,
      },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(8000),
    })

    if (raw.ok) {
      const partner = extractPartnerFields(await raw.json())
      if (partner.email) return { partner }
      return { recusa: { status: 502, body: { error: 'Resposta de autenticação inválida.' }, revogaFamilia: false } }
    }

    const body: any = await raw.json().catch(() => ({}))
    if (raw.status === 403) {
      const conta = mensagemDeConta(body)
      if (conta) return { recusa: { status: 403, body: { error: conta }, revogaFamilia: true } }
      console.error('[MeuEcoo] renovar: token de serviço recusado (403)')
      return { recusa: { status: 502, body: { error: MENSAGEM_DE_CONFIGURACAO }, revogaFamilia: false } }
    }
    // Só o `code` separa conta apagada de rota ausente: sem ele, um 404 não pode revogar sessão alguma.
    if (raw.status === 404 && body?.code === 'CONTA_NAO_ENCONTRADA') {
      return { recusa: { status: 401, body: SESSAO_INVALIDA, revogaFamilia: true } }
    }
    console.error('[MeuEcoo] renovar: HTTP', raw.status)
  } catch (err) {
    console.error('[MeuEcoo] renovar error:', (err as Error).message)
  }
  return MEU_ECOO_INDISPONIVEL
}
