import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Os ícones de interface são lucide, não emoji (o emoji muda de sistema para sistema e o leitor de
// tela lê o nome dele). src/data/** fica de fora: lá mora conteúdo, que pode ter emoji.
const EMOJI = /\p{Extended_Pictographic}/u

/** As linhas com emoji de um arquivo, como "arquivo:linha". */
function emojis(fonte: string, arquivo = 'autoteste.tsx'): string[] {
  return fonte.split(/\r?\n/).flatMap((linha, i) => (EMOJI.test(linha) ? [`${arquivo}:${i + 1}`] : []))
}

const fontes = readdirSync(resolve(process.cwd(), 'src'), { recursive: true })
  .map((a) => String(a).split('\\').join('/'))
  .filter((a) => a.endsWith('.tsx') && !a.endsWith('.test.tsx') && !a.startsWith('data/'))
  .map((a) => join('src', a).split('\\').join('/'))

describe('sem emoji de interface', () => {
  it('acha emoji num componente, com arquivo e linha (autoteste)', () => {
    expect(emojis(['<span>🗑 Apagar</span>', '<Trash2 aria-hidden />', '<CardTitle icon="📅" />'].join('\n'))).toEqual([
      'autoteste.tsx:1',
      'autoteste.tsx:3',
    ])
  })

  it('nenhum .tsx de src/ (fora src/data) tem emoji', () => {
    expect(fontes.length, 'nenhum .tsx lido em src/').toBeGreaterThan(0)
    expect(fontes.flatMap((arquivo) => emojis(readFileSync(resolve(process.cwd(), arquivo), 'utf8'), arquivo))).toEqual([])
  })
})
