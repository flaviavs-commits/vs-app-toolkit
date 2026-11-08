#!/usr/bin/env node
// Confere a mensagem de commit contra a política de versionamento (docs/VERSIONAMENTO.md):
// primeira linha no formato `tipo(escopo): descrição`, com um dos tipos aceitos.
//
// Usos:
//   node scripts/git/validar-commit.cjs <arquivo>    hook commit-msg (.githooks/commit-msg)
//   node scripts/git/validar-commit.cjs --intervalo <de>..<até>   CI: confere os commits de um push
//
// Mensagens que o próprio git gera (merge, revert, fixup!/squash! locais) passam. O idioma não
// bloqueia: detectar português por regra erra, então só avisa.
const fs = require('fs')
const { execFileSync } = require('child_process')

const TIPOS = ['feat', 'fix', 'docs', 'test', 'refactor', 'chore', 'build', 'ci', 'perf', 'style', 'revert']
const FORMATO = new RegExp(`^(${TIPOS.join('|')})(\\([a-z0-9][a-z0-9-]*(,[a-z0-9][a-z0-9-]*)*\\))?!?: \\S`)
const GERADAS_PELO_GIT = /^(Merge (branch|pull request|remote-tracking branch) |Revert "|fixup! |squash! |amend! )/
const MARCAS_DE_PORTUGUES = /[áàâãéêíóôõúç]|\b(de|do|da|dos|das|no|na|em|para|com|sem|que|o|a|os|as|e|ao|pelo|pela)\b/i
const TAMANHO_MAXIMO = 120

function validarMensagem(mensagem) {
  const primeira = String(mensagem || '').split('\n').find(linha => linha.trim() && !linha.startsWith('#')) || ''
  if (!primeira.trim()) return { ok: false, motivo: 'mensagem vazia' }
  if (GERADAS_PELO_GIT.test(primeira)) return { ok: true, avisos: [] }
  if (!FORMATO.test(primeira)) {
    return { ok: false, motivo: `a primeira linha precisa ser "tipo(escopo): descrição", com tipo entre ${TIPOS.join(', ')}` }
  }
  if (primeira.length > TAMANHO_MAXIMO) return { ok: false, motivo: `a primeira linha tem ${primeira.length} caracteres (máximo ${TAMANHO_MAXIMO})` }
  const descricao = primeira.slice(primeira.indexOf(': ') + 2)
  const avisos = MARCAS_DE_PORTUGUES.test(descricao) ? [] : ['a descrição parece não estar em português']
  return { ok: true, avisos }
}

function mensagensDoIntervalo(intervalo) {
  const saida = execFileSync('git', ['log', '--format=%H%x1f%B%x1e', intervalo], { encoding: 'utf8' })
  return saida.split('\x1e').map(bloco => bloco.trim()).filter(Boolean).map(bloco => {
    const [sha, corpo] = bloco.split('\x1f')
    return { sha: sha.slice(0, 7), mensagem: corpo }
  })
}

function main(argv) {
  if (argv[0] === '--intervalo') {
    const commits = mensagensDoIntervalo(argv[1])
    const ruins = commits.map(c => ({ ...c, ...validarMensagem(c.mensagem) })).filter(c => !c.ok)
    for (const c of ruins) console.error(`${c.sha} ${c.mensagem.split('\n')[0]}\n   → ${c.motivo}`)
    console.log(`${commits.length - ruins.length} de ${commits.length} commit(s) no formato da política (docs/VERSIONAMENTO.md)`)
    return ruins.length ? 1 : 0
  }
  const resultado = validarMensagem(fs.readFileSync(argv[0], 'utf8'))
  for (const aviso of resultado.avisos || []) console.warn(`aviso: ${aviso}`)
  if (!resultado.ok) {
    console.error(`commit recusado: ${resultado.motivo}.\nExemplo: "fix(agendador): não repete o post quando a Zernio responde 503". Veja docs/VERSIONAMENTO.md.`)
    return 1
  }
  return 0
}

if (require.main === module) process.exit(main(process.argv.slice(2)))

module.exports = { validarMensagem, TIPOS }
