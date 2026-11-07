// Confere um Mini App no ar, de verdade: CSP em bloqueio sem violação, CORS com a API do Railway, tema, abas.
// Não grava nada no servidor: o login usa credencial falsa e a sessão da parte logada é simulada no navegador
// (a API real só conhece o app depois que o Meu Ecoo aceita o token dele).
//
// Uso:  node scripts/verificar-producao.cjs <slug> <url-do-front> <url-da-api> [pasta-de-capturas]
// Requer playwright-core (npm i -D playwright-core, ou PLAYWRIGHT_CORE=<caminho do módulo>) e o Edge
// instalado (canal "msedge"; troque por "chrome" com CANAL=chrome).
const fs = require('node:fs')
const path = require('node:path')

function playwright() {
  try {
    return require('playwright-core')
  } catch {
    if (process.env.PLAYWRIGHT_CORE) return require(process.env.PLAYWRIGHT_CORE)
    throw new Error('playwright-core não encontrado: npm i -D playwright-core ou defina PLAYWRIGHT_CORE')
  }
}

const [, , slug, url, api, saida = path.join(process.cwd(), 'capturas-producao')] = process.argv
if (!slug || !url || !api) {
  console.error('uso: node scripts/verificar-producao.cjs <slug> <url-do-front> <url-da-api> [pasta-de-capturas]')
  process.exit(2)
}
const origem = new URL(url).origin
const cors = {
  'access-control-allow-origin': origem,
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}

async function main() {
  const { chromium } = playwright()
  fs.mkdirSync(saida, { recursive: true })
  const navegador = await chromium.launch({ channel: process.env.CANAL || 'msedge', headless: true })
  const achados = []
  const ok = (cond, texto) => achados.push({ ok: !!cond, texto })
  try {
    for (const tema of ['claro', 'escuro']) {
      const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' })
      await ctx.addInitScript(({ slug, tema }) => {
        window.__csp = []
        document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ← ${e.blockedURI}`))
        try {
          if (!sessionStorage.getItem('__limpo')) {
            localStorage.clear()
            sessionStorage.setItem('__limpo', '1')
          }
          localStorage.setItem(`${slug}:tema`, tema)
        } catch {}
      }, { slug, tema })
      const pagina = await ctx.newPage()
      const erros = []
      pagina.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
      pagina.on('pageerror', (e) => erros.push(String(e)))

      // 1) Entrada, com a API de verdade: credencial falsa deve voltar um erro da API (não de CORS nem de CSP).
      await pagina.goto(url, { waitUntil: 'networkidle' })
      const info = await pagina.evaluate(() => ({
        tema: document.documentElement.getAttribute('data-tema'),
        rolagem: document.documentElement.scrollWidth > window.innerWidth,
      }))
      ok(info.tema === tema, `${tema}: data-tema aplicado antes da pintura (${info.tema})`)
      ok(!info.rolagem, `${tema}: sem rolagem lateral na entrada`)
      await pagina.screenshot({ path: path.join(saida, `${slug}-entrada-${tema}.png`) })
      if (tema === 'claro') {
        await pagina.fill('#email', 'teste@exemplo.com')
        await pagina.fill('#senha', 'senha-falsa')
        await pagina.click('button[type=submit]')
        const alerta = await pagina.waitForSelector('[role=alert]', { timeout: 25000 }).catch(() => null)
        const texto = alerta ? (await alerta.innerText()).trim() : ''
        ok(alerta, `login falso mostra o erro da API na tela (“${texto.slice(0, 70)}”)`)
        ok(!erros.some((e) => /CORS|blocked by CORS|Access-Control/i.test(e)), 'sem erro de CORS na chamada à API')
      }

      // 2) Parte logada com sessão simulada.
      await ctx.route(`${api}/api/**`, (rota) => {
        if (rota.request().method() === 'OPTIONS') return rota.fulfill({ status: 204, headers: cors })
        if (rota.request().url().endsWith('/api/auth/me'))
          return rota.fulfill({ headers: cors, json: { id: '1', email: 'ana@exemplo.com', nome: 'Ana', isMember: true, memberUntil: '2027-12-31' } })
        return rota.fulfill({ status: 204, headers: cors, body: '' })
      })
      await pagina.evaluate((slug) => localStorage.setItem(`${slug}_token`, 'jwt-de-teste'), slug)
      await pagina.reload({ waitUntil: 'networkidle' })
      await pagina.waitForSelector('nav[aria-label="Áreas do app"]', { timeout: 20000 }).catch(() => null)
      const abas = pagina.locator('nav[aria-label="Áreas do app"] button')
      const n = await abas.count()
      ok(n >= 2, `${tema}: app logado abre com ${n} abas`)
      for (let i = 0; i < n; i += 1) {
        await abas.nth(i).click()
        await pagina.waitForTimeout(250)
      }
      await pagina.screenshot({ path: path.join(saida, `${slug}-app-${tema}.png`), fullPage: true })

      const violacoes = await pagina.evaluate(() => window.__csp)
      ok(violacoes.length === 0, `${tema}: nenhuma violação da CSP${violacoes.length ? ' → ' + violacoes.join(' | ') : ''}`)
      const errosReais = erros.filter((e) => !/Failed to load resource.*(204|401|502)/i.test(e) && !/status of (401|502)/.test(e))
      ok(errosReais.length === 0, `${tema}: sem erro de console${errosReais.length ? ' → ' + errosReais.slice(0, 3).map((e) => e.slice(0, 200)).join(' | ') : ''}`)
      await ctx.close()
    }
  } finally {
    await navegador.close()
  }
  for (const a of achados) console.log(`${a.ok ? 'ok   ' : 'FALHA'} ${a.texto}`)
  console.log(achados.every((a) => a.ok) ? 'TUDO OK' : 'HÁ FALHAS')
  process.exitCode = achados.every((a) => a.ok) ? 0 : 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
