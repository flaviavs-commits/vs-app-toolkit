# 🏛️ Arquitetura de identidade da Vitis Souls

> **O que é**: onde mora o login do ecossistema, hoje e para onde vai.
>
> **Quando usar**: antes de gerar um app novo com o `create-vs-app.py`, e sempre que for decidir contra quem um app autentica.
>
> **Por que existe**: em 29/07/2026 a Vitis Souls decidiu mover a fonte da verdade da identidade do **Descontos VIP** para o **Meu Ecoo**. Este toolkit gera apps já plugados no login compartilhado — então ele precisa dizer, sem ambiguidade, qual é o provedor certo em cada momento.

---

## Estado atual (o que o gerador produz hoje)

```
App gerado
  └── backend/src/auth  ──PARTNER_AUTH_URL──▶  VS (Django, vs-production-c4dd.up.railway.app)
                                                 ├── valida credencial
                                                 └── devolve membership
```

O **VS (Descontos VIP)** é a fonte da verdade de **credencial**, **identidade** e **membership**. O app guarda só um espelho (`users` sem senha) e emite JWT próprio.

**O template continua assim, de propósito.** Um app gerado hoje precisa funcionar hoje, e o Meu Ecoo ainda não tem autenticação própria.

---

## Estado alvo (para onde vai)

```
App gerado
  └── backend/src/auth  ──PARTNER_AUTH_URL──▶  Meu Ecoo (api, banco principal de usuários)
                                                 ├── valida credencial  ◀── fonte da verdade
                                                 └── membership ──consulta──▶ VS (BetaLabs + painel)
```

O **Meu Ecoo** passa a ser dono de **credencial e identidade**. O **membership continua no VS** numa primeira fase — ele nasce dos webhooks da BetaLabs e da concessão manual no painel admin, regra de negócio que não migra junto.

O **contrato do módulo de auth não muda**: mesmas rotas, mesmo espelho, mesmo JWT, mesmo gate de membership. Muda **para onde `PARTNER_AUTH_URL` aponta**. Foi desenhado assim de propósito — a migração é de configuração, não de código.

---

## O que fazer ao gerar um app novo, agora

1. Gere normalmente com `create-vs-app.py`.
2. Aponte as variáveis `PARTNER_AUTH_*` para o **VS**, como o checklist manda.
3. **Registre o app** na lista de migração (§"Apps a migrar" do plano) — quando o Meu Ecoo virar provedor, ele entra na leva.

Quando a migração concluir, este documento é atualizado e o `template/backend/.env.example` passa a apontar para o Meu Ecoo. Até lá, **não aponte um app novo para o Meu Ecoo**: ele ainda não valida credencial.

---

## Por que a migração é segura

O padrão que este toolkit criou é justamente o que torna a mudança barata: o app **nunca guardou senha**. Ele sempre delegou a validação e guardou só um espelho. Trocar o provedor é trocar o endereço do delegado.

O que **não** é barato, e por isso está fora do escopo do toolkit:

- o **Descontos VIP** em si, cuja tabela de usuários tem 39 chaves estrangeiras e vira espelho por último;
- apps com identidade própria que nunca passaram pelo toolkit (`social-api-manager`, `Planejador Financeiro`, `TaskForge`, `Conselheiro VIP`, `Discord Center`).

---

## Regras que continuam valendo

- **`PARTNER_AUTH_URL` é sempre um backend**, nunca um domínio de frontend. Apontar para `www.fcvip.com.br` devolve 405 — e esse domínio está morto desde 09/07/2026.
- **Membership tem que ser verificada**, não só lida do login. O status devolvido no login pode estar desatualizado.
- **Bootstrap por `/api/auth/me`**, nunca por rota gateada, senão um não-membro entra em loop de login/logout.
- **Um token de serviço por app.** Hoje o `PARTNER_AUTH_SERVICE_TOKEN` é o mesmo valor em vários serviços; no Meu Ecoo cada app ganha o seu.
- **Sessão curta, renovada pelo provedor.** O JWT do app dura 30 minutos e um refresh token rotativo (só o hash no banco do app) o renova por até 30 dias. A renovação **reconsulta o provedor** (`POST /api/partner/auth/renovar`, na mesma origem do login de parceiro, com o token de serviço do app), então conta desativada ou apagada no Meu Ecoo derruba a sessão do app em até 30 minutos, e a assinatura volta atualizada. Esta é uma rota do Meu Ecoo: contra o VS antigo, que não a tem, a renovação responde 503 e a pessoa volta ao login quando o JWT vencer. Os logins por senha e Google também mandam o IP de quem entra (`X-Client-IP`) para o limite de tentativas do provedor. Detalhes e códigos de erro em [`PLUGAR-LOGIN-VS.md`](PLUGAR-LOGIN-VS.md#sessão-curta-e-renovação).
- **O projeto Firebase continua sendo o `descontoss-vip`.** O nome é só um identificador — migrar de projeto custa re-login de todos os usuários e mexe nos `VITE_FIREBASE_*` e nos domínios autorizados de cada app. Muda quem verifica o `id_token`, não o projeto.

---

## Referências

- [`PLUGAR-LOGIN-VS.md`](PLUGAR-LOGIN-VS.md) — como plugar a auth num app existente
- Inventário do ecossistema e plano completo de migração: repositório `descontoss-vip-e-fcvip`, em `docs/infra/ECOSSISTEMA_VITIS_SOULS_INVENTARIO.md` e `docs/planejamento/MIGRACAO_IDENTIDADE_PARA_MEU_ECOO.md`
