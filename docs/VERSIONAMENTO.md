# Versionamento (git)

Como versionar o vs-app-toolkit. Vale para pessoas e agentes de IA, em toda sessão. Base: a
[política de git do Felixo System Design](https://github.com/Felipe-Alcantara/Felixo-System-Design/blob/main/docs/GIT-POLITICA-DE-VERSIONAMENTO.md),
com os tipos de commit que o ecossistema MeuEcoo realmente usa (o modelo é o `docs/VERSIONAMENTO.md` do MeuEcoo Mídia).
Volta para o [README](../README.md).

## Em uma frase

Commite direto no `main`, em commits pequenos, em português, no formato `tipo(escopo): descrição`,
com a documentação e o `IA.md` no mesmo push.

Repositório público e sem deploy, mas o `template/` vira um app de verdade para quem o gerar: o que entra aqui chega a apps novos.

## Branches: o padrão é não criar

- **Direto no `main`:** correção, documentação, ajuste localizado, refatoração segura.
- **Branch só para:** feature grande, refatoração que atravessa vários módulos ou mudança de alto risco que
  precisa ser testada antes de entrar. Se não dá para dizer qual das três, não crie.
- **Nome:** `feat/`, `fix/`, `refactor/` ou `docs/` + descrição em kebab-case (`feat/faixas-afiliados`).
- **Depois de entrar no `main`, apague** a local e a remota. Branch viva = trabalho em andamento; trabalho
  parado ou "wip" não fica em branch: ou termina e entra, ou vira tag (abaixo).

```bash
git branch -d <branch>
git push origin --delete <branch>
git fetch --prune
```

Para saber se uma branch já entrou mesmo com SHA diferente (cherry-pick, rebase), compare por conteúdo:
`git cherry -v origin/main origin/<branch>` (todas as linhas com `-` = já está no `main`) ou simule o merge com
`git merge-tree --write-tree origin/main origin/<branch>` e compare a árvore com a do `main`.

**Trabalho que não vai entrar** (experimento, "sobras", wip parado) não fica numa branch esquecida: guarde os
commits numa tag e apague a branch. Os commits continuam alcançáveis pela tag.

```bash
git tag arquivo/<nome-da-branch> origin/<branch>
git push origin arquivo/<nome-da-branch>
git push origin --delete <branch>
```

## Commits

- **Formato:** `tipo(escopo): descrição`, em português, no imperativo ou descritivo, até 120 caracteres na primeira linha.
- **Tipos:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`, `perf`, `style`, `revert`.
  Não invente tipo (`infra:` → `chore(infra):`; `merge:` não existe).
- **Escopo:** a área, em minúsculas e kebab-case (`auth`, `landing`, `deps`). Dois escopos só se a mudança for uma só.
- **Um tema por commit.** Se a descrição precisa de "e" para juntar dois assuntos, são dois commits. Refatoração e
  comportamento novo vão separados.
- **Corpo:** o porquê, quando não for óbvio. Agentes de IA terminam com a linha `Co-Authored-By`.
- **Nunca** `wip`, `update`, `nome`, `ajustes` no `main`.
- **Dependabot:** as mensagens saem como `chore(deps)`/`chore(deps-dev)` quando o `dependabot.yml` tem `commit-message`.

## Antes do push

1. `git pull --rebase`. Merge automático ("Merge branch 'main' of ...") suja o histórico e não deve aparecer; se uma
   branch tiver de entrar, rebase nela e avance o `main` sem commit de merge (`git merge --ff-only`).
2. Rodar o gate: gerar um app de teste (`python create-vs-app.py --name "Teste" --slug teste --port 3099 --dest <pasta>`) e rodar `npm test` do front e do `backend/` do app gerado.
3. Mudança de comportamento leva a documentação e a entrada datada no `IA.md` no mesmo push.

## O que confere sozinho

- **Hook `commit-msg`** (`.githooks/commit-msg` → `scripts/git/validar-commit.cjs`): recusa mensagem fora do formato e
  avisa quando a descrição parece não estar em português. Uma vez por clone: `git config core.hooksPath .githooks` (e `git config pull.rebase true`). Precisa do Node. `git commit --no-verify` pula, só em emergência.
- **CI** (workflow `Commits`, `.github/workflows/commits.yml`): confere as mensagens dos commits de cada push e de cada
  pull request. **Só avisa**: aparece como X no job, sem deixar a CI vermelha nem travar a publicação.
- **Teste do validador:** `node --test scripts/git/validar-commit-test.cjs`.

## Quebra de linha

O `.gitattributes` fixa **LF** em todo arquivo de texto, inclusive em clones no Windows (`* text=auto eol=lf`).

## Nunca

- `git push --force` no `main`. Só com combinação prévia e backup.
- Segredo, `.env`, caminho local ou dado de cliente em arquivo ou mensagem de commit.
- Arquivo pessoal de editor ou de ferramenta versionado (`*.code-workspace`, caches).
