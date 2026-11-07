# 🚀 Publicar um Mini App novo

> **O que é**: o caminho de um app gerado pelo toolkit até aparecer no catálogo do Meu Ecoo, com o que
> funcionou de verdade na publicação dos quatro apps de 06/11/2026.
>
> **Quando usar**: ao publicar um app novo gerado por `create-vs-app.py`.
>
> **Regra de ouro**: nenhum segredo passa por tela, chat, e-mail ou arquivo versionado. Os valores são
> gerados e movidos por pipe (`node -e … | railway variable set … --stdin`), e a conferência mostra só
> nome, tamanho e igualdade.

---

## Os quatro apps de 06/11/2026

| App | Slug / id | Área | Repositório (privado) | Front (Vercel) | API (Railway) | Fonte |
| --- | --- | --- | --- | --- | --- | --- |
| Meu Foco | `meu-foco` | Foco e disciplina | [`AndreGustavoms/meu-foco`](https://github.com/AndreGustavoms/meu-foco) | `meu-foco-app.vercel.app` | `meu-foco-backend-production.up.railway.app` | Inter |
| Comunicação Clara | `comunicacao-clara` | Comunicação | [`AndreGustavoms/comunicacao-clara`](https://github.com/AndreGustavoms/comunicacao-clara) | `comunicacao-clara.vercel.app` | `comunicacao-clara-backend-production.up.railway.app` | Manrope |
| Minha Carreira | `minha-carreira` | Carreira | [`AndreGustavoms/minha-carreira`](https://github.com/AndreGustavoms/minha-carreira) | `minha-carreira.vercel.app` | `minha-carreira-backend-production.up.railway.app` | Figtree |
| Meu Sono | `meu-sono` | Saúde e bem-estar | [`AndreGustavoms/meu-sono`](https://github.com/AndreGustavoms/meu-sono) | `meu-sono-app.vercel.app` | `meu-sono-backend-production.up.railway.app` | Nunito |

`meu-foco.vercel.app` e `meu-sono.vercel.app` já eram de terceiros: o projeto da Vercel leva o sufixo
`-app`. Confira o nome antes (`curl -I https://<nome>.vercel.app`: `404 DEPLOYMENT_NOT_FOUND` = livre).

Descrições para o catálogo (uma linha, no tom das existentes):

- **Meu Foco** — Blocos de foco com intenção, lista do dia e sequência: faça uma coisa de cada vez.
- **Comunicação Clara** — Treine a fala com tema e tempo, veja muletas e ritmo, e evolua a cada semana.
- **Minha Carreira** — Objetivos com resultados-chave, competências e a revisão da semana, num lugar só.
- **Meu Sono** — Registre as noites, siga a rotina de desligar e ganhe regularidade de horário.

## Estado em 07/11/2026

- Repositórios, Railway, Vercel e Firebase: **prontos e conferidos no ar** (CSP sem violação, CORS com a
  API, relógio do Meu Foco sob a CSP, `/health` 200, tabelas criadas).
- Falta o **Meu Ecoo conhecer os tokens** (§5): branch `feat/mini-apps-novos-login-parceiro` do MeuEcoo
  (pedida ao Felipe por e-mail em 07/11) e as quatro variáveis `PARTNER_LOGIN_*_TOKEN` já criadas no
  `meuecoo-api` **sem deploy**. Até o merge e o deploy, o login responde "erro de configuração" (502).
- Falta o **catálogo** (§6), que só deve entrar depois que o login funcionar.

## 1. Repositório

1. `gh repo create <dono>/<slug> --private --source . --remote origin` (**sem** `--push`) e depois
   `git push -u origin main`. O app traz `.github/workflows/` e o GitHub recusa o envio de um token sem o
   escopo `workflow` (o do `gh` desta máquina não tem); o `git push` usa o Git Credential Manager, que tem.
2. O hook `.githooks/pre-commit` roda `scripts/public_repo_guard.py` e acha o Python no Windows
   (`python3`, `python` ou `py`); o workflow `public-repo-guard.yml` repete a checagem no GitHub.

## 2. Backend (Railway, CLI 5.x)

Um projeto por app, na conta `projeto-ecoVS`: **Postgres + serviço `<slug>-backend`**. O roteiro que
funcionou, na ordem:

1. Exporte o commit sem `.git` para uma pasta limpa e entre em `backend/`:
   `git archive HEAD | tar -x -C <pasta>`.
2. `railway init --name <slug>` (o limite é **1 projeto por 30 s** por workspace) e
   `railway add --database postgres`. Espere o Postgres aparecer em `railway service list`.
3. `railway add --service <slug>-backend --variables …` com as não secretas: `NODE_ENV=production`,
   `JWT_EXPIRES_IN=30m`, `REFRESH_TOKEN_TTL_DAYS=7`, `FRONTEND_URL=https://<front>.vercel.app`,
   `DATABASE_URL=${{Postgres.DATABASE_URL}}` e as três do Meu Ecoo (`PARTNER_AUTH_URL`,
   `PARTNER_AUTH_GOOGLE_URL`, `PARTNER_VERIFY_MEMBERSHIP_URL`, na origem `api-production-1b34…`).
4. Segredos **por pipe**, nunca na linha de comando: `JWT_SECRET` (64 bytes) e
   `PARTNER_AUTH_SERVICE_TOKEN` (32 bytes) com `railway variable set <NOME> --stdin --skip-deploys`.
5. `railway up --service <slug>-backend --detach` e `railway domain --service <slug>-backend`
   (sai `<slug>-backend-production.up.railway.app`).

Armadilhas encontradas:

- **`railway up` numa pasta sem projeto ligado cria um projeto com o nome da pasta** (nasceu um projeto
  `backend` por engano; foi apagado). Confira `railway status` antes de subir.
- **`railway variable list --json` devolve a referência já resolvida**: `DATABASE_URL` sai com a senha.
  Mascare (`://usuario:***@`) ou nem imprima.
- Se apagar e recriar o Postgres, o `DATABASE_URL` do backend fica vazio: regrave a referência.
- **O `railway.json` não é aplicado por `railway up`** (builder Railpack, sem `preDeployCommand`) e o
  Railway avisa que ele deixa de valer em **01/12/2026**. Por isso o `start` do backend roda
  `prisma db push --skip-generate` antes do servidor e o `prisma` é dependência de produção (a imagem
  final poda as devDependencies). Sem isso, a API respondia 500 por falta da tabela
  `sessoes_de_renovacao`.
- O backend ainda está em Node 20.x (fim de vida em 04/2026) com Prisma 5.22: atualizar junto (Node 22/24
  e Prisma 6 ou 7) é um trabalho à parte, para todos os apps.

## 3. Front (Vercel)

1. Projeto no escopo `flaviavs-commits-projects`. **Commit do André é barrado no plano Hobby**: publique
   uma cópia limpa, sem `.git` e **sem `backend/`**
   (`git archive HEAD | tar -x --exclude=backend -C <pasta>`), com `vercel link --yes --project <nome>` e
   `vercel deploy --prod --yes`. Com `backend/` na pasta a Vercel detecta um "serviço" Express e recusa.
2. `vercel.json` já traz `framework: vite`, `buildCommand`, `outputDirectory`, a CSP e os cabeçalhos;
   `.vercelignore` deixa o backend de fora. `engines.node` = `24.x` (a Vercel descontinuou o 20.x).
3. Variáveis de **produção**, antes do deploy (o Vite as embute no build): `VITE_API_URL` (o domínio do
   Railway), `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` e
   `VITE_FIREBASE_API_KEY`. As do Firebase são **chaves públicas de cliente** (vão em todo bundle; dá para
   ler do bundle de um app no ar). A `VITE_FIREBASE_API_KEY` precisa de `vercel env add … --type config`:
   com o tipo padrão ou `--sensitive` a CLI recusa porque `VITE_` expõe o valor.
4. Troque, no `connect-src` do `vercel.json`, o domínio padrão da API pelo domínio real do Railway
   (o teste `seguranca-cabecalhos.test.ts` confere que é um `*.up.railway.app`).
5. **CSP e build**: `build.assetsInlineLimit: 0` no `vite.config.ts` (fonte ou imagem embutida como `data:`
   seria bloqueada por `font-src 'self'`); o script do tema fica em `public/tema-inicial.js` e qualquer
   Web Worker em arquivo de `public/` (nada de Blob nem `blob:`).
6. **Firebase** (projeto `descontoss-vip`, console no Brave do André, conta `andre@vitissouls.com` =
   `u/1`): Authentication → Settings → **Authorized domains** → Add domain para cada `<front>.vercel.app`.

## 4. Conferir no ar

Rode contra o front de produção (Edge/Chromium com `playwright-core`; ver `scripts/verificar-producao.cjs`):

- entrada com tema aplicado antes da pintura e sem rolagem lateral;
- login com **credencial falsa** mostra o erro da API na tela (prova CORS e rota) e não grava nada;
- sessão simulada (`/api/auth/me` interceptado): abas abrem, **nenhuma violação da CSP**
  (`securitypolicyviolation`) e nenhum erro de console, nos dois temas;
- chave do Firebase no bundle (`apiKey` começando em `AIza`);
- API: `/health` 200 e `POST /api/auth/refresh` com token falso = **401 `SESSAO_INVALIDA`** (500 = tabela
  ausente).

## 5. Token de parceiro no Meu Ecoo (backend do Meu Ecoo, com o Felipe)

A lista de apps que podem fazer login é fechada em `MeuEcoo/backend/src/auth/partnerLoginToken.ts`.

1. **Código** (Felipe): acrescentar o id do app ao tipo e à lista, lendo `PARTNER_LOGIN_<APP>_TOKEN` e
   `_PREVIOUS_TOKEN`, com teste e a tabela de `docs/PARTNER-LOGIN-TOKENS.md`. Para os quatro de 06/11 já
   existe a branch `feat/mini-apps-novos-login-parceiro`.
2. **Variável** (qualquer um com a conta do Railway, sem expor o valor): copiar o
   `PARTNER_AUTH_SERVICE_TOKEN` do backend do app para `PARTNER_LOGIN_<APP>_TOKEN` do `meuecoo-api` por
   pipe e **com `--skip-deploys`** (a variável só vale no próximo deploy, que será o do merge):
   `railway variable list -p <app> -s <app>-backend --json | … | railway variable set PARTNER_LOGIN_<APP>_TOKEN --stdin -p <meuecoo> -e meuecoo-production -s meuecoo-api --skip-deploys`.
3. **Conferir** depois do deploy do `meuecoo-api`: credencial errada no app responde **401** (e não 403/502).
   Contrato e rotação: `MeuEcoo/docs/PARTNER-LOGIN-TOKENS.md`.

## 6. Catálogo do Meu Ecoo (frontend do Meu Ecoo)

Só depois do passo 5 funcionando, para não mostrar cartão de app que não entra.

1. `src/data/streaming.ts`: uma entrada em `miniAppProducts` por app (`id`, `name`, `description`,
   `status: 'Beta'`, `accent`, `group`, `url`, `stage`). Novos `accent` pedem um token
   `--me-app-<accent>` em `src/styles/tokens.css` (RGB da cor da interface) e a classe
   `.me-stage--<accent>` em `src/styles/apps.css`.
2. Cena do celular: `public/images/apps/<id>-{640,1280}.webp` e `public/video/apps/<id>-1280.mp4`, com as
   coordenadas da tela em `stage.screen` (mesmo quadro 4:3 dos três apps atuais).
3. Traduções: descrição e grupo nos quatro catálogos de `src/lib/i18n/catalogs/` (os nomes dos Mini Apps
   ficam em português).
4. Os apps novos **não têm** o login único (`?meuecoo_codigo=`) do template antigo: o "Abrir" leva à tela
   de entrada deles. Para ter, copie o módulo dos três Mini Apps e acrescente o app a
   `MINI_APPS_COM_LOGIN_UNICO` (`backend/src/auth/codigoDeMiniApp.ts` do Meu Ecoo).
