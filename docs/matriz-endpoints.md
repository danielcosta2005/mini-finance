# Matriz de cobertura HTTP

Execução local em 17/11/2026: **52/52 endpoints** tiveram sucesso observado via HTTP real. O inventário foi comparado às rotas montadas em src/app.ts e aos módulos routes.ts.

São 50 cenários de API, mais 39 verificações de infraestrutura e integridade. O relatório completo é gerado em backend/test-reports/endpoints.json. A tabela abaixo apresenta um cenário de exemplo por rota e a quantidade de cenários de erro observados; as asserções completas estão nos arquivos indicados.

| Endpoint | Arquivo | Cenário de sucesso observado | Cenários com erro |
| --- | --- | --- | --- |
| DELETE /api/accounts/:id | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > cria, consulta, altera e exclui conta sem dependências | 2 |
| DELETE /api/budgets/:id | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | orçamentos e resumo por competência > executa CRUD de orçamento, unicidade e filtros | 1 |
| DELETE /api/cards/:id | [cards.cases.ts](../backend/tests/integration/api/cards.cases.ts) | cartões, parcelas, calendário e quitação > executa CRUD de cartão sem histórico e valida limites e dias | 2 |
| DELETE /api/categories/:id | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > executa CRUD de categorias, busca, filtro e ordenação | 2 |
| DELETE /api/goals/:id | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | metas e contribuições sem movimentação bancária > executa CRUD de meta, filtra datas e pagina resultados | 2 |
| DELETE /api/recurrences/:id | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | recorrências processadas pelo relógio do servidor > executa CRUD de recorrência sem lançamentos e filtra referências/status | 2 |
| DELETE /api/transactions/:id | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > recalcula saldos após criar, editar, mover e excluir lançamento | 1 |
| GET /api/accounts | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | HTTP público e autenticação persistida > exige Origin autorizado nas mutações autenticadas (+2) | 2 |
| GET /api/accounts/:id | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > cria, consulta, altera e exclui conta sem dependências (+8) | 2 |
| GET /api/auth/me | [auth.cases.ts](../backend/tests/integration/api/auth.cases.ts) | HTTP público e autenticação persistida > registra usuário público sem expor material de autenticação (+1) | 3 |
| GET /api/budgets | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | orçamentos e resumo por competência > executa CRUD de orçamento, unicidade e filtros | 1 |
| GET /api/budgets/:id | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | cartões, parcelas, calendário e quitação > quita integralmente, libera limite e não duplica despesa no dashboard/orçamento (+2) | 1 |
| GET /api/cards | [cards.cases.ts](../backend/tests/integration/api/cards.cases.ts) | cartões, parcelas, calendário e quitação > executa CRUD de cartão sem histórico e valida limites e dias | 0 |
| GET /api/cards/:id | [cards.cases.ts](../backend/tests/integration/api/cards.cases.ts) | cartões, parcelas, calendário e quitação > executa CRUD de cartão sem histórico e valida limites e dias (+2) | 2 |
| GET /api/cards/:id/invoices | [cards.cases.ts](../backend/tests/integration/api/cards.cases.ts) | cartões, parcelas, calendário e quitação > divide 10001 centavos em três parcelas e preserva a soma exata (+2) | 1 |
| GET /api/cards/:id/purchases | [cards.cases.ts](../backend/tests/integration/api/cards.cases.ts) | cartões, parcelas, calendário e quitação > divide 10001 centavos em três parcelas e preserva a soma exata | 1 |
| GET /api/categories | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > executa CRUD de categorias, busca, filtro e ordenação (+1) | 0 |
| GET /api/categories/:id | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > executa CRUD de categorias, busca, filtro e ordenação | 2 |
| GET /api/dashboard | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | contas, categorias, lançamentos e transferências > transfere atomicamente sem gerar receitas/despesas ou alterar saldo consolidado (+4) | 1 |
| GET /api/goals | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | metas e contribuições sem movimentação bancária > executa CRUD de meta, filtra datas e pagina resultados (+1) | 1 |
| GET /api/goals/:id | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | metas e contribuições sem movimentação bancária > executa CRUD de meta, filtra datas e pagina resultados (+1) | 2 |
| GET /api/goals/:id/contributions | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | metas e contribuições sem movimentação bancária > filtra contribuições por datas inclusivas e pagina sem misturar metas | 1 |
| GET /api/health | [auth.cases.ts](../backend/tests/integration/api/auth.cases.ts) | HTTP público e autenticação persistida > responde nos dois endpoints públicos de saúde | 0 |
| GET /api/invoices/:id | [cards.cases.ts](../backend/tests/integration/api/cards.cases.ts) | cartões, parcelas, calendário e quitação > preserva snapshots de faturas após alterar configuração e aceita disponível negativo (+2) | 1 |
| GET /api/recurrences | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | recorrências processadas pelo relógio do servidor > executa CRUD de recorrência sem lançamentos e filtra referências/status | 1 |
| GET /api/recurrences/:id | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | recorrências processadas pelo relógio do servidor > executa CRUD de recorrência sem lançamentos e filtra referências/status (+3) | 2 |
| GET /api/transactions | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > filtra lançamentos por conta, categoria, tipo e datas inclusivas com paginação (+12) | 2 |
| GET /api/transactions/:id | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > recalcula saldos após criar, editar, mover e excluir lançamento | 1 |
| GET /api/transfers | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > transfere atomicamente sem gerar receitas/despesas ou alterar saldo consolidado (+1) | 1 |
| GET /health | [auth.cases.ts](../backend/tests/integration/api/auth.cases.ts) | HTTP público e autenticação persistida > responde nos dois endpoints públicos de saúde | 0 |
| PATCH /api/accounts/:id | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > cria, consulta, altera e exclui conta sem dependências | 2 |
| PATCH /api/budgets/:id | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | orçamentos e resumo por competência > executa CRUD de orçamento, unicidade e filtros | 1 |
| PATCH /api/cards/:id | [cards.cases.ts](../backend/tests/integration/api/cards.cases.ts) | cartões, parcelas, calendário e quitação > executa CRUD de cartão sem histórico e valida limites e dias (+1) | 2 |
| PATCH /api/categories/:id | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > executa CRUD de categorias, busca, filtro e ordenação | 2 |
| PATCH /api/goals/:id | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | metas e contribuições sem movimentação bancária > executa CRUD de meta, filtra datas e pagina resultados | 2 |
| PATCH /api/recurrences/:id | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | recorrências processadas pelo relógio do servidor > executa CRUD de recorrência sem lançamentos e filtra referências/status (+2) | 2 |
| PATCH /api/transactions/:id | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > recalcula saldos após criar, editar, mover e excluir lançamento | 1 |
| POST /api/accounts | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > cria, consulta, altera e exclui conta sem dependências (+27) | 3 |
| POST /api/auth/login | [auth.cases.ts](../backend/tests/integration/api/auth.cases.ts) | HTTP público e autenticação persistida > faz login com email normalizado e define cookie de produção seguro | 1 |
| POST /api/auth/logout | [auth.cases.ts](../backend/tests/integration/api/auth.cases.ts) | HTTP público e autenticação persistida > logout revoga a sessão no banco e recusa a reutilização do cookie | 0 |
| POST /api/auth/register | [auth.cases.ts](../backend/tests/integration/api/auth.cases.ts) | HTTP público e autenticação persistida > registra usuário público sem expor material de autenticação (+48) | 1 |
| POST /api/budgets | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | cartões, parcelas, calendário e quitação > quita integralmente, libera limite e não duplica despesa no dashboard/orçamento (+3) | 3 |
| POST /api/cards | [cards.cases.ts](../backend/tests/integration/api/cards.cases.ts) | cartões, parcelas, calendário e quitação > executa CRUD de cartão sem histórico e valida limites e dias (+9) | 0 |
| POST /api/cards/:id/purchases | [cards.cases.ts](../backend/tests/integration/api/cards.cases.ts) | cartões, parcelas, calendário e quitação > divide 10001 centavos em três parcelas e preserva a soma exata (+8) | 3 |
| POST /api/categories | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > executa CRUD de categorias, busca, filtro e ordenação (+28) | 0 |
| POST /api/goals | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | metas e contribuições sem movimentação bancária > executa CRUD de meta, filtra datas e pagina resultados (+4) | 0 |
| POST /api/goals/:id/contributions | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | metas e contribuições sem movimentação bancária > calcula progresso, prazo e contribuições acima do alvo sem alterar contas (+1) | 2 |
| POST /api/invoices/:id/pay | [cards.cases.ts](../backend/tests/integration/api/cards.cases.ts) | cartões, parcelas, calendário e quitação > quita integralmente, libera limite e não duplica despesa no dashboard/orçamento (+1) | 4 |
| POST /api/recurrences | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | recorrências processadas pelo relógio do servidor > executa CRUD de recorrência sem lançamentos e filtra referências/status (+7) | 2 |
| POST /api/recurrences/process | [planning.cases.ts](../backend/tests/integration/api/planning.cases.ts) | recorrências processadas pelo relógio do servidor > materializa janeiro/fevereiro/março preservando âncora 31 e deduplica repetição (+5) | 1 |
| POST /api/transactions | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > impede exclusão de conta/categoria usadas e troca incompatível de tipo (+6) | 2 |
| POST /api/transfers | [ledger.cases.ts](../backend/tests/integration/api/ledger.cases.ts) | contas, categorias, lançamentos e transferências > transfere atomicamente sem gerar receitas/despesas ou alterar saldo consolidado | 1 |
