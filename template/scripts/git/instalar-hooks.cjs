// Liga os hooks versionados em .githooks e o pull com rebase neste clone. Roda no `npm install`
// (script prepare do package.json) e não faz nada fora de um clone git (build do Docker, Vercel)
// nem na CI. Só mexe na configuração local do repositório, nunca na global.
const { execFileSync } = require('child_process')

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function instalar() {
  if (process.env.CI) return 'CI: hooks não instalados'
  try {
    if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') return 'fora de um clone git'
  } catch {
    return 'fora de um clone git'
  }
  git(['config', '--local', 'core.hooksPath', '.githooks'])
  // "Merge branch 'main' of ..." no histórico vem de git pull sem rebase.
  git(['config', '--local', 'pull.rebase', 'true'])
  return 'hooks de .githooks ligados e pull com rebase'
}

if (require.main === module) {
  try { console.log(`git: ${instalar()}`) } catch (err) { console.warn(`git: hooks não instalados (${err.message})`) }
}

module.exports = { instalar }
