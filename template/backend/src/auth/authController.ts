import jwt, { type SignOptions } from 'jsonwebtoken'
import type { Request, Response } from 'express'
import prisma from '../lib/prisma.js'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Membership {
  isMember: boolean
  memberUntil: Date | null
}

interface PartnerFields extends Membership {
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

function mensagemDeConta(body: any): string | undefined {
  return typeof body?.code === 'string' ? MENSAGEM_DE_CONTA[body.code] : undefined
}

function signToken(userId: string, email: string): string {
  const options: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'],
  }
  return jwt.sign({ userId, email }, process.env.JWT_SECRET as string, options)
}

// Extrai nome, status de membership e o access token do VS da resposta do login.
// Ambos os logins (parceiro e Google) serializam o usuário com `UsuarioSerializer`
// (que inclui is_member_active / member_until) e devolvem tokens: { access, refresh }.
function extractPartnerFields(partnerResponse: any): PartnerFields {
  const data = partnerResponse.data ?? partnerResponse
  const partnerUser = data.user ?? partnerResponse.user ?? partnerResponse
  const accessToken = data.tokens?.access ?? partnerResponse.tokens?.access ?? null
  return {
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

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Login email+senha. Proxy server-to-server para o VS (parceiro interno) com o
// X-Service-Token. Se o VS aceitar → upsert local + emite nosso JWT.
export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' })
  }

  let partnerResponse: any
  try {
    const raw = await fetch(process.env.PARTNER_AUTH_URL as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': process.env.PARTNER_AUTH_SERVICE_TOKEN as string,
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(8000),
    })

    if (!raw.ok) {
      const body: any = await raw.json().catch(() => ({}))
      if (raw.status === 403) {
        // Conta que não pode entrar → 403 com a mensagem da conta. Qualquer outro 403 (token de
        // serviço recusado, ou um provedor antigo sem `code`) é erro de configuração nosso → 502.
        const conta = mensagemDeConta(body)
        if (conta) return res.status(403).json({ error: conta })
        return res.status(502).json({ error: MENSAGEM_DE_CONFIGURACAO })
      }
      if (raw.status === 429) return res.status(429).json({ error: MUITAS_TENTATIVAS })
      // O Meu Ecoo manda a mensagem em `error`; `detail` e `message` são do contrato do VS.
      const message = body.error || body.detail || body.message || 'Credenciais inválidas'
      return res.status(raw.status).json({ error: message })
    }

    partnerResponse = await raw.json()
  } catch (err) {
    console.error('[VS] auth error:', (err as Error).message)
    return res.status(502).json({
      error: 'Serviço de autenticação indisponível. Tente novamente.',
    })
  }

  const { nome, isMember, memberUntil, accessToken } = extractPartnerFields(partnerResponse)
  const membership = await verifyMembership(accessToken, { isMember, memberUntil })

  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { nome, ...membership },
    create: { email: email.toLowerCase(), nome, ...membership },
  })

  const token = signToken(user.id, user.email)
  res.json({ token, user: serializeUser(user) })
}

// ── POST /api/auth/google ─────────────────────────────────────────────────────
// Login com Google via Firebase. O frontend obtém o id_token (signInWithPopup) e
// o envia aqui. Repassamos ao VS (rota pública /api/auth/firebase/google/), que
// valida o token Firebase. NÃO enviamos X-Service-Token (rota é pública).
export async function loginGoogle(req: Request, res: Response) {
  const { idToken } = req.body as { idToken?: string }

  if (!idToken) {
    return res.status(400).json({ error: 'idToken é obrigatório' })
  }

  let partnerResponse: any
  try {
    const raw = await fetch(process.env.PARTNER_AUTH_GOOGLE_URL as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  const partnerUserRaw = partnerResponse.data?.user ?? partnerResponse.user ?? partnerResponse
  const email = (partnerUserRaw.email ?? '').toLowerCase()
  const { nome, isMember, memberUntil, accessToken } = extractPartnerFields(partnerResponse)

  if (!email) {
    return res.status(502).json({ error: 'Resposta de autenticação inválida.' })
  }

  const membership = await verifyMembership(accessToken, { isMember, memberUntil })

  const user = await prisma.user.upsert({
    where: { email },
    update: { nome, ...membership },
    create: { email, nome, ...membership },
  })

  const token = signToken(user.id, user.email)
  res.json({ token, user: serializeUser(user) })
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Liberado a qualquer logado (não exige membership). O frontend usa no bootstrap
// para restaurar a sessão e decidir se mostra o app ou a tela de acesso restrito.
export async function getMe(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' })
  res.json(serializeUser(user))
}
