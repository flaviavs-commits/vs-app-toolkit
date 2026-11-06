# 🚀 Publicar um Mini App novo (checklist)

> **O que é**: o caminho de um app gerado pelo toolkit até aparecer no catálogo do Meu Ecoo.
>
> **Quando usar**: ao publicar os apps gerados em 06/11/2026 (Meu Foco, Comunicação Clara, Minha
> Carreira, Meu Sono) ou qualquer outro.
>
> **Quem faz o quê**: criar repositório, provisionar e guardar segredos é da pessoa (ou do Felipe, no
> backend do Meu Ecoo); nenhum agente digita token.

---

## Os quatro apps de 06/11/2026

| App | Slug / id | Área (grupo no catálogo) | Porta local do backend | Fonte | Repo local |
| --- | --- | --- | --- | --- | --- |
| Meu Foco | `meu-foco` | Foco e disciplina | 3011 | Inter | `GitHub\meu-foco` |
| Comunicação Clara | `comunicacao-clara` | Comunicação | 3012 | Manrope | `GitHub\comunicacao-clara` |
| Minha Carreira | `minha-carreira` | Carreira | 3013 | Figtree | `GitHub\minha-carreira` |
| Meu Sono | `meu-sono` | Saúde e bem-estar | 3014 | Nunito | `GitHub\meu-sono` |

Descrições para o catálogo (uma linha, no tom das existentes):

- **Meu Foco** — Blocos de foco com intenção, lista do dia e sequência: faça uma coisa de cada vez.
- **Comunicação Clara** — Treine a fala com tema e tempo, veja muletas e ritmo, e evolua a cada semana.
- **Minha Carreira** — Objetivos com resultados-chave, competências e a revisão da semana, num lugar só.
- **Meu Sono** — Registre as noites, siga a rotina de desligar e ganhe regularidade de horário.

## 1. Repositório

1. Criar o repositório remoto (na organização dos outros Mini Apps) e apontar o `origin`:
   `git remote add origin <url>` · `git push -u origin main`.
2. O hook de proteção (`.githooks/pre-commit`) já está ativo localmente; o workflow
   `.github/workflows/public-repo-guard.yml` roda a mesma checagem no GitHub.

## 2. Backend (Railway)

1. Projeto novo com **Postgres**; serviço do backend com *Root Directory* `backend/`.
2. Variáveis: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `JWT_SECRET` (64 bytes aleatórios),
   `JWT_EXPIRES_IN=30m`, `REFRESH_TOKEN_TTL_DAYS=7`, `PARTNER_AUTH_SERVICE_TOKEN` (o token próprio do
   app, ver §4), `PARTNER_AUTH_URL`, `PARTNER_AUTH_GOOGLE_URL` e `PARTNER_VERIFY_MEMBERSHIP_URL`
   apontando para o **Meu Ecoo** (mesmos valores dos três Mini Apps já publicados), `FRONTEND_URL`
   (a URL da Vercel, sem barra) e `NODE_ENV=production`.
3. Gerar o domínio; healthcheck em `/health`.

## 3. Frontend (Vercel)

1. Projeto apontando para a raiz do repositório (Vite).
2. Variáveis: `VITE_API_URL` (o domínio do Railway), `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` (projeto `descontoss-vip`) e `VITE_CHECKOUT_URL`.
3. Firebase Console → Authentication → Settings → Authorized domains: adicionar `<slug>.vercel.app`.
4. A Comunicação Clara usa o microfone: só funciona em HTTPS (a Vercel já dá).

## 4. Token de parceiro no Meu Ecoo (backend do Meu Ecoo, com o Felipe)

A lista de apps que podem fazer login é fechada em `MeuEcoo/backend/src/auth/partnerLoginToken.ts`
(`AppDeLoginParceiro` + `tokensConfigurados`). Para cada app:

1. Acrescentar o id (`meu-foco`, `comunicacao-clara`, `minha-carreira`, `meu-sono`) ao tipo e à
   lista, lendo `PARTNER_LOGIN_<APP>_TOKEN` e `PARTNER_LOGIN_<APP>_PREVIOUS_TOKEN`.
2. Gerar o segredo (`openssl rand -hex 32`), gravar em `PARTNER_LOGIN_<APP>_TOKEN` no `meuecoo-api` e
   o mesmo valor em `PARTNER_AUTH_SERVICE_TOKEN` no backend do app (Railway).
3. Conferir: credencial errada no app responde 401 (502 indica token recusado pelo Meu Ecoo).

Contrato e rotação: `MeuEcoo/docs/PARTNER-LOGIN-TOKENS.md`.

## 5. Catálogo do Meu Ecoo (frontend do Meu Ecoo)

1. `src/data/streaming.ts`: uma entrada em `miniAppProducts` por app (`id`, `name`, `description`,
   `status: 'Beta'`, `accent`, `group`, `url`, `stage`). Novos `accent` pedem um token
   `--me-app-<accent>` em `src/styles/tokens.css` (RGB da cor da interface) e a classe
   `.me-stage--<accent>` em `src/styles/apps.css`.
2. Cena do celular: `public/images/apps/<id>-{640,1280}.webp` e `public/video/apps/<id>-1280.mp4`,
   com as coordenadas da tela em `stage.screen` (mesmo quadro 4:3 dos três apps atuais).
3. Traduções: descrição e grupo nos quatro catálogos de `src/lib/i18n/catalogs/` (os nomes dos Mini
   Apps ficam em português).
4. O login único ("Abrir" já logado, `?meuecoo_codigo=`) e o `X-Client-IP` vieram no template: nada a
   fazer no app.

## 6. Conferir no ar

- `/` do app abre a tela de entrada com o tema certo; login de assinante entra; não assinante vê
  "Acesso restrito"; recarregar mantém a sessão; "Sair" volta à entrada.
- No Meu Ecoo, o card abre o app em nova aba já logado.
