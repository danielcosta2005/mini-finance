# Migrations

`0000_initial_financial_model.sql` cria as 15 tabelas, enums, checks, FKs e índices.
`0001_financial_integrity.sql` acrescenta invariantes entre linhas, auditoria e views.
O journal e os snapshots acompanham as migrations; não usar `drizzle-kit push`.

Para novas mudanças, alterar os domínios exportados em `src/db/schema/index.ts`, executar
`npm run db:generate`, revisar o SQL e versionar os arquivos gerados junto do
schema. Aplicar com `npm run db:migrate`. Não editar migrations já aplicadas.

Os comandos carregam `.env` quando disponível e exigem `DATABASE_URL` válida.
Os scripts devem rodar a partir de `backend/`. Regras financeiras e transações de
parcelamento/quitação: [modelo de dados](../docs/modelo-de-dados.md).
