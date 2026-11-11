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
      → backend emite JWT próprio (30 min) + refresh token + espelha isMember no Postgres
  ← { token, refreshToken, user }
Frontend: AuthProvider guarda o par de tokens; o gate libera o app só se isMember.
          Com o JWT vencido, o front renova em POST /api/auth/refresh (ver "Sessão curta e renovação").
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
   projeto. Ela traz `src/auth/` (módulo), `src/lib/` (`clientIp.ts`), `src/server.ts` e
   `prisma/schema.prisma` (User base + `SessaoDeRenovacao`). Num app que já tem schema, acrescente o
   model `SessaoDeRenovacao` e a relation `sessoesDeRenovacao` do `User`; a migração é só uma tabela nova.
2. **Copiar o módulo frontend**: copie `template/src/auth/` para o `src/` do seu app.
   - Ajuste as chaves do token em `src/auth/api.ts` (`TOKEN_KEY` e `REFRESH_KEY`) para valores únicos do app.
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
| `JWT_EXPIRES_IN` | `30m` (padrão do módulo; um valor antigo como `7d` definido aqui vence o padrão e desfaz a sessão curta) |
| `REFRESH_TOKEN_TTL_DAYS` | `7` (opcional; validade de cada refresh token, a família vale no máximo 30 dias) |
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | URL exata da Vercel (sem barra final); obrigatória com `NODE_ENV=production` — sem ela o backend recusa subir |
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

### Cabeçalhos de segurança e CSP (já vêm no template)

Front e API saem com os cabeçalhos do guia de segurança do ecossistema (seção 8):
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Content-Security-Policy` e `Permissions-Policy`; o HSTS é o da Vercel (front) e o do
`backend/src/lib/securityHeaders.ts` (API, que também tira o `x-powered-by`). O front os manda pelo
`vercel.json`; a API, pelo middleware.

- **A CSP do front já nasce em bloqueio**, com só o que o login com Google e a API exigem: `script-src`
  `apis.google.com`; `connect-src` a API do app, `apis.google.com` (telemetria do carregador do Google),
  `identitytoolkit`, `securetoken` e `www.googleapis.com`; `frame-src` o `authDomain` do Firebase
  (`descontoss-vip.firebaseapp.com`), `accounts.google.com` e `content.googleapis.com`.
- **Ao provisionar, troque no `connect-src` o domínio padrão da API** (`https://<slug>-api.up.railway.app`)
  pelo domínio real do backend Railway. Todo destino novo (outra API, imagem de fora, vídeo, fonte) precisa
  entrar na diretiva certa do `vercel.json`, senão o navegador bloqueia.
- **Sem curinga, sem `unsafe-eval`, sem `unsafe-inline` em script.** Se o app ganhar um `<script>` embutido
  no `index.html`, libere-o com o hash `sha256-` do conteúdo (e um teste que recalcule o hash), não com `unsafe-inline`. No teste, troque `\r\n` por `\n` antes de calcular o hash: o checkout no Windows põe CRLF no arquivo, mas a Vercel compila no Linux e o navegador mede LF (o teste dos Mini Apps falhou no Windows por isso em 06/11/2026).
- **Nunca ponha `Cross-Origin-Opener-Policy: same-origin`** (nem o `helmet()` com os padrões): ele quebra o popup do
  login com Google do Firebase.
- **Violações vão para o log da API do Meu Ecoo.** O `report-uri` aponta para `POST /api/csp-report` (coletor
  público, sem dado pessoal, endereços sem `?`/`#`). Para ver: no Railway, projeto MeuEcoo, serviço da API, filtrar
  o log por `[csp]`; cada linha traz o app, o modo (`bloqueio` ou `report-only`), a diretiva e o que foi barrado.
- **Para testar uma CSP nova sem arriscar o login**, ponha a política completa em
  `Content-Security-Policy-Report-Only` (e deixe em bloqueio só `frame-ancestors 'none'`), publique, olhe o log do coletor
  e só então passe para bloqueio. O teste `src/seguranca-cabecalhos.test.ts` vale para os dois nomes.

### Firebase Console (passo manual)

No projeto **`descontoss-vip`** → Authentication → Settings → **Authorized domains** → adicionar o
domínio do app (ex.: `meu-app.vercel.app`). Sem isso o popup do Google é bloqueado no navegador.

---

## Sessão curta e renovação

O JWT de acesso dura **30 minutos**; quem mantém a pessoa logada é um **refresh token** opaco (32 bytes
aleatórios) que **troca de valor a cada renovação**. O guia de segurança pede exatamente isso: expiração
curta e refresh com rotação.

**Backend** (`backend/src/auth/refreshTokens.ts` e `authController.ts`):

- Tabela `sessoes_de_renovacao` (model `SessaoDeRenovacao`): só o **hash SHA-256** do token vai ao banco.
  Cada token vale 7 dias (`REFRESH_TOKEN_TTL_DAYS`) e a **família** (a cadeia de rotações de um login) vale
  no máximo **30 dias** desde o login que a abriu. Depois disso, a pessoa entra de novo.
- Todo login (senha, Google) devolve `refreshToken` ao lado do `token`; o resto da resposta não muda.
- `POST /api/auth/refresh` (público, corpo `{ refreshToken }`) responde `200 { token, refreshToken, user }`
  ou um destes erros, sempre com `code`:

  | Status | `code` | Quando |
  |---|---|---|
  | 401 | `SESSAO_INVALIDA` | token desconhecido, revogado, ou já usado (reuso: **revoga a família inteira**) |
  | 401 | `SESSAO_EXPIRADA` | token ou família vencidos |
  | 409 | `RENOVACAO_EM_ANDAMENTO` | token usado há menos de 10 s (duas abas renovando juntas); **não revoga** |
  | 403 | — | conta desativada ou não verificada no provedor (revoga a família; mensagem constante do app) |
  | 502 | — | provedor recusou o token de serviço do app (erro de configuração; não consome o refresh) |
  | 503 | `RENOVACAO_INDISPONIVEL` | provedor fora do ar, lento ou sem a rota; **não consome nem revoga** |

- Antes de consumir o refresh token, o app **reconsulta o Meu Ecoo**: `POST <origem de PARTNER_AUTH_URL>/api/partner/auth/renovar`
  com o `X-Service-Token` do app e o corpo `{ "email": "..." }` (a URL deriva da de login, sem variável nova).
  `200` traz `data.user` no mesmo formato do login (o espelho de assinatura e nome é atualizado); `403` com
  `CONTA_DESATIVADA`/`CONTA_NAO_VERIFICADA` e `404` com `CONTA_NAO_ENCONTRADA` revogam a família. Perder a
  assinatura **não** impede a renovação: o espelho vai a `isMember=false` e o `requireMember` decide. Um `404` sem
  `code` é rota ausente e vira 503, nunca revogação.
- `POST /api/auth/logout` (público, corpo `{ refreshToken }`) revoga a família e responde **sempre `204`**.
- O consumo do token e a emissão do par novo ficam numa transação só; duas renovações simultâneas com o
  mesmo token resultam em uma renovação e um 409.
- **`X-Client-IP`**: nas chamadas ao Meu Ecoo de login por senha e de Google, o backend manda o IP real de
  quem está entrando (`lib/clientIp.ts`: o `X-Real-IP` da borda do Railway; fora dele, o endereço da conexão),
  e só se `net.isIP` validar. O Meu Ecoo só o aceita junto de um `X-Service-Token` válido (por isso o Google
  também leva o token de serviço) e o usa no limite de tentativas por IP.

**Frontend** (`src/auth/api.ts`):

- O `refreshToken` fica no `localStorage` ao lado do token (`REFRESH_KEY`): o front (Vercel) e a API (Railway)
  são sites diferentes, e cookie `httpOnly` de terceiros não é confiável nos navegadores.
- Num `401` fora das rotas de login, de `/api/auth/refresh` e de `/api/auth/logout`, **com** refresh token
  guardado, o interceptor faz **uma** renovação por vez (as requisições que falharam juntas dividem a mesma
  promessa), grava o par novo e **repete a original uma vez**.
- Renovação recusada (`401`/`403`) → limpa tudo e volta ao login (como era). Rede caída, `5xx` e `503` **não
  derrubam a sessão**: devolvem o erro original. `409` → espera (até ~3 s) a outra aba gravar o par novo e
  repete a renovação uma vez com ele; se o refresh não mudou, trata como expirada.
- Sem refresh token guardado (sessão antiga), vale o comportamento anterior: `401` → sessão expirou.
- Sair chama `/api/auth/logout` (melhor esforço) e limpa o armazenamento. O `AuthProvider` aplica o `user`
  que a renovação devolve (assinatura e nome).

**Publicação:** front primeiro, depois o backend — o front novo funciona sem refresh token guardado e sem a
rota no backend. O backend cria a tabela ao subir (`prisma db push` no `start` do `backend/package.json`).

---

## Login único (`?meuecoo_codigo=`)

O "Abrir" do Meu Ecoo abre o app com um código de uso único na URL e a pessoa entra sem digitar a senha de novo
(contrato completo: seção B7 de `docs/PARTNER-LOGIN-TOKENS.md` do MeuEcoo). O template já traz os dois lados:

- **Backend** (`authController.ts`): `POST /api/auth/meu-ecoo` com `{ codigo }`. Chama `/api/partner/auth/trocar-codigo`
  (mesma origem do `PARTNER_AUTH_URL`) com o `X-Service-Token` do app e o `X-Client-IP`, pela mesma função do login por
  senha (`chamarMeuEcoo`: 403 de conta vira a mensagem da conta, 403 sem `code` vira 502, 429 vira "muitas tentativas" e
  o 401 é repassado). A sessão sai do e-mail que o Meu Ecoo devolve, nunca do corpo; daí em diante é o caminho do login
  (membership, espelho do usuário, JWT e refresh token).
- **Front** (`src/auth/loginUnico.ts` e `AuthProvider`): tira o `meuecoo_codigo` da URL (os outros parâmetros e o hash
  ficam) antes de qualquer chamada, para o código não ficar no histórico nem voltar num recarregamento, e troca o código
  **antes** de restaurar a sessão guardada: um token velho não corre contra a troca, e a conta do código vale mais que uma
  sessão guardada de outra pessoa. A troca roda uma vez só, mesmo no StrictMode (o código vale uma vez). A rota fica entre
  as de login em `api.ts`: um 401 ali é código recusado, não sessão expirada.
- **Se falhar** (código vencido, já usado, Meu Ecoo fora do ar) e não houver sessão guardada válida: a tela de login mostra
  "Não foi possível entrar direto pelo Meu Ecoo. Entre com e-mail e senha.".
- **Se falhar e houver sessão guardada** (num aparelho compartilhado, pode ser de outra pessoa): o app entra por ela e mostra,
  no topo de toda tela logada (inclusive a de acesso restrito), "Não foi possível entrar direto pelo Meu Ecoo. Você está na
  conta {e-mail}, que já estava aberta neste aparelho." (sem e-mail, o nome; sem os dois, "…na conta que já estava aberta…"),
  com **Sair e entrar com a minha conta** (o mesmo "Sair" do app, que leva à tela de login sem o aviso do código) e
  **Continuar nesta conta** (só esconde o aviso). O aviso vive só em memória: recarregar não o traz de volta. Código em
  `src/auth/AvisoContaAberta.tsx`, `avisoDaContaAberta` (`loginUnico.ts`) e `AuthProvider`; testes em
  `src/auth/avisoContaAberta.test.tsx`.
- **Para um app ter o login único:** acrescentar o id a `MINI_APPS_COM_LOGIN_UNICO` (`backend/src/auth/codigoDeMiniApp.ts`
  do Meu Ecoo) e publicar. O código só vale para o app que o pediu, e quem diz qual é o token próprio dele
  (`PARTNER_AUTH_SERVICE_TOKEN`). Fora da lista, o "Abrir" segue o link normal, sem código.

---

## Armadilhas conhecidas (já resolvidas no módulo)

- **`PARTNER_AUTH_URL` é o backend Django** (`vs-production-c4dd...`), **NÃO** `www.fcvip.com.br`
  (esse é o frontend; devolve 405).
- **Bootstrap via `/api/auth/me`**, nunca via rota gateada — senão um não-membro entra em loop de
  login/logout.
- **Membership tem que ser verificada** (`verify-membership`), não só lida do login — o status que o
  login devolve pode estar desatualizado.
- **403 do provedor não é sempre o token do app.** O Meu Ecoo responde 403 tanto para o token de
  serviço recusado quanto para uma conta que não pode entrar (desativada no painel, ou com o e-mail
  ainda não confirmado). O corpo traz `code`: `CONTA_DESATIVADA` e `CONTA_NAO_VERIFICADA` viram 403 com
  a mensagem da conta; `SERVICO_NAO_AUTORIZADO` (ou um provedor sem `code`, como o VS antigo) é erro de
  configuração do app (502). Tratar todo 403 como configuração faz quem está desativado ler "erro de
  configuração" (contrato em `docs/PARTNER-LOGIN-TOKENS.md` do MeuEcoo). O limite de tentativas chega
  como 429, com a mensagem em `error`.
