import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { COR_DA_BARRA } from '../lib/tema'

// Os papéis do tema vivem em src/index.css como canais RGB ("R G B"), no :root (claro) e em
// :root[data-tema="escuro"]. O teste monta as cores dos dois temas e confere o contraste mínimo
// sobre as superfícies em que cada papel aparece: texto 7:1, apoio 6:1, apagado e cores de estado
// 4,5:1, tinta sobre a marca 4,5:1 e borda de controle 3:1. Mude os valores à vontade; os mínimos, não.

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** As variáveis do primeiro bloco `<seletor> {` do index.css. */
function bloco(seletor: string): Record<string, string> {
  const inicio = css.indexOf(`${seletor} {`)
  if (inicio < 0) return {}
  const vars: Record<string, string> = {}
  for (const [, nome, valor] of css.slice(inicio, css.indexOf('}', inicio)).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[nome] = valor.trim()
  }
  return vars
}

/** "61 136 136" → "#3d8888"; o que não for três canais volta como veio (o teste acusa). */
function hex(canais: string | undefined): string {
  const partes = (canais ?? '').split(/\s+/).map(Number)
  if (partes.length !== 3 || partes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return String(canais)
  return `#${partes.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

const claro = bloco(':root')
const TEMAS = { claro, escuro: { ...claro, ...bloco(':root[data-tema="escuro"]') } }
type NomeDoTema = keyof typeof TEMAS
const cor = (tema: NomeDoTema, token: string) => hex(TEMAS[tema][token])

function luminancia(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

const PAPEIS = [
  'fundo', 'superficie', 'superficie-2', 'borda', 'borda-controle', 'texto', 'apoio', 'apagado',
  'marca', 'marca-texto', 'tinta', 'selecionado', 'sucesso', 'aviso', 'erro', 'info',
]
const SUPERFICIES = ['fundo', 'superficie', 'superficie-2']
// Papel → mínimo sobre as três superfícies.
const MINIMOS: Array<[string, number]> = [
  ['texto', 7], ['apoio', 6], ['apagado', 4.5], ['marca-texto', 4.5],
  ['sucesso', 4.5], ['aviso', 4.5], ['erro', 4.5], ['info', 4.5],
]

describe('papéis do tema (index.css)', () => {
  for (const tema of ['claro', 'escuro'] as const) {
    it(`${tema}: todos os papéis existem, em três canais RGB`, () => {
      for (const papel of PAPEIS) expect(cor(tema, papel), papel).toMatch(/^#[0-9a-f]{6}$/)
    })

    it.each(MINIMOS)(`${tema}: %s chega a %s:1 sobre fundo, superficie e superficie-2`, (token, minimo) => {
      for (const fundo of SUPERFICIES) {
        expect(contraste(cor(tema, token), cor(tema, fundo)), `${token} sobre ${fundo}`).toBeGreaterThanOrEqual(minimo)
      }
    })

    it(`${tema}: texto e apoio chegam a 4,5:1 sobre o selecionado`, () => {
      expect(contraste(cor(tema, 'texto'), cor(tema, 'selecionado'))).toBeGreaterThanOrEqual(4.5)
      expect(contraste(cor(tema, 'apoio'), cor(tema, 'selecionado'))).toBeGreaterThanOrEqual(4.5)
    })

    it(`${tema}: a tinta chega a 4,5:1 sobre a marca`, () => {
      expect(contraste(cor(tema, 'tinta'), cor(tema, 'marca'))).toBeGreaterThanOrEqual(4.5)
    })

    it(`${tema}: a borda de controle chega a 3:1 sobre fundo e superficie`, () => {
      expect(contraste(cor(tema, 'borda-controle'), cor(tema, 'fundo'))).toBeGreaterThanOrEqual(3)
      expect(contraste(cor(tema, 'borda-controle'), cor(tema, 'superficie'))).toBeGreaterThanOrEqual(3)
    })

    it(`${tema}: a cor da barra do navegador é o fundo`, () => {
      expect(COR_DA_BARRA[tema]).toBe(cor(tema, 'fundo'))
    })
  }

  it('escuro: o selecionado é mais claro que a superfície (o destaque não afunda no cartão)', () => {
    expect(luminancia(cor('escuro', 'selecionado'))).toBeGreaterThan(luminancia(cor('escuro', 'superficie')))
  })

  it('claro: a superfície é mais clara que o fundo (o cartão se destaca)', () => {
    expect(luminancia(cor('claro', 'superficie'))).toBeGreaterThanOrEqual(luminancia(cor('claro', 'fundo')))
  })
})
