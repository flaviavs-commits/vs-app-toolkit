import { createHash, timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import type { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'

// ── POST /api/meuecoo/eventos ──────────────────────────────────────────────────
// Avisos de conta do Meu Ecoo (contrato: docs/EVENTOS-DE-CONTA.md do MeuEcoo). Quando a pessoa exclui a
// conta ou troca o e-mail lá, o Meu Ecoo chama esta rota com o mesmo token de serviço que este app usa para
// chamá-lo (PARTNER_AUTH_SERVICE_TOKEN) e reenvia até receber resposta. Responde sempre `200 { resultado }`
// quando o aviso é válido; nem a resposta nem o log levam e-mail.

const SERVICO_NAO_AUTORIZADO = { error: 'Serviço não autorizado.', code: 'SERVICO_NAO_AUTORIZADO' }
const EVENTO_INVALIDO = { error: 'Evento inválido.', code: 'EVENTO_INVALIDO' }
const FORMATO_DE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Db = Prisma.TransactionClient
type Evento =
  | { id: string; tipo: 'conta_excluida'; contaId: string; email: string }
  | { id: string; tipo: 'email_trocado'; contaId: string; email: string; emailNovo: string }

// Compara os hashes (sempre do mesmo tamanho) em tempo constante: nem o valor nem o tamanho do token vazam.
function tokenConfere(recebido: unknown): boolean {
  const esperado = process.env.PARTNER_AUTH_SERVICE_TOKEN
  if (!esperado || typeof recebido !== 'string') return false
  const hash = (valor: string) => createHash('sha256').update(valor).digest()
  return timingSafeEqual(hash(recebido), hash(esperado))
}

function emailValido(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.length > 254) return null
  const email = valor.toLowerCase()
  return FORMATO_DE_EMAIL.test(email) ? email : null
}

function lerEvento(corpo: any): Evento | null {
  const { id, tipo, contaId } = corpo ?? {}
  const email = emailValido(corpo?.email)
  if (typeof id !== 'string' || !id || id.length > 200) return null
  if (typeof contaId !== 'string' || !contaId || contaId.length > 64 || !email) return null
  if (tipo === 'conta_excluida') return { id, tipo, contaId, email }
  const emailNovo = emailValido(corpo.emailNovo)
  if (tipo === 'email_trocado' && emailNovo) return { id, tipo, contaId, email, emailNovo }
  return null
}

// Na exclusão, primeiro pelo id do Meu Ecoo e depois pelo e-mail. Na troca, primeiro pelo e-mail antigo: se a
// conta antiga ainda não tinha o id e a pessoa entrou com o e-mail novo antes do aviso, quem tem o id é a conta
// nova, vazia, e os dados ficariam presos no e-mail antigo. Conta achada pelo e-mail mas ligada a outro id do
// Meu Ecoo é de outra pessoa que reusou o e-mail, e não é tocada.
async function acharConta(db: Db, evento: Evento) {
  const porId = () => db.user.findUnique({ where: { meuEcooId: evento.contaId } })
  const porEmail = async () => {
    const conta = await db.user.findUnique({ where: { email: evento.email } })
    return conta && (!conta.meuEcooId || conta.meuEcooId === evento.contaId) ? conta : null
  }
  return evento.tipo === 'email_trocado' ? ((await porEmail()) ?? porId()) : ((await porId()) ?? porEmail())
}

async function aplicar(db: Db, evento: Evento): Promise<{ resultado: string; conflito?: true }> {
  const conta = await acharConta(db, evento)
  if (!conta) return { resultado: 'sem_conta' }

  if (evento.tipo === 'conta_excluida') {
    // Tira a identidade e encerra as sessões; os dados do app ficam, sem dono.
    await db.user.update({
      where: { id: conta.id },
      data: { email: `excluida-${conta.id}@contas-excluidas.invalid`, nome: '', meuEcooId: null },
    })
    await db.sessaoDeRenovacao.deleteMany({ where: { userId: conta.id } })
    return { resultado: 'anonimizada' }
  }

  // Aviso repetido: a conta já está no e-mail novo, e a sessão aberta depois dele fica.
  if (conta.email === evento.emailNovo) return { resultado: 'email_trocado' }

  // A pessoa entrou com o e-mail novo antes de o aviso chegar e ganhou outra conta: a antiga, com os dados,
  // fica com o e-mail e o id; a outra sai do caminho (antes, pelos índices únicos) sem perder os dados.
  const outra = await db.user.findUnique({ where: { email: evento.emailNovo } })
  if (outra) {
    await db.user.update({
      where: { id: outra.id },
      data: { email: `substituida-${outra.id}@contas-excluidas.invalid`, meuEcooId: null },
    })
    await db.sessaoDeRenovacao.deleteMany({ where: { userId: outra.id } })
  }
  // A conta achada não tem id ou já tem este (acharConta).
  await db.user.update({ where: { id: conta.id }, data: { email: evento.emailNovo, meuEcooId: evento.contaId } })
  await db.sessaoDeRenovacao.deleteMany({ where: { userId: conta.id } })
  return outra ? { resultado: 'email_trocado', conflito: true } : { resultado: 'email_trocado' }
}

export async function receberEventoDoMeuEcoo(req: Request, res: Response) {
  if (!tokenConfere(req.headers['x-service-token'])) return res.status(403).json(SERVICO_NAO_AUTORIZADO)

  const evento = lerEvento(req.body)
  if (!evento) return res.status(400).json(EVENTO_INVALIDO)

  try {
    const resposta = await prisma.$transaction((tx) => aplicar(tx, evento))
    console.info('[eventos-de-conta]', evento.id, evento.tipo, resposta.resultado)
    res.json(resposta)
  } catch (err) {
    // Só o código: a mensagem de erro do Prisma pode trazer os valores da consulta, e com eles o e-mail.
    const causa = (err as { code?: string }).code ?? (err as Error).name
    console.error('[eventos-de-conta]', evento.id, evento.tipo, 'erro', causa)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
}
