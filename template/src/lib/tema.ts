/**
 * Tema do app: claro (padrão), escuro ou sistema. A escolha é do aparelho, não da conta: fica no
 * localStorage e vai para o <html> como data-tema, com o colorScheme e a theme-color da barra do
 * navegador. O public/tema-inicial.js faz o mesmo antes da primeira pintura; tema.test.ts
 * confere que os dois concordam e que as cores da barra são o --fundo de cada tema (index.css).
 */
export type PreferenciaTema = 'claro' | 'escuro' | 'sistema'
export type Tema = 'claro' | 'escuro'

export const CHAVE_TEMA = '{{APP_SLUG}}:tema'

const ORDEM: PreferenciaTema[] = ['claro', 'escuro', 'sistema']
/** O fundo de cada tema, para a barra do navegador acompanhar. Mantenha igual ao --fundo do index.css. */
export const COR_DA_BARRA: Record<Tema, string> = { claro: '#f6f6f4', escuro: '#141412' }

/** A preferência salva; sem nada salvo, com valor inválido ou sem acesso ao armazenamento, claro. */
export function lerPreferencia(storage?: Storage): PreferenciaTema {
  try {
    const valor = (storage ?? localStorage).getItem(CHAVE_TEMA)
    return valor === 'escuro' || valor === 'sistema' ? valor : 'claro'
  } catch {
    return 'claro'
  }
}

export function temaEfetivo(pref: PreferenciaTema, prefereEscuro: boolean): Tema {
  if (pref === 'sistema') return prefereEscuro ? 'escuro' : 'claro'
  return pref
}

/** O seletor alterna Claro → Escuro → Sistema → Claro. */
export function proximaPreferencia(pref: PreferenciaTema): PreferenciaTema {
  return ORDEM[(ORDEM.indexOf(pref) + 1) % ORDEM.length]
}

export function aparelhoNoEscuro(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

export function aplicarTema(pref: PreferenciaTema, opts: { doc?: Document; prefereEscuro?: boolean } = {}): void {
  const doc = opts.doc ?? document
  const tema = temaEfetivo(pref, opts.prefereEscuro ?? aparelhoNoEscuro())
  doc.documentElement.setAttribute('data-tema', tema)
  doc.documentElement.style.colorScheme = tema === 'escuro' ? 'dark' : 'light'
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = COR_DA_BARRA[tema]
}
