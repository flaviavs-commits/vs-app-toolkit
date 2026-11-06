import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Movimento reduzido: o fade-in das telas some, todo giro para e a rolagem suave só vale sem o pedido.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const fontes = readdirSync(resolve(process.cwd(), 'src'), { recursive: true })
  .map(String)
  .filter((a) => a.endsWith('.tsx') && !a.endsWith('.test.tsx'))
  .map((a) => join('src', a).split('\\').join('/'))

/** O corpo de cada @media (prefers-reduced-motion: reduce) { … } (um nível de chaves dentro). */
function blocosReduzidos(texto: string): string[] {
  return [...texto.matchAll(/@media \(prefers-reduced-motion: reduce\) \{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)].map((m) => m[1])
}

describe('movimento reduzido', () => {
  it('acha a regra do fade-in num bloco de movimento reduzido (autoteste)', () => {
    const bom = '@media (prefers-reduced-motion: reduce) {\n  .animate-fade-in { animation: none; }\n}'
    expect(blocosReduzidos(bom).some((b) => /\.animate-fade-in\s*\{[^}]*animation:\s*none/.test(b))).toBe(true)
    expect(blocosReduzidos('.animate-fade-in { animation: none; }')).toEqual([])
  })

  it('o fade-in das telas desliga com movimento reduzido', () => {
    expect(blocosReduzidos(css).some((b) => /\.animate-fade-in\s*\{[^}]*animation:\s*none/.test(b))).toBe(true)
  })

  it('todo animate-spin e animate-pulse para com movimento reduzido (motion-reduce:animate-none)', () => {
    const giros = fontes.flatMap((arquivo) =>
      readFileSync(resolve(process.cwd(), arquivo), 'utf8')
        .split(/\r?\n/)
        .flatMap((linha, i) =>
          /(?<![\w:-])animate-(?:spin|pulse|bounce|ping)(?![\w-])/.test(linha) && !/motion-reduce:animate-none/.test(linha) ? [`${arquivo}:${i + 1}`] : [],
        ),
    )
    expect(giros).toEqual([])
  })

  it('a rolagem suave só vale sem o pedido de movimento reduzido', () => {
    const semPreferencia = /@media \(prefers-reduced-motion: no-preference\) \{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g
    expect(css.replace(semPreferencia, '')).not.toMatch(/scroll-behavior:\s*smooth/)
  })

  it('transições de interface ficam entre 100 e 420 ms', () => {
    const duracoes = [...css.matchAll(/transition[^;]*?(\d+)ms/g)].map((m) => Number(m[1]))
    expect(duracoes.length).toBeGreaterThan(0)
    expect(duracoes.filter((d) => d < 100 || d > 420)).toEqual([])
  })
})
