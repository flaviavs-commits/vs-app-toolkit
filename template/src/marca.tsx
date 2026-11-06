import { Sparkles, type LucideIcon } from 'lucide-react'

/**
 * A marca do app: nome, uma linha de apoio e o ícone (lucide). É o único lugar que as telas de
 * entrada (login, acesso restrito) e o cabeçalho leem — troque aqui, sem mexer em src/auth/.
 */
export const MARCA: { nome: string; subtitulo: string; Icone: LucideIcon } = {
  nome: '{{APP_NAME}}',
  subtitulo: 'App do ecossistema Meu Ecoo',
  Icone: Sparkles,
}
