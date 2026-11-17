# API do MiniFinance

Contrato da API implementada em `backend/src/modules`. Todos os nomes, endereços e identificadores dos exemplos são fictícios. A base das rotas de negócio é `/api`; os exemplos usam uma implantação ilustrativa em `https://finance.example.test`.

## Convenções

- Requisições com corpo usam `Content-Type: application/json`. Os schemas são estritos: campos desconhecidos no corpo ou nas consultas que possuem schema retornam `400`. Parâmetros de consulta repetidos também são rejeitados.
- Identificadores são UUIDs. `userId`, `id`, datas de auditoria, saldos calculados e demais campos indicados como calculados são definidos pelo servidor.
- Datas financeiras usam `YYYY-MM-DD`, sem horário, entre os anos 0001 e 9999. Competências usam `YYYY-MM`; `period` é o primeiro dia desse mês, como `2026-11-01`. Timestamps de auditoria são strings ISO em UTC, como `2026-11-12T15:00:00.000Z`.
- Valores monetários são números inteiros em centavos, dentro de `Number.MIN_SAFE_INTEGER` e `Number.MAX_SAFE_INTEGER`. Campos de valor positivo exigem pelo menos 1; limite de cartão permite zero; saldo inicial de conta pode ser negativo.
- Somatórios são calculados sem perda de precisão. Se o resultado não puder ser representado como inteiro seguro no JSON, a API responde `422`, em vez de devolver um valor arredondado.
- Percentuais são strings com duas casas, como `"25.00"`, calculadas com aritmética inteira e truncamento. Podem superar `"100.00"`.
- `name`: texto aparado com 1–120 caracteres. `description`: texto aparado com 1–500 caracteres, exceto a descrição opcional de transferência, que permite texto vazio.
- `PATCH` aceita um subconjunto não vazio dos campos editáveis da criação; valida o resultado combinado com o registro atual. Campos omitidos permanecem iguais.
- Cada consulta, relacionamento e alteração é limitada ao usuário autenticado. Um UUID existente de outro usuário recebe `404`, inclusive em filtros e referências a contas/categorias.
- A API registra fatos financeiros: não impõe saldo suficiente nem bloqueia uma compra por ultrapassar o limite disponível.

Criação retorna `201`; leitura, alteração, exclusão, login, logout, processamento e pagamento retornam `200`. Um item usa `{"data": ...}`. Exclusões bem-sucedidas usam:

```json
{"data":{"id":"00000000-0000-4000-8000-000000000001","deleted":true}}
```

Listagens usam `page` (padrão 1; máximo 1.000.000) e `pageSize` (padrão 20; máximo 100), ambos inteiros positivos:

```json
{
  "data": [],
  "pagination": {"page": 1, "pageSize": 20, "total": 0, "totalPages": 0}
}
```

Datas `from` e `to`, quando disponíveis, são limites inclusivos; `from` não pode superar `to`. Todos os filtros de cada tabela abaixo são opcionais.

## Saúde e catálogo de rotas

`GET /health` e `GET /api/health` são públicos e retornam diretamente `{"status":"ok"}`, sem envelope `data`. Não representam uma consulta de disponibilidade do PostgreSQL.

| Método | Rota | Resultado |
| --- | --- | --- |
| POST | /api/auth/register | Cadastra usuário e inicia sessão |
| POST | /api/auth/login | Inicia sessão |
| GET | /api/auth/me | Usuário da sessão |
| POST | /api/auth/logout | Revoga sessão atual |
| GET | /api/accounts | Lista contas |
| POST | /api/accounts | Cria conta |
| GET | /api/accounts/:id | Consulta conta |
| PATCH | /api/accounts/:id | Altera conta |
| DELETE | /api/accounts/:id | Exclui conta sem dependências |
| GET | /api/categories | Lista categorias |
| POST | /api/categories | Cria categoria |
| GET | /api/categories/:id | Consulta categoria |
| PATCH | /api/categories/:id | Altera categoria |
| DELETE | /api/categories/:id | Exclui categoria sem dependências |
| GET | /api/transactions | Lista lançamentos |
| POST | /api/transactions | Cria lançamento |
| GET | /api/transactions/:id | Consulta lançamento |
| PATCH | /api/transactions/:id | Altera lançamento |
| DELETE | /api/transactions/:id | Exclui lançamento |
| GET | /api/transfers | Lista transferências |
| POST | /api/transfers | Registra transferência |
| GET | /api/budgets | Lista orçamentos |
| POST | /api/budgets | Cria orçamento |
| GET | /api/budgets/:id | Consulta orçamento |
| PATCH | /api/budgets/:id | Altera orçamento |
| DELETE | /api/budgets/:id | Exclui orçamento |
| GET | /api/cards | Lista cartões |
| POST | /api/cards | Cria cartão |
| GET | /api/cards/:id | Consulta cartão |
| PATCH | /api/cards/:id | Altera cartão |
| DELETE | /api/cards/:id | Exclui cartão sem histórico |
| GET | /api/cards/:id/purchases | Lista compras do cartão |
| POST | /api/cards/:id/purchases | Cria compra e parcelas |
| GET | /api/cards/:id/invoices | Lista faturas do cartão |
| GET | /api/invoices/:id | Consulta fatura detalhada |
| POST | /api/invoices/:id/pay | Quita integralmente a fatura |
| GET | /api/goals | Lista metas |
| POST | /api/goals | Cria meta |
| GET | /api/goals/:id | Consulta meta e progresso |
| PATCH | /api/goals/:id | Altera meta |
| DELETE | /api/goals/:id | Exclui meta sem contribuições |
| GET | /api/goals/:id/contributions | Lista contribuições |
| POST | /api/goals/:id/contributions | Registra contribuição |
| GET | /api/recurrences | Lista recorrências |
| POST | /api/recurrences | Cria recorrência |
| POST | /api/recurrences/process | Materializa ocorrências vencidas |
| GET | /api/recurrences/:id | Consulta recorrência |
| PATCH | /api/recurrences/:id | Altera recorrência |
| DELETE | /api/recurrences/:id | Exclui recorrência sem lançamentos |
| GET | /api/dashboard | Resumo financeiro por competência |

Transferências, compras, parcelas e contribuições não possuem rotas próprias de alteração/exclusão. Faturas são produzidas pelas compras; não há criação manual nem rota global de listagem de faturas.

## Autenticação e segurança HTTP

Somente saúde, cadastro e login dispensam sessão. Cadastro e login exigem `Origin` autorizado, assim como **todas as mutações**, inclusive logout, `PATCH`, `DELETE` e processamento de recorrências. Ausência de `Origin` não autoriza clientes de terminal.

Senhas têm 12–128 caracteres e são persistidas como hash Argon2id. E-mail é aparado e normalizado para minúsculas. Sessões são persistidas no banco; apenas o hash SHA-256 do identificador opaco da sessão é armazenado. O cookie tem `HttpOnly`, `SameSite=Lax` e `Path=/`; em produção também tem `Secure` e nome `__Host-minifinance_session`, sem `Domain`. Em desenvolvimento chama-se `minifinance_session`. A resposta JSON nunca inclui senha, hash ou identificador de sessão.

A proteção contra CSRF combina allowlist exata de `Origin`, corpos JSON e cookie SameSite. Não há token CSRF adicional. CORS permite credenciais apenas para origens configuradas. O frontend deve usar `credentials: 'include'`; uma implantação no mesmo site é compatível com o cookie Lax.

Cadastro e login compartilham limite de 20 tentativas por minuto por endereço do par de transporte. Esse limitador reside na memória de **cada processo**, não é distribuído e não usa cabeçalhos de encaminhamento enviados pelo cliente. Ao exceder, retorna `429` com `Retry-After: 60`. O tamanho máximo do corpo de requisições `/api/*` é 32 KiB.

### Cadastro e login

`POST /api/auth/register` recebe `name`, `email` e `password`; `POST /api/auth/login` recebe apenas `email` e `password`. O exemplo abaixo pressupõe que a variável de ambiente `$PASSWORD` foi exportada e fornecida externamente; não coloca valores de senha no documento nem grava o corpo em arquivo. O jar contém a sessão e deve permanecer local, fora do versionamento.

```bash
BASE_URL='https://finance.example.test'
ORIGIN='https://finance.example.test'

jq -n '{name:"Pessoa Exemplo",email:"pessoa@example.test",password:env.PASSWORD}' |
  curl --fail-with-body -sS -c cookies.txt \
    -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
    --data-binary @- "$BASE_URL/api/auth/register"

jq -n '{email:"pessoa@example.test",password:env.PASSWORD}' |
  curl --fail-with-body -sS -c cookies.txt \
    -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
    --data-binary @- "$BASE_URL/api/auth/login"
```

Cadastro retorna `201`, login `200`, ambos com cookie e usuário público:

```json
{
  "data": {
    "id": "00000000-0000-4000-8000-000000000001",
    "name": "Pessoa Exemplo",
    "email": "pessoa@example.test",
    "createdAt": "2026-11-12T15:00:00.000Z",
    "updatedAt": "2026-11-12T15:00:00.000Z"
  }
}
```

`GET /api/auth/me` retorna o mesmo formato de usuário. `POST /api/auth/logout` aceita `{}` ou corpo vazio, revoga a sessão atual e retorna `{"data":{"loggedOut":true}}`.

```bash
curl --fail-with-body -sS -b cookies.txt "$BASE_URL/api/auth/me"
curl --fail-with-body -sS -b cookies.txt -c cookies.txt \
  -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -d '{}' "$BASE_URL/api/auth/logout"
```

### Padrão para chamadas autenticadas

Após autenticação, envie o jar em todas as chamadas protegidas e `Origin` nas mutações. Exemplo de criação:

```bash
curl --fail-with-body -sS -b cookies.txt \
  -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -d '{"name":"Conta exemplo","type":"checking","openingBalanceCents":10000}' \
  "$BASE_URL/api/accounts"
```

## Contas

Criação:

```json
{"name":"Conta exemplo","type":"checking","openingBalanceCents":10000}
```

Campos editáveis: `name`, `type` e `openingBalanceCents`. Tipos: `checking`, `savings`, `cash`, `investment`, `other`. Saldo inicial é opcional na criação, com padrão zero.

| Consulta GET /api/accounts | Valores/padrão |
| --- | --- |
| page, pageSize | Paginação comum |
| type | Um dos tipos de conta |
| order | asc (padrão), desc; ordena por nome |

Resposta de criação/consulta/alteração e itens da listagem:

```json
{
  "data": {
    "id":"00000000-0000-4000-8000-000000000010",
    "userId":"00000000-0000-4000-8000-000000000001",
    "name":"Conta exemplo",
    "type":"checking",
    "openingBalanceCents":10000,
    "archivedAt":null,
    "createdAt":"2026-11-12T15:00:00.000Z",
    "updatedAt":"2026-11-12T15:00:00.000Z",
    "balanceCents":10000
  }
}
```

`balanceCents` vem da view de saldos: saldo inicial + receitas − despesas diretas + transferências recebidas − transferências enviadas − pagamentos de faturas. Compras do cartão e contribuições de metas não movimentam a conta. O saldo inclui registros existentes independentemente do mês selecionado no dashboard.

Exemplo de alteração: `PATCH /api/accounts/:id` com `{"name":"Conta exemplo revisada"}`. Exclusão com dependências financeiras retorna `409`; não apaga o histórico em cascata. `archivedAt` é campo de resposta, sem edição pelos schemas atuais.

## Categorias

Criação:

```json
{"name":"Despesa exemplo","type":"expense"}
```

Campos editáveis: `name` e `type` (`income` ou `expense`). Retorno: esses campos, `id`, `userId`, `archivedAt`, `createdAt` e `updatedAt`.

| Consulta GET /api/categories | Valores/padrão |
| --- | --- |
| page, pageSize | Paginação comum |
| type | income, expense |
| search | Texto de 1–120 caracteres para busca por nome |
| sortBy | name (padrão), createdAt |
| order | asc (padrão), desc |

Exemplo: `GET /api/categories?type=expense&search=exemplo&page=1&pageSize=20`. Alteração: `PATCH /api/categories/:id` com `{"name":"Despesa exemplo revisada"}`. Categoria referenciada não pode ser excluída, nem ter seu tipo alterado de forma incompatível com o histórico; esses conflitos retornam `409`.

## Lançamentos diretos

`POST /api/transactions`:

```json
{
  "accountId":"00000000-0000-4000-8000-000000000010",
  "categoryId":"00000000-0000-4000-8000-000000000020",
  "type":"expense",
  "amountCents":2500,
  "description":"Despesa exemplo",
  "occurredOn":"2026-11-12"
}
```

Todos esses campos são obrigatórios e editáveis por `PATCH`. `type` é `income` ou `expense` e deve coincidir com o tipo da categoria; incompatibilidade retorna `422`. Contas/categorias inexistentes ou de outro usuário retornam `404`.

Retorno: campos enviados, `id`, `userId`, `createdAt`, `updatedAt`, `recurrenceId` e `recurrenceOn`. Nos lançamentos manuais, os dois últimos são `null`; quando gerados por recorrência identificam a regra e sua ocorrência. Esses vínculos não são aceitos no corpo de criação/alteração.

| Consulta GET /api/transactions | Valores/padrão |
| --- | --- |
| page, pageSize | Paginação comum |
| accountId, categoryId | UUID de recurso do usuário |
| type | income, expense |
| from, to | Filtram occurredOn |
| sortBy | date (padrão), amount, createdAt |
| order | desc (padrão), asc |

Exemplo: `GET /api/transactions?from=2026-11-01&to=2026-11-30&type=expense&sortBy=amount&order=desc`. Alteração: `PATCH /api/transactions/:id` com `{"amountCents":2800,"description":"Despesa revisada"}`. `DELETE /api/transactions/:id` remove o lançamento e os saldos/resumos passam a refletir a remoção.

## Transferências

`POST /api/transfers`:

```json
{
  "sourceAccountId":"00000000-0000-4000-8000-000000000010",
  "destinationAccountId":"00000000-0000-4000-8000-000000000011",
  "amountCents":5000,
  "occurredOn":"2026-11-12",
  "description":"Transferência exemplo"
}
```

Os campos são obrigatórios, exceto `description`. As contas devem ser diferentes e pertencer ao usuário. Retorno: campos do registro, `id`, `userId`, `createdAt` e `updatedAt`; descrição omitida é `null`.

| Consulta GET /api/transfers | Valores/padrão |
| --- | --- |
| page, pageSize | Paginação comum |
| accountId | Filtra a conta na origem ou no destino |
| from, to | Filtram occurredOn |
| order | desc (padrão), asc; ordena por occurredOn |

A operação é atômica. Não cria receita/despesa, não muda o saldo consolidado e não exige fundos suficientes.

## Orçamentos

`POST /api/budgets`:

```json
{"categoryId":"00000000-0000-4000-8000-000000000020","month":"2026-11","limitCents":30000}
```

Campos editáveis: `categoryId`, `month` e `limitCents`; os três são obrigatórios na criação. Categoria deve ser `expense`. Há um orçamento por usuário, categoria e competência; duplicidade retorna `409`.

Retorno: `id`, `userId`, `categoryId`, `categoryType: "expense"`, `period`, `limitCents`, `createdAt`, `updatedAt`, mais `month`, `spentCents`, `remainingCents`, `percentageUsed` e `exceeded`. `remainingCents` pode ser negativo.

| Consulta GET /api/budgets | Valores/padrão |
| --- | --- |
| page, pageSize | Paginação comum |
| month | Competência YYYY-MM; omitido lista todas |
| categoryId | UUID da categoria |
| sortBy | month (padrão), limit, createdAt |
| order | desc (padrão), asc |

`spentCents` soma despesas diretas no mês de `occurredOn` e parcelas no mês de `invoice.period`. Transferências e pagamentos de fatura não acrescentam despesa. Exemplo de métricas para limite 30000 e consumo 7500: `spentCents: 7500`, `remainingCents: 22500`, `percentageUsed: "25.00"`, `exceeded: false`.

Alteração: `PATCH /api/budgets/:id` com `{"limitCents":35000}`. A exclusão do orçamento não apaga seus lançamentos.

## Cartões, compras e faturas

### Cartões

`POST /api/cards`:

```json
{"name":"Cartão exemplo","creditLimitCents":100000,"closingDay":20,"dueDay":28}
```

Todos os campos são obrigatórios e editáveis. `creditLimitCents` deve ser não negativo; `closingDay` e `dueDay` são inteiros de 1 a 31. A listagem aceita somente paginação.

Retorno: campos enviados, `id`, `userId`, `archivedAt`, `createdAt`, `updatedAt` e `availableCents`. O disponível é o limite menos as obrigações não quitadas; pode ficar negativo. Compra acima do disponível e redução do limite abaixo das obrigações são aceitas.

Alteração: `PATCH /api/cards/:id` com `{"closingDay":25}`. Calendários de faturas já criadas são snapshots e não mudam com a configuração do cartão. Cartão com compras/faturas não pode ser excluído (`409`).

### Compras parceladas

`POST /api/cards/:id/purchases`:

```json
{
  "categoryId":"00000000-0000-4000-8000-000000000020",
  "totalCents":10001,
  "purchasedOn":"2026-11-20",
  "description":"Compra exemplo",
  "installmentCount":3
}
```

`installmentCount` é opcional, padrão 1, entre 1 e 360 e não pode superar `totalCents`: cada parcela tem ao menos um centavo. Os demais campos são obrigatórios. Cartão e categoria precisam estar ativos; a categoria deve ser de despesa. O processamento da compra, faturas e parcelas é uma única transação.

A divisão preserva exatamente o total: 10001 em três parcelas resulta em 3334, 3334 e 3333 centavos. A resposta `201` contém os campos da compra, `id`, `userId`, `creditCardId`, `categoryType: "expense"`, `createdAt`, `updatedAt` e `installments`. Cada parcela possui `id`, `userId`, `purchaseId`, `creditCardId`, `invoiceId`, `installmentNumber`, `amountCents`, `createdAt` e `updatedAt`.

| Consulta GET /api/cards/:id/purchases | Valores |
| --- | --- |
| page, pageSize | Paginação comum |
| from, to | Filtram purchasedOn |
| categoryId | UUID da categoria |

Itens da listagem são os registros das compras, sem o vetor de parcelas incluído na criação.

### Competência e calendário

O fechamento inclui o próprio dia: compra no fechamento pertence ao ciclo que fecha nesse dia; compra após o fechamento vai para o ciclo seguinte. Dias 29, 30 e 31 são ajustados ao último dia existente no mês, preservando o dia nominal configurado nos meses seguintes.

O vencimento fica no mesmo mês do fechamento quando `dueDay > closingDay`; caso contrário, no mês seguinte. Essa comparação usa os dias **nominais**, antes dos ajustes de calendário. `period` representa o mês do **vencimento**, não necessariamente o mês da compra ou do fechamento.

Exemplo com fechamento 20/vencimento 28: compra em 20/11 entra na fatura `period: "2026-11-01"`, `closesOn: "2026-11-20"`, `dueOn: "2026-11-28"`; em 21/11 entra na fatura de dezembro. Com fechamento 31/vencimento 5, o ciclo de fevereiro fecha no último dia de fevereiro e vence em 5 de março. Cada parcela avança um ciclo mensal.

Uma compra que tente adicionar parcelas a uma fatura quitada retorna `409`. Também há `409` quando sua data conflita com o snapshot do calendário de uma fatura existente após alterações de configuração.

### Consulta e quitação

`GET /api/cards/:id/invoices` aceita paginação e `month=YYYY-MM`, que filtra o mês de vencimento. Sem mês, lista todas as faturas daquele cartão. Cada item contém `id`, `userId`, `creditCardId`, `period`, `closesOn`, `dueOn`, `closingDay`, `dueDay`, `createdAt`, `updatedAt`, `totalCents`, `paidCents`, `outstandingCents`, `paidOn` e `status` (`open` ou `paid`).

`GET /api/invoices/:id` inclui também `installments` e `payment`. As parcelas incluem seus campos de registro e `description`, `purchasedOn` e `installmentCount` da compra. `payment` é `null` antes da quitação; depois contém `id`, `userId`, `invoiceId`, `accountId`, `amountCents`, `paidOn`, `createdAt` e `updatedAt`.

`POST /api/invoices/:id/pay`:

```json
{"accountId":"00000000-0000-4000-8000-000000000010","paidOn":"2026-11-28"}
```

`paidOn` é opcional, padrão hoje no fuso configurado. A conta deve estar ativa. O pagamento exige total positivo, deve ocorrer no fechamento ou depois dele e quita o total calculado pelo servidor: não recebe `amountCents`, não admite pagamento parcial nem nova quitação da mesma fatura. Repetição retorna `409`; chamadas concorrentes são serializadas.

Resposta `200`: a fatura detalhada, com `status: "paid"`, `paidCents` igual a `totalCents`, `outstandingCents: 0`, `paidOn` e `payment` preenchidos. O pagamento reduz o saldo da conta e libera limite; não gera outra despesa nos orçamentos/dashboard.

## Metas e contribuições

`POST /api/goals`:

```json
{"description":"Reserva exemplo","targetCents":100000,"dueOn":"2027-06-30"}
```

Todos os campos são obrigatórios e editáveis. A listagem aceita paginação e `from`/`to` sobre `dueOn`.

Retorno: campos da meta, `id`, `userId`, `archivedAt`, `createdAt`, `updatedAt` e `contributedCents`, `remainingCents`, `progressPercentage`, `achieved`, `overdue`. Com alvo 100000 e contribuições de 25000, retorna `remainingCents: 75000` e `progressPercentage: "25.00"`. Saldo restante é limitado a zero após atingir a meta; contribuições acima do alvo são aceitas e o percentual pode exceder 100.

`overdue` significa prazo anterior a hoje e alvo ainda não atingido. A avaliação usa o clock interno e `APP_TIME_ZONE`.

`POST /api/goals/:id/contributions`:

```json
{"amountCents":25000,"contributedOn":"2026-11-12"}
```

`contributedOn` é opcional, padrão hoje no fuso configurado. Resposta `201`: `id`, `userId`, `goalId`, `amountCents`, `contributedOn`, `createdAt` e `updatedAt`.

`GET /api/goals/:id/contributions` é paginado e aceita `from`/`to` sobre `contributedOn`. Contribuições representam progresso da meta, sem movimentar contas nem criar receitas/despesas. Meta com contribuição não pode ser excluída (`409`).

Alteração: `PATCH /api/goals/:id` com `{"targetCents":120000,"dueOn":"2027-08-31"}`.

## Recorrências

`POST /api/recurrences`:

```json
{
  "accountId":"00000000-0000-4000-8000-000000000010",
  "categoryId":"00000000-0000-4000-8000-000000000020",
  "type":"expense",
  "description":"Despesa recorrente exemplo",
  "amountCents":5000,
  "frequency":"monthly",
  "intervalCount":1,
  "startsOn":"2026-01-31",
  "endsOn":null,
  "status":"active"
}
```

`frequency` permite `daily`, `weekly`, `monthly` e `yearly`, padrão `monthly`. `intervalCount` vai de 1 a 1200, padrão 1. `endsOn` é opcional e aceita `null`; se preenchido deve ser igual ou posterior a `startsOn`. `status` permite `active`, `paused` e `completed`, padrão `active`. Os demais campos são obrigatórios. Tipo deve coincidir com a categoria.

Retorno: os campos da regra, `id`, `userId`, `nextExecutionOn`, `createdAt` e `updatedAt`. `nextExecutionOn` é somente leitura; começa em `startsOn`. Todos os campos de entrada são editáveis; alterar descrição/valor não altera lançamentos anteriores. Mudanças de agenda recalculam a próxima ocorrência preservando o progresso já processado. Uma regra cujo próximo vencimento exceda `endsOn` fica `completed`. Recorrência com lançamentos associados não pode ser excluída (`409`).

| Consulta GET /api/recurrences | Valores |
| --- | --- |
| page, pageSize | Paginação comum |
| accountId, categoryId | UUID de recurso do usuário |
| type | income, expense |
| status | active, paused, completed |

### Processamento explícito

`POST /api/recurrences/process` aceita `{}` ou corpo vazio, sem parâmetros de consulta. Não existe disparo automático em segundo plano nesta etapa. Não envie `now`, `referenceDate`, `nextExecutionOn` nem outra data de referência: a data limite é obtida exclusivamente do clock interno no fuso configurado.

Somente regras `active` com próxima ocorrência até hoje são processadas; `endsOn` é inclusivo. Cada ocorrência cria um lançamento direto com `occurredOn` e `recurrenceOn` iguais à data agendada. Frequências mensais/anuais são ancoradas em `startsOn`: dia 31 resulta em 31/jan → 28/fev → 31/mar, preservando a âncora após meses curtos.

O processamento usa transação, bloqueio de regras com `FOR UPDATE SKIP LOCKED`, unicidade de `(recurrenceId, recurrenceOn)` e atualização atômica do cursor. Repetir uma execução não cria duas transações para a mesma ocorrência.

Cada chamada trata no máximo **100 regras e 1000 ocorrências**:

```json
{
  "data": {
    "processedRules": 1,
    "processedOccurrences": 3,
    "createdTransactions": 3,
    "more": false,
    "limits": {"rules": 100, "occurrences": 1000}
  }
}
```

Repita enquanto `more` for `true`. Com chamadas concorrentes, uma chamada pode pular regras bloqueadas por outra e criar zero registros; coordene as chamadas e repita após a conclusão das execuções concorrentes até obter `more: false`. `processedOccurrences` conta também ocorrências já existentes encontradas pela proteção de unicidade; `createdTransactions` conta apenas novos lançamentos.

```bash
curl --fail-with-body -sS -b cookies.txt \
  -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -d '{}' "$BASE_URL/api/recurrences/process"
```

## Dashboard

`GET /api/dashboard?month=2026-11`; sem `month`, usa o mês de hoje no fuso configurado. Não aceita paginação.

| Campo dentro de data | Conteúdo |
| --- | --- |
| month | Competência selecionada |
| totals | balanceCents, incomeCents, expenseCents, netCents |
| accounts | id, name, type, archivedAt, balanceCents de cada conta |
| categories | categoryId, name, type, amountCents, percentage |
| evolution | Pontos mensais com month, incomeCents, expenseCents, netCents |
| budgets | limitCents, spentCents, remainingCents, progressPercentage, overBudgetCount, items |

`totals.balanceCents` é o saldo consolidado atual das contas, calculado pelas views, sem filtro pelo mês. As receitas/despesas e categorias seguem competência: lançamentos diretos por `occurredOn`, parcelas por `invoice.period`. Transferências e pagamentos de faturas não criam receitas/despesas adicionais. `netCents = incomeCents - expenseCents`.

`evolution` contém os últimos 12 meses até o mês escolhido, incluindo meses sem movimento com valores zero; junto ao início do ano 0001 contém apenas os meses representáveis. `categories.percentage` usa como denominador o total do respectivo tipo (receita ou despesa), não a soma de ambos.

`budgets.items` contém `id`, `categoryId`, `categoryName`, `period`, `limitCents`, `spentCents`, `remainingCents`, `progressPercentage` e `exceeded`. A soma do resumo inclui apenas categorias com orçamento naquele mês.

Exemplo de resposta sem movimentos para a competência inicial suportada:

```json
{
  "data": {
    "month":"0001-01",
    "totals":{"balanceCents":0,"incomeCents":0,"expenseCents":0,"netCents":0},
    "accounts":[],
    "categories":[],
    "evolution":[{"month":"0001-01","incomeCents":0,"expenseCents":0,"netCents":0}],
    "budgets":{
      "limitCents":0,
      "spentCents":0,
      "remainingCents":0,
      "progressPercentage":"0.00",
      "overBudgetCount":0,
      "items":[]
    }
  }
}
```

## Erros

As respostas de erro incluem `requestId`, também disponível no cabeçalho `X-Request-Id`. Exemplo sintético:

```json
{
  "error": {
    "code":"VALIDATION_ERROR",
    "message":"Dados de entrada inválidos",
    "details":[{"path":"amountCents","message":"Informe um valor válido"}]
  },
  "requestId":"00000000-0000-4000-8000-000000000099"
}
```

`details` é opcional; não repete valores fornecidos pelo cliente. A API não retorna mensagens SQL, credenciais ou stack traces.

| HTTP | Código | Situações |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | JSON/content-type inválido, UUID/data/campo inválido, campo desconhecido, PATCH vazio, query repetida |
| 401 | UNAUTHENTICATED | Sessão ausente, inválida, expirada ou revogada |
| 401 | INVALID_CREDENTIALS | Login inválido |
| 403 | FORBIDDEN_ORIGIN | Mutação sem Origin ou com origem fora da allowlist |
| 404 | NOT_FOUND | Recurso/relacionamento ausente ou pertencente a outro usuário; rota inexistente |
| 409 | CONFLICT | Duplicidade, histórico impedindo exclusão, FK em uso, fatura quitada/calendário incompatível |
| 409 | CONCURRENT_UPDATE | Conflito transacional não resolvido após tentativas internas |
| 413 | PAYLOAD_TOO_LARGE | Corpo acima de 32768 bytes |
| 422 | BUSINESS_RULE | Categoria incompatível, datas de negócio inválidas, conta/cartão inativo nos fluxos que exigem atividade, valor agregado fora do intervalo seguro |
| 429 | RATE_LIMITED | Limite de cadastro/login ou capacidade do limitador atingida |
| 500 | INTERNAL_ERROR | Falha interna não exposta ao cliente |

Múltiplas condições podem ocorrer na mesma requisição; a primeira validação executada determina o erro. Por exemplo, uma mutação protegida sem sessão pode retornar `401` antes de avaliar `Origin`.

## Configuração e execução

Os valores abaixo descrevem o contrato; não é necessário consultar arquivos locais com secrets.

| Variável | Comportamento |
| --- | --- |
| NODE_ENV | development (padrão), test, production |
| HOST / PORT | Interface de escuta e porta; PORT padrão 3000 |
| DATABASE_URL | Obrigatória; conexão PostgreSQL fornecida pelo ambiente, sem valor sensível neste documento |
| APP_ORIGINS | Origens exatas separadas por vírgula; sem caminho/barra final. Em produção é obrigatória e todas devem usar HTTPS |
| APP_TIME_ZONE | Fuso IANA válido; padrão America/Sao_Paulo |
| SESSION_TTL_SECONDS | Duração da sessão em segundos; padrão 604800 (7 dias), mínimo 300, máximo 2592000 |

Em desenvolvimento, a allowlist padrão contém `http://localhost:5173` e `http://127.0.0.1:5173`. Esses são endereços locais convencionais de desenvolvimento. Para produção, um valor fictício válido seria `APP_ORIGINS=https://finance.example.test`.

O Compose de desenvolvimento espera o PostgreSQL ficar saudável e executa automaticamente `npm run db:migrate` antes de iniciar o backend em modo de desenvolvimento. O servidor iniciado diretamente pressupõe que as migrações já foram aplicadas.

Em produção, execute migrações como etapa separada da implantação antes de iniciar as réplicas da API. Sirva o frontend e encaminhe a API por um reverse proxy HTTPS, preservando o prefixo `/api`. O proxy deve enviar respostas de cookie sem reescrever seu escopo e fornecer HTTPS ao navegador; isso permite o cookie Secure com prefixo __Host. Configure proteção de borda conforme a implantação: o limitador da aplicação é local ao processo e não substitui limites compartilhados entre réplicas.

As regras de autenticação/origem e a persistência já fazem parte desta etapa. A suíte extensa de testes de API pertence à etapa 4; esta documentação descreve os contratos implementados e não afirma cobertura completa de testes nem validação de uma implantação de produção.

