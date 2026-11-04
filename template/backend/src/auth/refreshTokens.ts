import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import prisma from '../lib/prisma.js'

// ── Refresh tokens da sessão curta ─────────────────────────────────────────────
// O JWT de acesso dura minutos; o refresh token, opaco, dura dias e troca de valor a cada
// renovação (rotação). Só o hash SHA-256 vai ao banco: quem lê a tabela não consegue renovar
// nenhuma sessão. Cada login abre uma família; token já usado que reaparece revoga a família.

const DIA_MS = 24 * 60 * 60 * 1000
const FAMILIA_MAX_DIAS = 30

// Duas abas renovando juntas apresentam o mesmo token com segundos de diferença; dentro desta
// janela o reuso é concorrência legítima (409), e não roubo.
export const JANELA_DE_CONCORRENCIA_MS = 10_000

type Db = Prisma.TransactionClient

export const hashDoRefresh = (refreshToken: string) =>
  createHash('sha256').update(refreshToken).digest('hex')

function validadeDoTokenEmDias(): number {
  const dias = Number(process.env.REFRESH_TOKEN_TTL_DAYS)
  return Number.isFinite(dias) && dias > 0 ? dias : 7
}

export function familiaVenceuEm(familiaIniciadaEm: Date): Date {
  return new Date(familiaIniciadaEm.getTime() + FAMILIA_MAX_DIAS * DIA_MS)
}

// Emite um refresh token novo. Sem `familia`, abre uma família (login); com ela, continua a
// cadeia (renovação). Devolve o valor puro, que só existe nesta resposta.
export async function emitirRefresh(
  db: Db,
  userId: string,
  familia?: { familiaId: string; familiaIniciadaEm: Date },
): Promise<string> {
  const agora = new Date()
  const refreshToken = randomBytes(32).toString('base64url')
  await db.sessaoDeRenovacao.create({
    data: {
      userId,
      familiaId: familia?.familiaId ?? randomUUID(),
      tokenHash: hashDoRefresh(refreshToken),
      expiraEm: new Date(agora.getTime() + validadeDoTokenEmDias() * DIA_MS),
      familiaIniciadaEm: familia?.familiaIniciadaEm ?? agora,
    },
  })
  // Higiene: as linhas vencidas da própria pessoa não servem a mais nada.
  await db.sessaoDeRenovacao.deleteMany({ where: { userId, expiraEm: { lt: agora } } })
  return refreshToken
}

// Consome o token e emite o seguinte na mesma família, numa transação só: se gravar o par novo
// falhar, o consumo desfaz e a pessoa ainda renova na próxima tentativa. Devolve null quando
// outra requisição consumiu o token primeiro.
export async function rotacionar(sessao: {
  id: string
  userId: string
  familiaId: string
  familiaIniciadaEm: Date
}): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.sessaoDeRenovacao.updateMany({
      where: { id: sessao.id, usadoEm: null, revogadoEm: null },
      data: { usadoEm: new Date() },
    })
    if (count !== 1) return null
    return emitirRefresh(tx, sessao.userId, sessao)
  })
}

export async function revogarFamilia(familiaId: string): Promise<void> {
  await prisma.sessaoDeRenovacao.updateMany({
    where: { familiaId, revogadoEm: null },
    data: { revogadoEm: new Date() },
  })
}
