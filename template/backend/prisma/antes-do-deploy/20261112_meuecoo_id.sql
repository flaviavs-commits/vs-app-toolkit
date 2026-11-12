-- Id estável da conta no Meu Ecoo, para os avisos de exclusão de conta e troca de e-mail
-- (POST /api/meuecoo/eventos; contrato em docs/EVENTOS-DE-CONTA.md do MeuEcoo).
--
-- Rode ANTES de publicar o backend com a coluna `meuEcooId` num banco que já tem contas:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/antes-do-deploy/20261112_meuecoo_id.sql
-- O `start` roda `prisma db push`, que recusa criar sozinho um índice único numa tabela existente
-- ("There might be data loss", conferido em 12/11/2026) e derruba o deploy. Banco novo não precisa:
-- o `db push` cria tudo. Coluna nova e opcional; não mexe em dado existente. Pode rodar de novo.

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meuecoo_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_meuecoo_id_key" ON "users"("meuecoo_id");
