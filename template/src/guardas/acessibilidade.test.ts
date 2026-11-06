import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guardas do padrão visual dos apps (foco visível, alvos e bordas de campo, texto ≥ 12 px), conferidas
// nas fontes: todo .tsx de src/ fora os testes.
const ler = (arquivo: string) => readFileSync(resolve(process.cwd(), arquivo), 'utf8')
const fontes = readdirSync(resolve(process.cwd(), 'src'), { recursive: true })
  .map(String)
  .filter((a) => a.endsWith('.tsx') && !a.endsWith('.test.tsx'))
  .map((a) => join('src', a).split('\\').join('/'))

type Controle = { linha: number; tag: string; texto: string }

/** As tags de abertura dos controles nativos (a, button, input, select, textarea) de um .tsx, com as constantes que citam. */
function controles(fonte: string): Controle[] {
  // Uma constante vai da declaração (com ou sem tipo) até a primeira linha em branco.
  const constantes = new Map([...fonte.matchAll(/const (\w+)(?::[^=\n]+)? =([\s\S]*?)\n\)?\s*\n/g)].map((m): [string, string] => [m[1], m[2]]))
  return [...fonte.matchAll(/<(a|button|input|select|textarea)\b/g)].map((m) => {
    const inicio = m.index ?? 0
    let i = inicio + m[0].length
    let chaves = 0
    let aspas = ''
    for (; i < fonte.length; i++) {
      const c = fonte[i]
      if (aspas) {
        if (c === aspas) aspas = ''
      } else if (c === '"' || c === "'" || c === '`') aspas = c
      else if (c === '{') chaves++
      else if (c === '}') chaves--
      else if (c === '>' && chaves === 0) break
    }
    const tag = fonte.slice(inicio, i + 1)
    const citadas = [...new Set(tag.match(/\w+/g) ?? [])].filter((n) => constantes.has(n)).map((n) => constantes.get(n))
    return { linha: fonte.slice(0, inicio).split('\n').length, tag: m[1], texto: [tag, ...citadas].join('\n') }
  })
}

/** O foco é o anel global do index.css (:focus-visible); ninguém pode apagá-lo. */
function semFoco(fonte: string, arquivo = 'autoteste.tsx'): string[] {
  return fonte.split(/\r?\n/).flatMap((linha, i) =>
    /(?<![\w-])(?:focus(?:-visible|-within)?:)?(?:outline-none|outline-0|ring-0)(?![\w-])/.test(linha) ? [`${arquivo}:${i + 1} apaga o anel de foco`] : [],
  )
}

/** Campos e botões de contorno com a borda de divisória (border-borda), abaixo de 3:1: use border-borda-controle. */
function bordasFracas(fonte: string, arquivo = 'autoteste.tsx'): string[] {
  return controles(fonte)
    .filter((c) => c.tag !== 'a' && /(?<![\w:/-])border-borda(?![\w-])/.test(c.texto))
    .map((c) => `${arquivo}:${c.linha} <${c.tag}> com border-borda (use border-borda-controle)`)
}

/** Texto abaixo de 12 px: text-[Npx], text-[Nrem] e text-[Nem] (em sobre 14 px). */
function textosPequenos(fonte: string, arquivo = 'autoteste.tsx'): string[] {
  return fonte.split(/\r?\n/).flatMap((linha, i) =>
    [...linha.matchAll(/text-\[(\d*\.?\d+)(px|em|rem)\]/g)]
      .filter(([, n, unidade]) => Number(n) * (unidade === 'px' ? 1 : unidade === 'em' ? 14 : 16) < 12)
      .map(([classe]) => `${arquivo}:${i + 1} ${classe}`),
  )
}

/** Botões e links de ação sem altura mínima de 44 px (h-11+, min-h-11+, h-full ou py-3+). */
function alvosBaixos(fonte: string, arquivo = 'autoteste.tsx'): string[] {
  return controles(fonte)
    .filter((c) => c.tag === 'button' && !/tabIndex=\{-1\}/.test(c.texto))
    .filter((c) => !/(?<![\w:-])(?:min-)?h-(?:1[1-9]|[2-9]\d|full|\[(?:4[4-9]|[5-9]\d)px\])(?![\w-])|(?<![\w:-])py-(?:[3-9]|\d\d)(?![\w-])|className=\{[^}]*\b(?:tema|botao-)\w*/.test(c.texto))
    .map((c) => `${arquivo}:${c.linha} <button> sem alvo de 44 px (h-11, min-h-11 ou py-3)`)
}

const emTodas = (achar: (fonte: string, arquivo: string) => string[]) => fontes.flatMap((a) => achar(ler(a), a))

describe('foco visível (o anel global não pode ser apagado)', () => {
  it('acha quem apaga o anel (autoteste)', () => {
    const fonte = ['<button className="focus:outline-none ring-2" />', '<input className="outline-none" />', '<a className="focus-visible:ring-2" />'].join('\n')
    expect(semFoco(fonte)).toEqual(['autoteste.tsx:1 apaga o anel de foco', 'autoteste.tsx:2 apaga o anel de foco'])
  })

  it('nenhum arquivo de src/ apaga o anel de foco', () => {
    expect(fontes.length, 'nenhum arquivo lido em src/').toBeGreaterThan(0)
    expect(emTodas(semFoco)).toEqual([])
  })

  it('o que aparece no hover aparece também com o foco do teclado', () => {
    const escondidas = emTodas((fonte, arquivo) =>
      fonte.split(/\r?\n/).flatMap((linha, i) =>
        /group-hover:opacity-100/.test(linha) && !/group-focus-within:opacity-100/.test(linha) ? [`${arquivo}:${i + 1}`] : [],
      ),
    )
    expect(escondidas).toEqual([])
  })
})

describe('bordas de campo ≥ 3:1', () => {
  it('acha o campo de borda fraca (autoteste)', () => {
    const fonte = ['<input className="border border-borda" />', '<select className="border border-borda-controle" />', '<a className="border-borda" />'].join('\n')
    expect(bordasFracas(fonte)).toEqual(['autoteste.tsx:1 <input> com border-borda (use border-borda-controle)'])
  })

  it('nenhum campo de src/ tem borda abaixo de 3:1', () => {
    expect(emTodas(bordasFracas)).toEqual([])
  })
})

describe('texto ≥ 12 px', () => {
  it('acha o texto abaixo de 12 px (autoteste)', () => {
    expect(textosPequenos('<p className="text-[11px]" /><p className="text-xs text-[12px]" /><i className="text-[0.85em]" />')).toEqual([
      'autoteste.tsx:1 text-[11px]',
      'autoteste.tsx:1 text-[0.85em]',
    ])
  })

  it('nenhum texto de src/ nem do index.css fica abaixo de 12 px', () => {
    expect([...emTodas(textosPequenos), ...textosPequenos(ler('src/index.css'), 'src/index.css')]).toEqual([])
  })
})

describe('alvos de toque ≥ 44 px', () => {
  it('acha o botão baixo (autoteste)', () => {
    const fonte = ['<button className="h-8 px-2">x</button>', '<button className="h-11 px-3">ok</button>', '<button className="py-3">ok</button>', '<button className={cx("tema", x)} />'].join('\n')
    expect(alvosBaixos(fonte)).toEqual(['autoteste.tsx:1 <button> sem alvo de 44 px (h-11, min-h-11 ou py-3)'])
  })

  it('todo botão de src/ tem alvo de 44 px', () => {
    expect(emTodas(alvosBaixos)).toEqual([])
  })
})
