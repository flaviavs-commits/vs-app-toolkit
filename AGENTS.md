# AGENTS.md — vs-app-toolkit

> Ponto de entrada para agentes (e pessoas). Gerador de apps satélite do ecossistema (`create-vs-app.py` + `template/`). Padrão de qualidade:
> [Felixo System Design](https://github.com/Felipe-Alcantara/Felixo-System-Design) (a pasta
> `Padrão de qualidade - Felixo System Design/`, quando existe, é só uma cópia local).

## Antes de mexer

1. Leia o `IA.md` (linha do tempo de decisões, **append-only**) e o `README.md`.
2. Segredo nunca entra no repositório: valores reais só em `.env` (ignorado) e no painel do host; nada de token, chave ou URL privada em código, documentação, commit ou log.
3. Preserve arquivos e mudanças que não são da sua tarefa (outros agentes e pessoas trabalham no mesmo repositório).

## Gate antes do commit

Gerar um app de teste (`python create-vs-app.py --name "Teste" --slug teste --port 3099 --dest <pasta>`) e rodar `npm test` do front e do `backend/` do app gerado.

## Git

- Commits pequenos direto no `main`, no formato `tipo(escopo): descrição` em português. Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`, `perf`, `style`, `revert`. O hook `commit-msg` confere
  (`git config core.hooksPath .githooks`).
- Branch só para feature grande, refatoração significativa ou alto risco (`feat/`, `fix/`, `refactor/`, `docs/`); entrou no `main`, apague a local e a remota.
- Documentação viva no mesmo push: README, `docs/` e uma entrada datada no `IA.md`.
- Regras completas, inclusive quebra de linha LF e o que fazer com trabalho que não vai entrar: [`docs/VERSIONAMENTO.md`](docs/VERSIONAMENTO.md).
