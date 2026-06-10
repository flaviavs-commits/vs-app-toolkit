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

## 🧪 TESTES / 🐛 BUGS / 🔗 INTEGRAÇÕES / 📝 NOTAS

_Preencher conforme o projeto avança._

[gerado] Integração: VS em `vs-production-c4dd.up.railway.app` (auth + membership). Firebase
`descontoss-vip` (Google). Lembrete: autorizar o domínio do app no Firebase Console.

---

> Base de auth e estrutura geradas pelo `vs-app-toolkit`.
