// Política de versionamento (docs/VERSIONAMENTO.md): formato das mensagens de commit.
// Roda com `node --test scripts/git/validar-commit-test.cjs` (sem dependências; o nome não casa com o do
// vitest/jest do projeto, para eles não tentarem rodar este arquivo).
const test = require('node:test')
const assert = require('node:assert/strict')
const { validarMensagem, TIPOS } = require('./validar-commit.cjs')

const ACEITAS = [
  'feat(afiliados): faixas de uso grátis por membros ativos',
  'fix: corrige o link da landing',
  'docs(ia): registra a conclusão das migrations',
  'feat(afiliados,assinatura): programa de afiliados e cancelamento da renovação',
  'refactor(http)!: troca o cliente da Stripe',
  'perf(landing): a coruja da página pronta conta como maior pintura',
  'ci(deploy): só o CI publica o site',
  'build(deps): atualiza o vite',
  'chore(deps-dev): atualiza o eslint',
]
for (const mensagem of ACEITAS) {
  test(`aceita "${mensagem}"`, () => {
    const r = validarMensagem(mensagem)
    assert.equal(r.ok, true)
  })
}

const RECUSADAS = [
  ['infra: config da API sai do railway.toml', /tipo\(escopo\): descrição/],
  ['update', /tipo\(escopo\): descrição/],
  ['Feat: maiúscula no tipo', /tipo\(escopo\): descrição/],
  ['feat(Afiliados): escopo com maiúscula', /tipo\(escopo\): descrição/],
  ['fix:sem espaço depois dos dois pontos', /tipo\(escopo\): descrição/],
  ['merge: traz a main para a branch', /tipo\(escopo\): descrição/],
  [`feat: ${'muito texto '.repeat(12)}`, /máximo 120/],
  ['', /vazia/],
]
for (const [mensagem, motivo] of RECUSADAS) {
  test(`recusa "${mensagem.slice(0, 40)}"`, () => {
    const r = validarMensagem(mensagem)
    assert.equal(r.ok, false)
    assert.match(r.motivo, motivo)
  })
}

test('mensagens que o próprio git gera passam (merge, revert, fixup)', () => {
  for (const m of ["Merge branch 'main' of github.com:x/y", 'Revert "feat: algo"', 'fixup! feat: algo', 'squash! fix: algo']) {
    assert.equal(validarMensagem(m).ok, true, m)
  }
})

test('só olha a primeira linha e ignora comentários do git', () => {
  assert.equal(validarMensagem('# comentário\nfix(api): corrige o timeout\n\nCorpo livre, sem formato.').ok, true)
})

test('avisa, sem bloquear, quando a descrição parece não estar em português', () => {
  const r = validarMensagem('fix(api): zzz qqq')
  assert.equal(r.ok, true)
  assert.deepEqual(r.avisos, ['a descrição parece não estar em português'])
})

test('os tipos aceitos são os da política', () => {
  assert.deepEqual(TIPOS, ['feat', 'fix', 'docs', 'test', 'refactor', 'chore', 'build', 'ci', 'perf', 'style', 'revert'])
})
