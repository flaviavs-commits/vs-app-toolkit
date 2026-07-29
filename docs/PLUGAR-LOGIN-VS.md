# 🔌 Plugar o login VS num app

Guia para adicionar o **login do Descontos VIP + gate de membership** a um app —
seja um app **novo** (gerado pelo `create-vs-app.py`) ou um app **existente**
(ex.: Área Saúde Mental, quando chegar a fase de membros).

> ⚠️ **Transição em curso.** O provedor de identidade do ecossistema está migrando do Descontos VIP
> para o **Meu Ecoo** (decisão de 29/07/2026). Este guia descreve o estado **atual**, que continua
> válido — mas leia [`ARQUITETURA-IDENTIDADE.md`](ARQUITETURA-IDENTIDADE.md) para entender o estado
> alvo e o que muda quando a migração concluir (resposta curta: só o valor de `PARTNER_AUTH_URL`).

---

## Como funciona (visão geral)

```
Frontend (login email+senha ou Google via Firebase descontoss-vip)
  → POST /api/auth/login | /api/auth/google   [backend do app]
      → VS (vs-production-c4dd.up.railway.app)  valida + devolve membership
      → backend emite JWT próprio + espelha isMember no Postgres
  ← { token, user }
Frontend: AuthProvider guarda o token; o gate libera o app só se isMember.
```

A **fonte de verdade do membership é o VS** (admin / concessão manual no painel / assinatura ativa
no Betalabs). O app só consome o `is_member` que o VS devolve.

---

## App novo (gerado pelo toolkit)

Já vem tudo pronto. Só falta provisionar a infra e preencher as variáveis — siga o
**checklist** que o `create-vs-app.py` imprime ao final (resumido na seção "Variáveis" abaixo).

---

## App existente (adicionar a auth)

1. **Criar o backend** (se ainda não tiver): copie a pasta `template/backend/` do toolkit para o
   projeto. Ela traz `src/auth/` (módulo), `src/server.ts`, `prisma/schema.prisma` (User base).
2. **Copiar o módulo frontend**: copie `template/src/auth/` para o `src/` do seu app.
   - Ajuste a chave do token em `src/auth/api.ts` (`TOKEN_KEY`) para um valor único do app.
3. **Envolver o app com o gate**: no seu `App.tsx`, importe `AuthProvider`, `useAuth`, `Gatekeeper`
   e `MembershipGate` e renderize o conteúdo só quando for membro:
   ```tsx
   import { AuthProvider, useAuth } from './auth/AuthContext'
   import Gatekeeper from './auth/Gatekeeper'
   import MembershipGate from './auth/MembershipGate'

   function Router() {
     const { isLoggedIn, isMember, isBootstrapping } = useAuth()
     if (isBootstrapping) return <Loading />
     if (!isLoggedIn) return <Gatekeeper />
     if (!isMember) return <MembershipGate />
     return <SeuAppAtual />   // ex.: as abas Diário/Notas
   }

   export default function App() {
     return <AuthProvider><Router /></AuthProvider>
   }
   ```
4. **Gatear as rotas de negócio** no backend: `app.get('/api/x', requireAuth, requireMember, h)`.
5. **Decidir local-first vs. backend**: o que é privado/offline (ex.: diário no IndexedDB) pode
   continuar local; só o que precisa de servidor/membership vai para o backend.

---

## Variáveis necessárias

### Backend (Railway)

| Variável | Valor |
|---|---|
| `DATABASE_URL` | reference do Postgres: `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | segredo forte (`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`) |
| `JWT_EXPIRES_IN` | `7d` |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | URL exata da Vercel (sem barra final) |
| `PARTNER_AUTH_SERVICE_TOKEN` | token de serviço do VS (igual ao do VS) |
| `PARTNER_AUTH_URL` | `https://vs-production-c4dd.up.railway.app/api/partner/auth/login/` |
| `PARTNER_AUTH_GOOGLE_URL` | `https://vs-production-c4dd.up.railway.app/api/auth/firebase/google/` |
| `PARTNER_VERIFY_MEMBERSHIP_URL` | `https://vs-production-c4dd.up.railway.app/api/auth/verify-membership/` |

### Frontend (Vercel)

| Variável | Valor |
|---|---|
| `VITE_API_URL` | URL pública do backend (Railway) |
| `VITE_FIREBASE_API_KEY` | chave do projeto `descontoss-vip` (pública) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `descontoss-vip.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `descontoss-vip` |
| `VITE_FIREBASE_APP_ID` | app id do `descontoss-vip` |
| `VITE_CHECKOUT_URL` | URL de checkout do Descontos VIP |

### Firebase Console (passo manual)

No projeto **`descontoss-vip`** → Authentication → Settings → **Authorized domains** → adicionar o
domínio do app (ex.: `meu-app.vercel.app`). Sem isso o popup do Google é bloqueado no navegador.

---

## Armadilhas conhecidas (já resolvidas no módulo)

- **`PARTNER_AUTH_URL` é o backend Django** (`vs-production-c4dd...`), **NÃO** `www.fcvip.com.br`
  (esse é o frontend; devolve 405).
- **Bootstrap via `/api/auth/me`**, nunca via rota gateada — senão um não-membro entra em loop de
  login/logout.
- **Membership tem que ser verificada** (`verify-membership`), não só lida do login — o status que o
  login devolve pode estar desatualizado.
