# 🧰 vs-app-toolkit

<div align="center">

![Python](https://img.shields.io/badge/Python-3-3776AB?style=for-the-badge&logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/Licen%C3%A7a-Propriet%C3%A1ria-lightgrey?style=for-the-badge)

**Gerador de apps satélite do ecossistema VS — cada app já nasce com login do Descontos VIP e acesso restrito a membros ativos.**

</div>

---

## 📋 Sobre

Criar um app novo que usa o **login compartilhado do VS** (Descontos VIP / FCVIP) era repetitivo e
propenso a erro. Este toolkit resolve isso: um **gerador** (`create-vs-app.py`) cria um app
fullstack já plugado — login email+senha e Google (Firebase `descontoss-vip`), JWT próprio, e gate
de membership no frontend **e** no backend.

A base de auth foi extraída do app `financeiro` (validada em produção) e convertida para TypeScript.

> ⚠️ **A arquitetura de identidade da Vitis Souls está em transição.** Em 29/07/2026 ficou decidido
> que o **Meu Ecoo** passa a ser o banco principal de usuários do ecossistema, no lugar do Descontos
> VIP. O gerador continua apontando para o VS de propósito — o Meu Ecoo ainda não valida credencial.
> Leia [`docs/ARQUITETURA-IDENTIDADE.md`](docs/ARQUITETURA-IDENTIDADE.md) **antes de gerar um app novo**.

## 📁 Estrutura

```
vs-app-toolkit/
├── create-vs-app.py     # gerador interativo
├── template/            # esqueleto de um app VS (React+TS / Express+Prisma)
│   ├── src/auth/        # 🔐 módulo de auth frontend (copiável)
│   ├── backend/src/auth/# 🔐 módulo de auth backend (copiável)
│   └── ...              # configs, start_app.py, docs com placeholders
└── docs/
    ├── ARQUITETURA-IDENTIDADE.md  # onde mora o login, hoje e para onde vai
    └── PLUGAR-LOGIN-VS.md         # como adicionar auth a um app existente
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

O projeto gerado inclui uma proteção versionada para repositórios públicos.
Após gerá-lo, rode `./scripts/install-public-repo-guard.sh`: o hook bloqueia
arquivos de ambiente, exportações CSV, backups e possíveis valores de
credenciais; o GitHub Actions executa a mesma verificação contra bypass.

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

Software proprietario da Vitis Souls — todos os direitos reservados. Veja [LICENSE](LICENSE).
O codigo gerado a partir de `template/` segue o mesmo regime ([template/LICENSE](template/LICENSE)).

## 👤 Autor

**Vitis Souls** — flaviavs@vitissouls.com
