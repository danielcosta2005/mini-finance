# Testes do backend

## Executar localmente

Usar a versão Node indicada em `backend/.nvmrc` e instalar as dependências com o lockfile:

```sh
cd backend
npm ci
npm run typecheck
npm run lint
npm run build
npm run test:unit
npm run test:coverage
npm run test:integration
```

Unitários, lint, typecheck, build e cobertura não exigem PostgreSQL nem Docker.
Integração exige Docker ativo em modo Linux e Docker Compose v2. Em Windows/macOS,
iniciar Docker Desktop antes do comando. Não iniciar uma stack manualmente: o
Testcontainers cria e encerra os serviços automaticamente.

Nenhuma variável com conexão de desenvolvimento precisa ser configurada. A suíte
ignora endereços de API/banco fornecidos pelo ambiente e cria seu próprio projeto
`minifinance-it-<id>`. Não copiar um `.env` real para a suíte.

Para executar somente parte dos testes unitários:

```sh
npx vitest run --project unit tests/unit/cards.test.ts
```

O projeto de integração pode ser selecionado com `npx vitest run --project integration`.
Executar o comando completo `npm run test:integration` para validar também toda a matriz
de endpoints; uma seleção parcial não comprova cobertura integral da API.

## O que é verificado

Os unitários exercitam os serviços reais por suas interfaces públicas, schemas Zod,
aritmética em centavos, distribuição de parcelas, calendários, idempotência, saldos,
orçamentos, metas e dashboard. Repositórios, relógio, hasher e informações do transporte
são substituídos somente nas fronteiras das unidades. Um caso também verifica o
Argon2id nativo real, incluindo sal aleatório e verificação de entrada incorreta.

Validação HTTP, erros sanitizados, CORS, Origin/CSRF, limitação de corpo e limitação
de tentativas têm testes unitários próprios. Esses testes podem usar um pequeno Hono
local para a unidade HTTP; a suíte de integração usa exclusivamente rede real.

Os testes de integração atravessam:

```text
fetch → porta publicada → Hono compilado no contêiner
      → Zod → services → repositories Drizzle → PostgreSQL no contêiner
```

Todos os métodos e rotas de negócio documentados, mais `/health` e `/api/health`,
possuem cenários HTTP. Casos críticos verificam autenticação, sessão expirada/revogada,
propriedade de recursos e referências, exclusões restritas, erros de entrada, filtros,
ordenação, paginação, saldos após edição/exclusão, parcelas exatas, fechamento/vencimento,
pagamento concorrente e processamento concorrente de recorrências. SQL nos testes é
limitado à inspeção dos efeitos e preparação de estados como uma sessão expirada.
Os 37 testes anteriores de integridade do schema permanecem como complemento.

A [matriz de endpoints](matriz-endpoints.md) relaciona cada rota aos cenários.
`test-reports/endpoints.json` e `endpoints.md` registram as requisições realmente
observadas. A suíte falha se alguma das rotas esperadas não tiver uma resposta HTTP
de sucesso. A matriz não substitui as asserções de comportamento de cada cenário.

## Infraestrutura e isolamento

- `tests/integration/global-setup.ts` inicia `DockerComposeEnvironment` uma vez por
  execução do projeto de integração, com nome exclusivo e `compose.test.yaml` da raiz.
- `backend/Dockerfile`, target `integration`, compila a aplicação e o entrypoint de
  teste. O processo roda JavaScript compilado, sem tsx ou servidor no host.
- O startup aplica as migrations versionadas com `db:migrate` antes de abrir a porta.
  Não é utilizado `drizzle-kit push`.
- PostgreSQL usa banco `minifinance_test`, credenciais fictícias exclusivas e volume
  próprio. Nenhum serviço ou volume de desenvolvimento é reutilizado.
- O Testcontainers recebe portas de host `0`, aguarda os dois health checks e descobre
  os endereços publicados. Não há sleeps arbitrários de readiness.
- Cada cenário cria seus próprios usuários e registros; não há truncate global nem
  compartilhamento de dados mutáveis entre cenários. Os arquivos de integração rodam
  sem paralelismo; cenários específicos disparam requisições concorrentes deliberadas.
- O teardown usa `down({ removeVolumes: true })` e verifica que não sobraram contêineres
  ou volumes com o label do projeto, inclusive depois de falhas. Ryuk fornece uma
  camada adicional de limpeza quando o processo encerra inesperadamente.

Os fixtures de conexão são literais no Compose de testes. `support/compose.env` é
selecionado explicitamente para impedir o carregamento automático do `.env` local.
O teste rejeita conexão com nome de banco diferente do banco temporário esperado.

## Relógio e segurança do servidor de teste

O entrypoint `tests/integration/support/server.ts`, compilado em `dist-test/`, injeta
o relógio `2026-03-31T12:00:00.000Z`, com fuso UTC. Esse entrypoint exige `NODE_ENV=test`
e banco `minifinance_test`. Ele não integra o build de produção. Nenhum endpoint ou
header permite que o cliente altere o relógio.

A suíte usa a política de cookies de produção: `__Host-minifinance_session`, Secure,
HttpOnly, SameSite=Lax e Path=/. A origem fictícia autorizada é
`https://finance.example.test`. O transporte local entre o cliente de teste e a API
é HTTP; o cliente envia cookies explicitamente. Assim, a suíte verifica os atributos
e a autenticação no servidor, mas não comprova comportamento de navegador sob TLS.

Como centenas de requisições de cenários independentes chegam pelo mesmo par de rede
com relógio fixo, o entrypoint injeta uma capacidade de 10.000 tentativas de autenticação
na janela. O servidor normal mantém 20/minuto. A política padrão, o código 429, o
Retry-After, o reset da janela e a rejeição de headers de IP falsificados são testados
unitariamente. Essa dependência não é controlável pelo cliente HTTP ou por variável
de ambiente de produção.

## Cobertura V8

`npm run test:coverage` falha abaixo de **80%** em cada métrica: statements, branches,
functions e lines. A medição inclui todos os arquivos `services.ts` e `schemas.ts`
dos módulos, além de `src/shared`, `src/config` e `src/middlewares`, mesmo os arquivos
não importados pelos testes. Não existem comentários para ignorar linhas difíceis.

Entrypoints de processo, composição da aplicação, adaptadores de rotas, schemas
declarativos do Drizzle e repositories SQL ficam fora da medição unitária: eles são
validados pelo build e pela integração real. Isso é uma divisão por responsabilidade,
não cobertura total de todos os arquivos do backend. A integração complementa a
medição unitária; a cobertura de um processo em contêiner não é somada artificialmente
à cobertura do processo Vitest.

Relatórios:

| Caminho em backend/ | Conteúdo |
| --- | --- |
| coverage/index.html | Relatório V8 navegável |
| coverage/lcov.info | Cobertura LCOV |
| coverage/coverage-summary.json | Percentuais e contadores por arquivo |
| test-reports/unit.xml | Resultados unitários JUnit |
| test-reports/coverage.xml | Resultados da execução com cobertura |
| test-reports/integration.xml | Resultados de integração JUnit |
| test-reports/endpoints.json e endpoints.md | Matriz HTTP observada |
| test-reports/containers.log | Diagnóstico de startup e serviços |
| test-reports/container-lifecycle.json | Estado de startup e limpeza verificada |

Esses diretórios são artefatos gerados e ficam fora do versionamento e do lint.

## CI

`.github/workflows/ci.yaml` executa a cada push, pull request e acionamento manual:

1. Backend em Ubuntu, Windows e macOS: npm ci, typecheck, lint, unitários, build e
   cobertura V8 com os mesmos quatro limiares. Resultados/HTML são artifacts por SO.
2. Integração somente Ubuntu: verifica Docker Linux e executa `test:integration`, que
   constrói e encerra a stack via Testcontainers. Publica JUnit, matriz, lifecycle e logs.
3. Mantém os jobs independentes de qualidade e E2E do frontend.

Não se presume Docker Linux nos runners Windows/macOS hospedados. O job Ubuntu não
comprova integração multiplataforma. Uma execução local no Windows com Docker Desktop
também não comprova o resultado dos runners remotos. Falhas de teste ou cobertura
retornam código diferente de zero e impedem a aprovação da pipeline.

## Diagnóstico e limpeza de falhas

Se o runtime não estiver disponível, iniciar Docker e verificar:

```sh
docker version
docker compose version
cd backend
npm run test:integration
```

Consultar `backend/test-reports/containers.log` para falhas de build, migrations ou
readiness. `DEBUG=testcontainers*` habilita diagnóstico adicional; os testes não
registram senhas, cookies, hashes ou corpos de autenticação. Não publicar ambientes
reais ou dados pessoais em logs de diagnóstico.

Se Docker ou o host forem encerrados abruptamente e a limpeza não puder finalizar,
o erro informa o nome **exato** do projeto temporário. Usar somente esse nome:

```sh
docker compose --project-name <projeto-temporario-informado> --env-file backend/tests/integration/support/compose.env -f compose.test.yaml down --volumes --remove-orphans
```

Executar da raiz. Não substituir o nome pelo projeto de desenvolvimento e não usar
`docker system prune` como rotina da suíte.

Referências: [Testcontainers Compose](https://node.testcontainers.org/features/compose/),
[Vitest global setup](https://vitest.dev/config/globalsetup),
[Vitest coverage](https://vitest.dev/config/coverage).
