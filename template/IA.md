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

---

## 🎨 CONVENÇÕES

[gerado] JWT no `localStorage` na chave `{{APP_SLUG}}_token`. Mensagens de erro da API em
`{ "error": "..." }`. Auth isolada em `src/auth/` (frontend) e `backend/src/auth/` (backend) — não
misturar lógica de negócio nesses arquivos.

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

Arquivos: [`backend/src/auth/__tests__/`](backend/src/auth/__tests__/). Prisma e `fetch` são mockados —
os testes não exigem Postgres nem o VS no ar.

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

---

> Base de auth e estrutura geradas pelo `vs-app-toolkit`.
