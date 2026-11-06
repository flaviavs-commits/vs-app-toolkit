# 🎨 Padrão visual dos apps gerados

> **O que é**: a base de interface que todo app gerado pelo `create-vs-app.py` já traz, para os Mini Apps
> do Meu Ecoo saírem padronizados sem perder a cara de cada um.
>
> **Quando usar**: ao dar identidade a um app novo (cores, fonte, marca) e ao escrever qualquer tela.
>
> **De onde vem**: do redesign dos três Mini Apps (Planejador Financeiro, Minha Motivação, Área Saúde
> Mental), aprovado em 30/10/2026 e confirmado em 02/11/2026 ("padrão Meu Ecoo mantendo a identidade de
> cada app"). O template aplica os mesmos princípios de nascença.

---

## Princípios (valem em todo app)

1. **Token por papel, não por cor.** Fundo, superfícies, bordas, três níveis de texto, a cor do app como
   fundo (`marca`) e como texto (`marca-texto`), a tinta sobre ela, o selecionado e os estados. Os
   componentes consomem papéis (`bg-marca`, `text-apoio`, `border-borda-controle`); nunca uma cor fixa.
2. **Claro por padrão, escuro da própria paleta, sistema opcional.** O seletor Claro / Escuro / Sistema
   fica no cabeçalho e nas telas de entrada; a escolha é do aparelho (`<slug>:tema` no `localStorage`) e
   entra no `<html>` antes da primeira pintura (`public/tema-inicial.js`, no `<head>`), com `color-scheme` e
   `theme-color`.
3. **Contraste guardado por teste.** Texto 7:1, apoio 6:1, apagado e cores de estado 4,5:1, tinta sobre a
   marca 4,5:1, borda de controle 3:1 — sobre todas as superfícies em que aparecem
   (`src/guardas/tokens.test.ts`).
4. **Tipografia:** uma família por app, servida pelo próprio app (`@fontsource-variable/...`). Nenhum
   texto abaixo de 12 px; pesos 400 / 500 / 600; números tabulares em valores e contagens.
5. **Acessibilidade:** anel de foco global (ninguém o apaga), alvos de toque ≥ 44 px, zoom liberado,
   `<main>` e `<nav>`, aba ativa com `aria-current`, erros com `role="alert"` ligados ao campo por
   `aria-describedby`, movimento reduzido respeitado, ícones lucide (emoji só em conteúdo).
6. **Responsivo:** 360, 390, 768, 1024 e 1440 px sem rolagem lateral; abas em faixa rolável no celular.
7. **Estados:** vazio com ícone discreto, título curto e uma saída (`Vazio`); carregando com atraso de
   300 ms (`Carregador`); um alerta por erro de servidor.
8. **Movimento:** 140–280 ms para interface, até 420 ms para o que se desloca; só `transform`/`opacity`.
9. **Sem a marca do Meu Ecoo.** O nome só aparece no texto funcional do login ("mesma conta do Meu Ecoo").
10. **Elementos do Uiverse (MIT)** entram adaptados aos papéis, com o crédito no CSS
    (`index.css`, bloco `@layer components`).

## O que o template traz

| Arquivo | Papel |
| --- | --- |
| `src/index.css` | Os papéis nos dois temas (canais RGB), anel de foco global, seletor de tema e carregador (Uiverse) |
| `tailwind.config.js` | Os papéis como cores do Tailwind (`rgb(var(--x) / <alpha-value>)`), `darkMode` pelo `data-tema`, a fonte |
| `index.html`, `public/tema-inicial.js` | `theme-color` e o script do tema antes da primeira pintura (arquivo, não embutido: a CSP bloqueia script embutido) |
| `src/lib/tema.ts` | Preferência, tema efetivo, `aplicarTema`, as cores da barra |
| `src/lib/armazenamento.ts` | Dados no aparelho com o prefixo do app, "Baixar meus dados" (JSON) |
| `src/marca.tsx` | Nome, linha de apoio e ícone do app — o único lugar que as telas de entrada leem |
| `src/components/Shell.tsx` | Cabeçalho (marca, tema, baixar dados, sair), abas com `aria-current`, `<main>`, rodapé |
| `src/components/SeletorTema.tsx`, `Carregador.tsx`, `Vazio.tsx` | Tema, carregando, vazio |
| `src/ui/Button.tsx`, `Card.tsx` | Botão por papel (44 px) e cartão composto |
| `src/guardas/*.test.ts` | As guardas: contraste dos papéis, cor fixa, foco/alvos/bordas/12 px, emoji, movimento |

## Como dar a cara do app (checklist)

1. `src/index.css`: troque os valores dos papéis no `:root` (claro) e em `:root[data-tema="escuro"]`.
   Rode `npm test`: `tokens.test.ts` acusa qualquer par abaixo do mínimo.
2. `src/lib/tema.ts` (`COR_DA_BARRA`), `public/tema-inicial.js` (as duas cores) e `index.html` (`theme-color`): o
   `--fundo` de cada tema. `tema.test.ts` confere que os três concordam.
3. Fonte: `npm i @fontsource-variable/<fonte>`, import em `src/main.tsx`, `fontFamily.sans` no
   `tailwind.config.js`.
4. `src/marca.tsx`: nome, linha de apoio e ícone lucide. `public/favicon.svg` com a cor da marca.
5. `index.html`: `<meta name="description">` e `<title>`.
6. Telas: componha com `Shell`, `Card`, `Button`, `Vazio`; classes só com papéis. As guardas rodam no
   `npm test`.

## Dados no aparelho

Os apps são **local-first**: o backend só autentica. `lerJSON`/`gravarJSON` guardam cada coleção com o
prefixo do app; "Baixar meus dados" (cabeçalho) junta tudo num JSON, para portabilidade (LGPD). Sem
armazenamento (cookies bloqueados), o app funciona só na visita e avisa quando convém.
