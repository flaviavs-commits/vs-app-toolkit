import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'

import { cx } from '../lib/cx'
import {
  CHAVE_TEMA,
  aparelhoNoEscuro,
  aplicarTema,
  lerPreferencia,
  proximaPreferencia,
  type PreferenciaTema,
} from '../lib/tema'

const NOME: Record<PreferenciaTema, string> = { claro: 'claro', escuro: 'escuro', sistema: 'do sistema' }

/**
 * Botão de tema: mostra a preferência atual (sol, lua ou monitor) e alterna Claro → Escuro → Sistema.
 * Em "Sistema", acompanha o aparelho com o app aberto. A cada toque, a região educada anuncia o tema
 * novo, porque o nome do botão muda sem o leitor de tela avisar.
 */
export function SeletorTema({ className }: { className?: string }) {
  const [preferencia, setPreferencia] = useState<PreferenciaTema>(() => lerPreferencia())
  const [anuncio, setAnuncio] = useState('')

  useEffect(() => {
    aplicarTema(preferencia)
    if (preferencia !== 'sistema' || typeof matchMedia !== 'function') return
    const aparelho = matchMedia('(prefers-color-scheme: dark)')
    const seguir = () => aplicarTema('sistema', { prefereEscuro: aparelhoNoEscuro() })
    aparelho.addEventListener('change', seguir)
    return () => aparelho.removeEventListener('change', seguir)
  }, [preferencia])

  function trocar() {
    const proxima = proximaPreferencia(preferencia)
    try {
      localStorage.setItem(CHAVE_TEMA, proxima)
    } catch {
      // Sem armazenamento (navegação privada): vale só nesta visita.
    }
    setPreferencia(proxima)
    setAnuncio(`Tema ${NOME[proxima]}`)
  }

  return (
    <>
      <button
        type="button"
        onClick={trocar}
        aria-label={`Tema ${NOME[preferencia]}. Trocar`}
        title={`Tema ${NOME[preferencia]}`}
        data-estado={preferencia}
        className={cx('tema', className)}
      >
        <Sun className="tema-sol" aria-hidden />
        <Moon className="tema-lua" aria-hidden />
        <Monitor className="tema-tela" aria-hidden />
      </button>
      <span className="sr-only" aria-live="polite">
        {anuncio}
      </span>
    </>
  )
}
