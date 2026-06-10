# {{APP_NAME}}

<div align="center">

![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Node](https://img.shields.io/badge/Node-20-339933?style=for-the-badge&logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

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
│   ├── src/auth/        # 🔐 auth VS no backend (login/google/me + guards)
│   ├── src/server.ts    # rotas — adicione as suas com requireMember
│   └── prisma/          # User base; adicione seus models
├── start_app.py         # ▶ sobe backend + frontend com um comando
└── .env.example
```

## 🚀 Como Usar

```bash
python start_app.py
```

Instala dependências (backend + frontend), sobe os dois e abre o navegador.

- `python start_app.py restart` — reinicia
- `python start_app.py --no-browser` — sobe sem abrir o navegador

> Antes do primeiro login: copie `backend/.env.example` → `backend/.env` e `.env.example` →
> `.env.local`, e preencha as variáveis (ver `PLUGAR-LOGIN-VS.md` no toolkit).

## 🔐 Login VS

- **Backend:** `/api/auth/login` (email+senha) e `/api/auth/google` (Firebase) fazem proxy para o
  VS, que valida e devolve o status de membership. O backend emite um JWT próprio.
- **Gate:** o frontend mostra `MembershipGate` para não-membros; o backend bloqueia rotas com
  `requireMember` (403). A **fonte de verdade do membership é o VS** (admin / painel / Betalabs).

## 📝 Licença

MIT — veja [LICENSE](LICENSE).

## 👤 Autor

**Vitis Souls** — flaviavs@vitissouls.com
