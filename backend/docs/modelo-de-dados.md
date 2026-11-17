# Modelo de dados — MiniFinance

Etapa 2: 15 tabelas PostgreSQL, sem endpoints de negócio. A quitação integral única
por fatura foi confirmada pelo solicitante; pagamentos parciais e estornos ficam
fora deste modelo. Não há integração bancária nem dados de cartão sensíveis.

## Tabelas e domínios

| Arquivo em `src/db/schema/` | Tabelas                                                                               | Responsabilidade                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `identity.ts`               | `users`, `sessions`                                                                   | Nome, e-mail único sem distinção de caixa, hash de senha; sessão com hash SHA-256 do token, expiração e revogação |
| `catalog.ts`                | `accounts`, `categories`                                                              | Conta com tipo e saldo inicial; categoria de receita ou despesa; arquivamento preserva histórico                  |
| `recurrences.ts`            | `recurrences`                                                                         | Valor, conta, categoria, tipo, frequência, intervalo, início, término opcional, próxima execução e status         |
| `ledger.ts`                 | `transactions`, `transfers`, `budgets`                                                | Receitas/despesas diretas, transferências separadas e orçamento por usuário/categoria/mês                         |
| `cards.ts`                  | `credit_cards`, `card_purchases`, `card_installments`, `invoices`, `invoice_payments` | Limite e calendário, compras, parcelas, competências de fatura e quitação por conta                               |
| `goals.ts`                  | `goals`, `goal_contributions`                                                         | Descrição, alvo, prazo e reservas conceituais                                                                     |

Todas as tabelas têm UUID gerado pelo PostgreSQL e `created_at`/`updated_at` em
`timestamptz`. Triggers atualizam `updated_at`, inclusive em SQL direto. Datas
financeiras usam `date`, sem horário. Datas financeiras infinitas são rejeitadas.

`relations.ts` declara as relações Drizzle, incluindo origem/destino de transferência
e compra → parcelas → fatura → pagamento. `types.ts` exporta `$inferSelect` e
`$inferInsert` de todas as tabelas, além de `PublicUser` sem hash de senha.
Os tipos internos de autenticação não são DTOs de resposta.

## Integridade e proprietário

Todas as entidades do usuário possuem `user_id`. FKs compostas incluem proprietário,
tipo de categoria e, quando aplicável, cartão. Uma parcela pertence à mesma compra,
cartão e usuário de sua fatura. Categorias de receita não podem ser usadas em
despesas, compras de cartão ou orçamentos. Cada movimentação tem valor positivo.

Unicidades: e-mail normalizado, hash de sessão, orçamento por usuário/categoria/mês,
fatura por cartão/período, parcela por compra/número, pagamento por fatura e
transação por `(recurrence_id, recurrence_on)`. O identificador da ocorrência é a
data originalmente agendada, separada da data financeira editável do lançamento;
sem recorrência, ambos os campos ficam nulos.

Índices cobrem usuário/período, usuário/conta/período, usuário/categoria/período,
Fks de contas/categorias/cartões e busca das recorrências ativas pela próxima data.
Meses de orçamento e fatura são representados pelo primeiro dia do mês.

Excluir pais referenciados é restrito. Sessões acompanham a exclusão de um usuário
sem outros vínculos; parcelas acompanham a exclusão de compra não quitada.
Compras com qualquer parcela quitada, parcelas de fatura paga e pagamentos
registrados ficam protegidos de alteração/exclusão. Arquivamento é preferível a
apagar cadastros com histórico. Uma futura política de estorno deverá ter registro
próprio; não se apaga uma quitação para tentar novamente.

As FKs asseguram a coerência entre proprietários. A API futura deve obter o usuário
da sessão e filtrar leituras por `user_id`; o modelo não implementa autenticação de
requisições nem políticas RLS de conexão PostgreSQL.

## Centavos e JSON

Colunas monetárias são `BIGINT`; cada valor fica no intervalo seguro de inteiros
JavaScript: `-9007199254740991` a `9007199254740991`. Saldo inicial pode ser zero ou
negativo. Movimentações, parcelas, metas e orçamentos são positivos; limite do
cartão pode ser zero. Drizzle usa `mode: 'number'` somente com esses checks no banco.

`src/shared/money.ts` fornece schemas Zod sem coerção para entrada JSON e
`toJsonCents` para saída. Rejeita frações, strings, NaN, infinitos e inteiros fora
do intervalo; não arredonda valores para fazê-los caber.

`SUM(BIGINT)` retorna `numeric`, mantido como string nas views e no driver para
preservar exatidão. Converter o inteiro para `BigInt` e então `toJsonCents` antes
de expor um agregado como número JSON. Um saldo agregado pode superar o intervalo;
nesse caso a conversão falha explicitamente. O total de uma fatura também possui
check diferido de intervalo seguro, permitindo sua quitação integral.

## Regras financeiras

1. Saldo = inicial + receitas − despesas + transferências recebidas − enviadas −
   quitações pagas pela conta. `account_balances` calcula essa expressão; não há
   coluna de saldo corrente para sincronizar.
2. Transferências ficam em tabela própria e não entram em receitas/despesas do
   dashboard ou do orçamento.
3. Compra no cartão cria suas parcelas e faturas em uma transação SQL. A compra
   não é um débito bancário nem outra linha em `transactions`.
4. Quitação cria uma linha em `invoice_payments`, vinculada à conta. O pagamento
   reduz o saldo dessa conta uma vez; não é lançado novamente como despesa.
   Valor deve ser o total integral e a data deve ser igual ou posterior ao fechamento.
   A unicidade da fatura impede pagamento duplicado, inclusive em concorrência.
5. `card_available_limits` subtrai do limite todas as parcelas ainda não quitadas,
   inclusive futuras. Pagamentos liberam apenas o valor das respectivas parcelas.
   Limite disponível negativo representa utilização acima do limite cadastrado;
   o modelo permite registrar o histórico sem aplicar política de autorização de compra.
6. `budget_spending` soma despesas diretas no mês e parcelas cuja fatura pertence
   ao mês. Quitação e transferência não entram nessa soma. `invoice_totals` deriva
   total, pago, saldo a quitar e data de pagamento sem outro total mutável.
7. Aportes em metas somam reservas conceituais e podem superar o alvo. Não possuem
   conta bancária de saída, não são transferências e não alteram saldo de contas.

As views representam todos os registros gravados. Consultas de dashboard ou de
saldo em uma data devem aplicar o recorte aos campos financeiros correspondentes.
Pagamento registrado representa quitação confirmada; agendamento bancário está
fora do escopo.

## Fatura e parcelamento

O dia de fechamento pertence ao ciclo que está fechando. Compra posterior a esse
dia entra no próximo fechamento. Os dias 29/30/31 são limitados ao último dia do
mês, incluindo fevereiro e anos bissextos.

O mês de vencimento é definido pelos dias **configurados**, antes do ajuste:
se `due_day > closing_day`, vence no mês do fechamento; caso contrário, no mês
seguinte. Depois, ambos os dias são limitados ao último dia do mês. O período da
fatura é o primeiro dia do mês de vencimento. Isso mantém competências mensais
consecutivas, sem pular ou duplicar fevereiro. Em mês curto, fechamento e
vencimento podem coincidir quando dias configurados diferentes são ajustados.

Exemplos fictícios: fechamento 10/vencimento 20 e compra em 10/01 → fatura de janeiro;
compra em 11/01 → fevereiro. Fechamento 31/vencimento 10 em fevereiro → fecha no
último dia de fevereiro e vence em 10/03. Fechamento 28/vencimento 31 em fevereiro
de 2026 → ambos em 28/02, competência fevereiro. Dias iguais configurados levam o
vencimento ao mês seguinte.

`invoices` guarda snapshots dos dias e datas. Mudanças no cartão valem para novas
faturas; calendário de fatura com parcelas é imutável. Parcelas seguem meses
consecutivos a partir da primeira fatura. O helper `getInvoiceDates` calcula as
datas sem depender do fuso horário do processo.

Rateio: dividir o total pelo número de parcelas usando inteiros; dar um centavo
adicional às primeiras `total % quantidade` parcelas. Exemplo: 1000/3 → 334, 333,
333. `getInstallmentCents` usa `BigInt` internamente. Cada parcela é positiva e a
quantidade não pode superar o total em centavos.

Constraints diferidas exigem, ao final da transação, todas as parcelas numeradas,
soma exata, rateio correto e sequência de faturas. SQLs que criem apenas a compra
ou gravem parcelas isoladas fora de uma transação completa são rejeitados no commit.
Atualizações dos agregados serializam escritas concorrentes; em Repeatable Read,
a aplicação deve tratar `40001` repetindo a transação inteira.

## Migrations e execução

`0000_initial_financial_model.sql` foi gerada pelo Drizzle Kit. Contém tabelas,
enums, checks, FKs e índices. `0001_financial_integrity.sql` é uma migration custom
versionada: triggers, validações entre linhas e quatro views. Os snapshots e o
journal também são versionados. Não foi usado `drizzle-kit push`.

Checks PostgreSQL não consultam outras linhas com segurança; por isso a validação
de somas usa constraint triggers diferidas. Referência:
[PostgreSQL constraints](https://www.postgresql.org/docs/17/ddl-constraints.html) e
[constraint triggers](https://www.postgresql.org/docs/17/sql-createtrigger.html).

Em `backend/`: `npm run db:generate` gera próximas alterações e `npm run db:migrate`
aplica as migrations. Manter qualquer SQL custom sob revisão e criar novas
migrations para evoluir triggers/views; não alterar migrations já aplicadas.
`views.ts` usa `.existing()` para mapear essas views sem uma segunda definição DDL.
Os scripts e a configuração Drizzle da etapa anterior foram preservados.
