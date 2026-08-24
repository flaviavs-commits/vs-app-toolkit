# {{APP_NAME}}

<div align="center">

![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Node](https://img.shields.io/badge/Node-20-339933?style=for-the-badge&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/Licen%C3%A7a-Propriet%C3%A1ria-lightgrey?style=for-the-badge)

**{{APP_NAME}} — app do ecossistema VS, com login do Descontos VIP e acesso restrito a membros ativos.**

[🚀 Como Usar](#-como-usar) • [🔐 Login VS](#-login-vs) • [📝 Licença](#-licença)

</div>

---

## 📋 Sobre

App **fullstack** gerado pelo `vs-app-toolkit`. Já vem plugado no **login do VS**: o usuário entra
com email+senha ou Google (Firebase `descontoss-vip`), e o app só libera para **membros ativos** do
Descontos VIP. A lógica de negócio do {{APP_NAME}} entra em `src/AppContent.tsx` (frontend) e nas
rotas de `backend/src/server.ts` (backend, protegidas por `requireMember`).

## 📁 Estrutura

```
{{APP_SLUG}}/
├── src/
│   ├── auth/            # 🔐 módulo de auth VS (não precisa mexer)
│   ├── AppContent.tsx   # ← seu app começa aqui (só membros chegam)
│   └── App.tsx          # AuthProvider + gate de membership
├── backend/
│   ├── src/auth/             # 🔐 auth VS no backend (login/google/me + guards)
│   │   └── __tests__/        # ✅ testes de auth/membership (Vitest)
│   ├── src/server.ts         # rotas — adicione as suas com requireMember
│   └── prisma/               # User base; adicione seus models
├── start_app.py         # ▶ sobe backend + frontend com um comando
└── .env.example
```

## 🛡️ Proteção para repositório público

Antes do primeiro commit, ative o hook versionado:

```bash
./scripts/install-public-repo-guard.sh
```

Ele recusa `.env`, exportações CSV, bancos, backups, documentos sensíveis e
possíveis atribuições de credenciais. O mesmo detector roda no GitHub Actions
para identificar qualquer bypass. Arquivos legítimos que precisem de exceção
devem receber uma allowlist revisada; não desative a proteção globalmente.

## 🚀 Como Usar

```bash
python start_app.py
```

Instala dependências (backend + frontend), sobe os dois e abre o navegador.

- `python start_app.py restart` — reinicia
- `python start_app.py --no-browser` — sobe sem abrir o navegador

> Antes do primeiro login: copie `backend/.env.example` → `backend/.env` e `.env.example` →
> `.env.local`, e preencha as variáveis (ver `PLUGAR-LOGIN-VS.md` no toolkit).

## 🧪 Testes

O fluxo de auth/membership (o que mais quebra silenciosamente) já vem coberto:

```bash
cd backend && npm test     # Vitest — não precisa de Postgres nem do VS no ar
```

Cobre `requireAuth`, `requireMember` e os handlers `login`/`google`/`me`. Ao adicionar regras de
negócio críticas, escreva o teste junto (ver roteiro de verificação manual em `IA.md`).

## 🔐 Login VS

- **Backend:** `/api/auth/login` (email+senha) e `/api/auth/google` (Firebase) fazem proxy para o
  VS, que valida e devolve o status de membership. O backend emite um JWT próprio.
- **Gate:** o frontend mostra `MembershipGate` para não-membros; o backend bloqueia rotas com
  `requireMember` (403). A **fonte de verdade do membership é o VS** (admin / painel / Betalabs).

## 📝 Licença

Software proprietario da Vitis Souls — todos os direitos reservados. Veja [LICENSE](LICENSE).

## 👤 Autor

**Vitis Souls** — flaviavs@vitissouls.com
