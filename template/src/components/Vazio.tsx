import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Estado vazio: ícone discreto, título curto e uma saída. */
export function Vazio({
  Icone,
  titulo,
  descricao,
  acao,
}: {
  Icone: LucideIcon
  titulo: string
  descricao?: string
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-selecionado text-marca-texto" aria-hidden>
        <Icone className="h-6 w-6" />
      </span>
      <p className="text-base font-semibold">{titulo}</p>
      {descricao ? <p className="max-w-sm text-sm text-apoio">{descricao}</p> : null}
      {acao ? <div className="mt-2">{acao}</div> : null}
    </div>
  )
}
