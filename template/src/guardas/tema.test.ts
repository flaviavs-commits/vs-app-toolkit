import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// O escuro só funciona se toda cor vier dos papéis (src/index.css). Cor fixa do Tailwind (slate-500,
// white…) ou hex solto num componente fica igual nos dois temas e quebra o contraste. src/data/** fica
// de fora: lá mora conteúdo, não interface.
const PALETA_TAILWIND =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const PROIBIDAS: Array<[RegExp, string]> = [
  [new RegExp(`(?<![\\w-])(?:bg|text|border|ring|from|to|via|fill|stroke|placeholder|outline|decoration|divide|shadow)-(?:${PALETA_TAILWIND})-\\d{2,3}(?![\\w-])`), 'cor fixa do Tailwind (use um papel: marca, apoio, erro…)'],
  [/(?<![\w-])(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:white|black)(?![\w-])/, 'white/black (use superficie, texto ou tinta)'],
  [/(?:color|background(?:Color)?|borderColor|fill|stroke)\s*:\s*['"]#[0-9a-fA-F]{3,8}['"]/, 'hex em style (use rgb(var(--papel)))'],
]

/** As ocorrências proibidas de um arquivo, como "arquivo:linha motivo". */
function usosQuebrados(fonte: string, arquivo = 'autoteste.tsx'): string[] {
  return fonte.split(/\r?\n/).flatMap((linha, i) =>
    PROIBIDAS.filter(([padrao]) => padrao.test(linha)).map(([, motivo]) => `${arquivo}:${i + 1} ${motivo}`),
  )
}

const fontes = readdirSync(resolve(process.cwd(), 'src'), { recursive: true })
  .map((a) => String(a).split('\\').join('/'))
  .filter((a) => /\.tsx?$/.test(a) && !/\.test\.tsx?$/.test(a) && !a.startsWith('data/'))
  .map((a) => join('src', a).split('\\').join('/'))

describe('cores só pelos papéis do tema', () => {
  it('acha cada uso proibido, com arquivo e linha (autoteste)', () => {
    const fonte = [
      '<div className="bg-slate-900 hover:text-blue-500" />',
      '<p className="text-white" />',
      '<div style={{ color: "#fff" }} />',
      '<div className="bg-superficie/70 text-tinta text-marca-texto border-borda-controle" />',
      '<path fill="#4285F4" d="M1 1" />',
    ].join('\n')
    expect(usosQuebrados(fonte)).toEqual([
      'autoteste.tsx:1 cor fixa do Tailwind (use um papel: marca, apoio, erro…)',
      'autoteste.tsx:2 white/black (use superficie, texto ou tinta)',
      'autoteste.tsx:3 hex em style (use rgb(var(--papel)))',
    ])
  })

  it('nenhum arquivo de src/ (fora src/data) usa cor fixa', () => {
    expect(fontes.length, 'nenhum arquivo lido em src/').toBeGreaterThan(0)
    expect(fontes.flatMap((arquivo) => usosQuebrados(readFileSync(resolve(process.cwd(), arquivo), 'utf8'), arquivo))).toEqual([])
  })
})
