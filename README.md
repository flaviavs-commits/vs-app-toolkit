# 🧰 vs-app-toolkit

<div align="center">

![Python](https://img.shields.io/badge/Python-3-3776AB?style=for-the-badge&logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**Gerador de apps satélite do ecossistema VS — cada app já nasce com login do Descontos VIP e acesso restrito a membros ativos.**

</div>

---

## 📋 Sobre

Criar um app novo que usa o **login compartilhado do VS** (Descontos VIP / FCVIP) era repetitivo e
propenso a erro. Este toolkit resolve isso: um **gerador** (`create-vs-app.py`) cria um app
fullstack já plugado — login email+senha e Google (Firebase `descontoss-vip`), JWT próprio, e gate
de membership no frontend **e** no backend.

A base de auth foi extraída do app `financeiro` (validada em produção) e convertida para TypeScript.

## 📁 Estrutura

```
vs-app-toolkit/
├── create-vs-app.py     # gerador interativo
├── template/            # esqueleto de um app VS (React+TS / Express+Prisma)
│   ├── src/auth/        # 🔐 módulo de auth frontend (copiável)
│   ├── backend/src/auth/# 🔐 módulo de auth backend (copiável)
│   └── ...              # configs, start_app.py, docs com placeholders
└── docs/
    └── PLUGAR-LOGIN-VS.md  # como adicionar auth a um app existente
```

## 🚀 Como Usar

### Criar um app novo

```bash
python create-vs-app.py
# ou, sem prompts:
python create-vs-app.py --name "Cursos VIP" --slug cursos-vip --port 3002 --dest ../cursos-vip
```

O gerador copia o template, substitui os placeholders (`{{APP_NAME}}`, `{{APP_SLUG}}`,
`{{BACKEND_PORT}}`) e imprime o **checklist de provisionamento** (Railway + Vercel + Firebase).

Depois:

```bash
cd ../cursos-vip
python start_app.py        # instala, sobe backend + frontend, abre o navegador
```

### Plugar auth num app existente

Veja [`docs/PLUGAR-LOGIN-VS.md`](docs/PLUGAR-LOGIN-VS.md) — passo a passo para adicionar o módulo de
auth a um app que já existe (ex.: quando ele chega na fase de área de membros).

## 🔐 O que o módulo de auth entrega

- **Backend** (`backend/src/auth/`): `/api/auth/login` (email+senha via VS), `/api/auth/google`
  (Firebase via VS), `/api/auth/me` (restaura sessão), middlewares `requireAuth` e `requireMember`.
  Emite JWT próprio e espelha `isMember`/`memberUntil` no Postgres.
- **Frontend** (`src/auth/`): `AuthProvider`/`useAuth`, `Gatekeeper` (login), `MembershipGate`
  (acesso restrito). Bootstrap via `/api/auth/me` (sem loop de logout).
- **Regra:** a **fonte de verdade do membership é o VS** (admin / painel manual / Betalabs). O app
  só consome o `is_member` que o VS devolve.

## 📝 Licença

MIT — veja [template/LICENSE](template/LICENSE).

## 👤 Autor

**Vitis Souls** — flaviavs@vitissouls.com
