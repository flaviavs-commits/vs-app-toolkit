# 🤖 IA.md — Contexto Operacional do {{APP_NAME}}

> Memória técnica do projeto para retomada de contexto por IA ou novos mantenedores.
> Gerado pelo `vs-app-toolkit`. Atualize conforme o app evolui.

---

## 🎯 OBJETIVO DO PROJETO

_Preencher: o que o {{APP_NAME}} faz, para quem._ App do ecossistema VS com login compartilhado do
Descontos VIP e acesso restrito a membros ativos.

---

## 🛠️ STACK & DEPENDÊNCIAS

- **Frontend:** React 18 + TypeScript + Vite 6 + Tailwind 3 + axios + firebase + lucide-react.
- **Backend:** Node 20 + Express + Prisma 5 (PostgreSQL) + jsonwebtoken + cors, em TypeScript (tsx/tsc).
- **Deploy:** backend no Railway (`backend/railway.json`); frontend na Vercel.

---

## 📐 DECISÕES DE ARQUITETURA

[gerado] **Login VS (módulo `auth/`)**: `/api/auth/login` (email+senha, `X-Service-Token`) e
`/api/auth/google` (Firebase, público) fazem proxy para o VS; o backend emite JWT próprio e espelha
`isMember`/`memberUntil` no Postgres. Bootstrap do frontend via `/api/auth/me` (não via rota
gateada) para evitar loop de logout com não-membros.
[gerado] **Gate de membership em 2 camadas**: frontend (`MembershipGate`) + backend
(`requireMember`, 403). A **fonte de verdade é o VS** (admin / painel manual / Betalabs) — o app só
espelha o `is_member` que o VS devolve; não impõe regra do Betalabs.
[gerado] **CORS**: com `NODE_ENV=production` só aceita a origem `FRONTEND_URL`, e o backend **recusa
subir** se ela faltar (`backend/src/lib/corsOrigin.ts`); fora de produção libera `*` (dev local).

---

## 🎨 CONVENÇÕES

[gerado] JWT no `localStorage` na chave `{{APP_SLUG}}_token`. Mensagens de erro da API em
`{ "error": "..." }`. Auth isolada em `src/auth/` (frontend) e `backend/src/auth/` (backend) — não
misturar lógica de negócio nesses arquivos.

---

## 🎨 PADRÃO VISUAL

[2026-11-06] O template nasce no padrão dos Mini Apps do Meu Ecoo (redesign de 30/10, confirmado em
02/11: "padrão Meu Ecoo mantendo a identidade de cada app"): tokens por papel em `src/index.css` (canais
RGB, claro no `:root` e escuro em `:root[data-tema="escuro"]`), tema no `<html>` antes da primeira pintura
(`index.html` + `src/lib/tema.ts`), `SeletorTema` Claro / Escuro / Sistema, fonte servida pelo app
(`@fontsource-variable`), anel de foco global, `Shell` (cabeçalho com marca, tema, "Baixar meus dados" e
"Sair"; abas com `aria-current`; `<main>`), `Button`/`Card`/`Vazio`/`Carregador`, dados no aparelho
(`src/lib/armazenamento.ts`) e as guardas de `src/guardas/` no `npm test`. A marca do app fica em
`src/marca.tsx`; as telas de entrada só leem de lá. Guia: `docs/PADRAO-VISUAL.md` do toolkit.

---

## 🧪 TESTES

[gerado] **Automatizados (auth/authorization — obrigatórios por padrão):** Vitest no backend cobre
o que o Design System marca como crítico. Rode com `cd backend && npm test`.

- `requireAuth`: sem header → 401; esquema não-Bearer → 401; token inválido → 401 "Token inválido";
  token expirado → 401 "Sessão expirada"; token válido popula `req.user` e chama `next()`.
- `requireMember`: membro → libera; não-membro → 403 `NOT_MEMBER`; usuário inexistente → 404;
  falha de banco → 500 sem vazar detalhe.
- `login` / `google` / `me`: validação de entrada (400), proxy ao VS (200/401/403→502/502 offline),
  normalização de email para minúsculas, JWT próprio emitido e `serializeUser` sem campos sensíveis.
- `corsOrigin`: fora de produção → `*`; em produção → `FRONTEND_URL`; em produção com `FRONTEND_URL`
  ausente, vazia ou só espaços → erro (o backend não sobe).

Arquivos: [`backend/src/auth/__tests__/`](backend/src/auth/__tests__/) e
[`backend/src/lib/__tests__/`](backend/src/lib/__tests__/). Prisma e `fetch` são mockados —
os testes não exigem Postgres nem o VS no ar.

[2026-11-04] **Sessão curta com renovação** (`backend/src/auth/__tests__/refresh.test.ts`, 41 casos, e
`src/auth/renovacao.test.ts`, 27 casos; o do frontend roda com `npm test` na raiz). O backend usa uma
tabela falsa em memória e o provedor como `fetch` simulado: JWT de 30 min, refresh de 32 bytes só em hash,
7 dias por token e 30 dias por família, rotação em cadeia, reuso (revoga a família) e a janela de 10 s
(409), vencido, revogado, conta desativada/não verificada/não encontrada, provedor fora do ar (503 sem
consumir), 404 sem `code` (rota ausente, não revoga), corrida de duas renovações, logout e limpeza das
linhas vencidas. `authController.test.ts` cobre o `X-Client-IP` e o `refreshToken` nos logins. O frontend
cobre a renovação única compartilhada, a repetição uma vez só, recusa x indisponibilidade, o 409 com a
outra aba, a sessão antiga sem refresh e as rotas de login fora da renovação.

[gerado] **Verificação manual (smoke do fluxo real, quando mexer em auth/integração):**

1. `python start_app.py` → app abre em `http://127.0.0.1:5173`.
2. Login email+senha de um **membro ativo** → entra no app (sem `MembershipGate`).
3. Login de um usuário **não-membro** → cai na tela de acesso restrito (403 do `requireMember`).
4. Recarregar a página logado → sessão restaurada via `/api/auth/me` (sem loop de logout).
5. Chamar uma rota gateada sem token (`curl` direto) → 401; com token de não-membro → 403.
6. `logout` → token removido do `localStorage` e volta para a tela de login.

---

## 🐛 BUGS / 🔗 INTEGRAÇÕES / 📝 NOTAS

_Preencher conforme o projeto avança._

[gerado] Integração: VS em `vs-production-c4dd.up.railway.app` (auth + membership). Firebase
`descontoss-vip` (Google). Lembrete: autorizar o domínio do app no Firebase Console.

[2026-11-04] 403 do provedor com `code`: `login` e `loginGoogle` leem o `code` do corpo do 403 —
`CONTA_DESATIVADA` / `CONTA_NAO_VERIFICADA` → 403 com a mensagem da conta; qualquer outro 403 (token de
serviço recusado, ou provedor sem `code`) → 502 de configuração; 429 → "Muitas tentativas". Antes todo
403 virava erro de configuração. Testes em `authController.test.ts`; os apps já gerados (Área Saúde
Mental, Minha Motivação, Planejador) receberam a mesma mudança.

[2026-11-04] **Sessão curta com renovação rotativa e `X-Client-IP`** (decisão do Notion "decidir sessão
curta com renovação no lugar dos JWT de 7 dias", para os 5 repositórios; o guia de segurança pede
expiração curta e refresh com rotação).

- **Mudou:** `JWT_EXPIRES_IN` padrão `30m` (era `7d`). Tabela nova `sessoes_de_renovacao` (model
  `SessaoDeRenovacao`, FK para `users` com `onDelete: Cascade`): só o hash SHA-256 do refresh token vai ao
  banco; 7 dias por token (`REFRESH_TOKEN_TTL_DAYS`) e no máximo 30 dias por família (cadeia de rotações de
  um login). Todo login devolve `refreshToken` ao lado do `token`. `POST /api/auth/refresh` rotaciona com
  detecção de reuso e reconsulta o Meu Ecoo em `/api/partner/auth/renovar` antes de consumir; `POST
  /api/auth/logout` revoga a família e responde sempre 204. O login por senha e o Google mandam
  `X-Client-IP` (`backend/src/lib/clientIp.ts`, só se `net.isIP` validar), e o Google passou a levar o
  `X-Service-Token` (o Meu Ecoo só aceita o IP junto do token). Frontend: `REFRESH_KEY`
  (`{{APP_SLUG}}_refresh`) no `localStorage`; o `api.ts` renova uma vez por vez num 401 fora das rotas de
  login, repete a requisição uma vez, não derruba a sessão com rede caída/5xx/503 e deixa as rotas de
  login fora do interceptor (a senha errada não recarrega mais a página). Contrato completo em
  `docs/PLUGAR-LOGIN-VS.md` do toolkit ("Sessão curta e renovação").
- **Por que o IA.md importa aqui:** o app gerado herda tudo isso. `JWT_EXPIRES_IN=7d` definido no Railway
  vence o padrão novo; remova-o ou ajuste. A renovação depende da rota do Meu Ecoo: sem ela o app responde
  503 e a pessoa volta ao login quando o JWT de 30 min vencer.
- **Limites:** sem arquivo de migração versionado, porque o template nunca teve `prisma/migrations` e o
  `start` do backend roda `prisma db push` (a tabela nasce no deploy). O template não tem limite de tentativas
  próprio nem o login único (`?meuecoo_codigo=`); só o `clientIp.ts` veio, para o `X-Client-IP`. Quem tiver
  um limitador no app deve chaveá-lo pelo mesmo `clientIp`.
- **Como validar:** `cd backend && npm test` (79 casos; eram 29) e `npm test` na raiz (27 casos do
  frontend, novos); no app gerado, lint e build do frontend e `tsc` do backend.

---

> Base de auth e estrutura geradas pelo `vs-app-toolkit`.

- [2026-11-05] CABEÇALHOS DE SEGURANÇA E CSP DE FÁBRICA. O template passa a nascer com os cabeçalhos do guia de segurança do
  ecossistema: `vercel.json` (front: CSP em bloqueio com só o que o login com Google e a API exigem, `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `report-uri` para o coletor do Meu Ecoo) e `backend/src/lib/securityHeaders.ts`
  (API: os mesmos básicos, CSP `default-src 'none'`, HSTS, sem `x-powered-by`, sem COOP, que quebraria o popup do Google). Testes:
  `src/seguranca-cabecalhos.test.ts` e `backend/src/lib/__tests__/securityHeaders.test.ts`. A lista do Google é a medida em 05/11/2026 nos
  apps reais (Minha Motivação, Área Saúde Mental e Planejador, em Chrome real, em bloqueio: zero violações). Ao provisionar, trocar no
  `connect-src` o domínio padrão da API pelo real (o gerador lembra no checklist). Detalhes em `docs/PLUGAR-LOGIN-VS.md`.

- [2026-11-06] TEMA ANTES DA PINTURA COM A CSP. O script que aplica o tema salvo (claro, escuro ou sistema) antes da
  primeira pintura fica em `public/tema-inicial.js`, carregado no `<head>` do `index.html` sem módulo, e não embutido:
  a CSP do `vercel.json` (`script-src 'self' …`, sem `'unsafe-inline'`) bloquearia o script embutido e o app piscaria no
  claro. `src/lib/tema.test.ts` confere que o arquivo e o `aplicarTema` chegam ao mesmo resultado e que o HTML não embute
  script. Padrão visual completo em `docs/PADRAO-VISUAL.md` do toolkit.

- [2026-11-06] TABELAS NO START, NÃO NO PRÉ-DEPLOY. Medido num `railway up` em produção: o Railway construiu com o Railpack,
  não aplicou o `preDeployCommand` do `railway.json` e podou as devDependencies da imagem final, então `npx prisma db push`
  no pré-deploy não rodava e a API respondia 500 (tabela `sessoes_de_renovacao` inexistente). Agora o `prisma` (CLI) é
  dependência de produção e o `start` é `prisma db push --skip-generate && node dist/server.js`: não depende da configuração
  da plataforma (o Railway avisa que `railway.json` deixa de valer em 2026-12-01). `db push` recusa mudança que perde dados;
  o deploy falha e avisa em vez de apagar. O `railway.json` fica com `RAILPACK`, `startCommand: npm start` e o healthcheck.

- [2026-11-07] LOGIN ÚNICO NO TEMPLATE. O app gerado já recebe o `?meuecoo_codigo=` do "Abrir" do Meu Ecoo: `POST /api/auth/meu-ecoo`
  no backend (a chamada ao Meu Ecoo agora é `chamarMeuEcoo`, usada também pelo login por senha, com os mesmos erros) e
  `src/auth/loginUnico.ts` com o `AuthProvider` no front (tira o código da URL antes de qualquer chamada e o troca antes de
  restaurar a sessão guardada, uma vez só no StrictMode; a rota fica entre as de login em `api.ts`). Antes o template não tinha
  o login único (ver "Limites" de 04/11) e os quatro apps de 07/11 saíram sem ele. Testes: 9 no backend
  (`authController.test.ts`) e 12 no front (`src/auth/loginUnico.test.ts`); no navegador, 20 conferências com o backend
  simulado (código válido, vencido, token velho guardado, sessão guardada com código ruim, recarregar, sem código). Contrato em
  `docs/PLUGAR-LOGIN-VS.md`. Só vale para um app depois de o id dele entrar em `MINI_APPS_COM_LOGIN_UNICO` no Meu Ecoo.

- [2026-11-11] AVISO DE CONTA NO LOGIN ÚNICO QUE FALHA. Se o código do "Abrir" falhava (vencido, já usado, Meu Ecoo fora) e
  havia sessão guardada, o app entrava nela **sem aviso** (o aviso só existia na tela de login, que ninguém via): num aparelho
  compartilhado, quem clicou "Abrir" caía na conta de outra pessoa. Decisão da dona (opção A): o app continua entrando pela
  sessão guardada, mas mostra no topo de toda tela logada (inclusive a de acesso restrito) "Não foi possível entrar direto pelo
  Meu Ecoo. Você está na conta {e-mail}, que já estava aberta neste aparelho." com "Sair e entrar com a minha conta" (o
  `logout` de sempre) e "Continuar nesta conta" (só esconde). Só em memória; sem código, ou com a troca certa, nada muda.
  Arquivos: `src/auth/AvisoContaAberta.tsx` (novo), `src/auth/AuthContext.tsx`, `src/auth/loginUnico.ts`, `src/App.tsx`;
  testes em `src/auth/avisoContaAberta.test.tsx` (o `AuthProvider` de verdade, sem DOM). Detalhes em `docs/PLUGAR-LOGIN-VS.md`
  do toolkit.
