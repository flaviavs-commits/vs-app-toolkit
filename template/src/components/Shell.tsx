import type { ReactNode } from 'react'
import { Download, LogOut, type LucideIcon } from 'lucide-react'

import { useAuth } from '../auth/AuthContext'
import { baixarMeusDados } from '../lib/armazenamento'
import { cx } from '../lib/cx'
import { MARCA } from '../marca'
import { SeletorTema } from './SeletorTema'

export interface Aba<T extends string> {
  id: T
  rotulo: string
  Icone: LucideIcon
}

/**
 * Estrutura comum dos apps: cabeçalho com a marca, tema, "Baixar meus dados" e "Sair"; abas em faixa
 * (rolável no celular) com a ativa anunciada por aria-current; <main> com o conteúdo; rodapé opcional.
 * Cada app define só a marca (src/marca.tsx), as abas e o conteúdo.
 */
export function Shell<T extends string>({
  abas,
  abaAtiva,
  onTrocarAba,
  largura = 'max-w-3xl',
  rodape,
  children,
}: {
  abas?: Array<Aba<T>>
  abaAtiva?: T
  onTrocarAba?: (aba: T) => void
  /** Largura máxima do <main> (classe do Tailwind). */
  largura?: string
  rodape?: ReactNode
  children: ReactNode
}) {
  const { user, logout } = useAuth()
  const { nome, subtitulo, Icone } = MARCA

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-marca px-3 py-2 text-sm font-medium text-tinta focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
      >
        Pular para o conteúdo
      </a>

      <header className="border-b border-borda bg-superficie/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 pt-3 pb-2">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-selecionado text-marca-texto" aria-hidden>
              <Icone className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold leading-tight">{nome}</p>
              <p className="truncate text-xs text-apagado">{subtitulo}</p>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <SeletorTema />
              <button
                type="button"
                onClick={baixarMeusDados}
                title="Baixar meus dados (JSON)"
                aria-label="Baixar meus dados"
                className="grid h-11 w-11 place-items-center rounded-xl text-apoio transition-colors hover:bg-selecionado hover:text-texto"
              >
                <Download className="h-[1.125rem] w-[1.125rem]" aria-hidden />
              </button>
              <button
                type="button"
                onClick={logout}
                title={user?.nome ? `Sair (${user.nome})` : 'Sair'}
                className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-apoio transition-colors hover:bg-selecionado hover:text-texto"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Sair</span>
                <span className="sr-only sm:hidden">Sair</span>
              </button>
            </div>
          </div>

          {abas && abas.length > 0 ? (
            <nav aria-label="Áreas do app" className="-mx-4 overflow-x-auto px-4">
              <ul className="flex gap-1 pb-1">
                {abas.map((aba) => {
                  const ativa = aba.id === abaAtiva
                  return (
                    <li key={aba.id} className="flex-none">
                      <button
                        type="button"
                        aria-current={ativa ? 'page' : undefined}
                        onClick={() => onTrocarAba?.(aba.id)}
                        className={cx(
                          'flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-sm font-medium transition-colors',
                          ativa ? 'bg-selecionado text-texto' : 'text-apoio hover:bg-selecionado/60 hover:text-texto',
                        )}
                      >
                        <aba.Icone className="h-4 w-4" aria-hidden />
                        {aba.rotulo}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>
          ) : null}
        </div>
      </header>

      <main id="conteudo" tabIndex={-1} className={cx('mx-auto w-full flex-1 px-4 py-6', largura)}>
        {children}
      </main>

      {rodape}
    </div>
  )
}
