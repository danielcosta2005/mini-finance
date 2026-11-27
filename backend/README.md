# MiniFinance backend

Projeto npm independente, preservado após a reorganização do repositório.
Hono + TypeScript ESM + PostgreSQL/Drizzle, Zod, Vitest/V8 e Biome, em Node 26.

Executar todos os comandos npm desta página em `backend/`:

```sh
npm ci
cp .env.example .env
npm run dev
```

No PowerShell, usar `Copy-Item .env.example .env`. Se `.env` já existir, preservá-lo.
O ambiente local existente foi movido junto do backend sem alterar seu conteúdo.
O arquivo de exemplo usa somente placeholders fictícios.

Subir PostgreSQL pela raiz com `docker compose up --detach --wait postgres`.
A porta padrão publicada no host é `55432`, enquanto o serviço Docker usa `5432`.
Se mudar a porta na raiz, ajustar a `DATABASE_URL` do backend local.

`GET /health` retorna 200 e `{"status":"ok"}`. A rota é uma verificação de vida;
não faz consulta ao banco. `app.ts` não abre porta nem carrega o ambiente do servidor.
`server.ts` valida as variáveis, cria o pool e encerra HTTP/pool em SIGINT/SIGTERM.

| Script               | Ação                                              |
| -------------------- | ------------------------------------------------- |
| `dev`                | TypeScript com reinício automático                |
| `build`              | Compila para `dist/`                              |
| `start`              | Executa o build                                   |
| `typecheck`          | Verifica aplicação, configurações e testes        |
| `lint`               | Verifica Biome, imports e formatação              |
| `format`             | Aplica formatação e correções seguras             |
| `check`              | Typecheck, lint e unitários                       |
| `test` / `test:unit` | Testes unitários sem banco                        |
| `test:integration`   | Smoke tests contra API e banco isolados já ativos |
| `test:coverage`      | Cobertura V8 dos unitários                        |
| `db:generate`        | Gera SQL a partir de `src/db/schema/index.ts`     |
| `db:migrate`         | Aplica migrations de `drizzle/`                   |
| `db:seed:demo`       | Cria uma conta fictícia com dados financeiros     |

`dev`, `start` e os comandos de banco carregam `.env` opcionalmente; variáveis do
processo têm precedência. `DATABASE_URL` é obrigatória; `NODE_ENV` aceita
development/test/production, `HOST` tem padrão `0.0.0.0` e `PORT` tem padrão `3000`.
Erros de validação informam nomes dos campos, sem imprimir valores de conexão.

O schema possui 15 tabelas, relações tipadas e migrations versionadas da etapa 2.
Regras e decisões estão em [docs/modelo-de-dados.md](docs/modelo-de-dados.md).
Os endpoints de negócio e contratos estão em [../docs/api.md](../docs/api.md).
`createApp` recebe banco, configuração, relógio e hasher por injeção de dependências;
as rotas delegam regras aos services e consultas aos repositories por domínio.
Configure `APP_ORIGINS`, `APP_TIME_ZONE` e `SESSION_TTL_SECONDS` conforme `.env.example`.
O override do esbuild no
package.json trata a dependência transitiva antiga do Drizzle Kit, cujo loader
ainda pode emitir avisos de depreciação. Scripts e lockfile existentes foram preservados.

Os arquivos Compose estão somente na raiz. Para testes de integração, executar
diretamente nesta pasta:

```sh
npm run test:unit
npm run test:coverage
npm run test:integration
```

O último comando gerencia automaticamente uma stack exclusiva com Testcontainers,
API compilada, migrations reais, PostgreSQL temporário, health checks, portas
aleatórias e teardown com remoção dos volumes. Requer Docker Linux disponível;
os unitários e a cobertura não exigem Docker. Nenhum banco existente é reutilizado.

A cobertura V8 exige 80% em statements, branches, functions e lines para toda a
lógica em services/schemas, shared, config e middlewares. Repositories SQL e rotas
são validados por HTTP no ambiente real. JUnit e diagnósticos ficam em `test-reports/`,
relatórios de cobertura em `coverage/`. Ver [../docs/testes.md](../docs/testes.md) e
[../docs/matriz-endpoints.md](../docs/matriz-endpoints.md).

Build de produção, a partir da raiz:

```sh
docker build --target production -t minifinance-backend:local ./backend
```

Migrations são uma etapa separada do deploy. Ver a [documentação da raiz](../README.md)
para configuração Docker, frontend, proxy e execução integrada.

### Conta de demonstração

Depois de configurar `DATABASE_URL` e aplicar as migrations, execute manualmente
em `backend/`:

```sh
npm run db:seed:demo
```

O comando cria dados fictícios de contas, categorias, lançamentos, transferências,
orçamentos, cartão, faturas e parcelas, recorrências e metas. A sessão é criada
pelo login normal. Use estas credenciais na tela de login:

- E-mail: `demo@minifinance.local`
- Senha: `MiniFinance@Demo2026`

Em produção, o comando exige `ALLOW_PRODUCTION_DEMO_SEED=true`, além de
`DEMO_EMAIL` e `DEMO_PASSWORD` explícitos. Essas variáveis também permitem
personalizar as credenciais em outros ambientes. Se a conta já existir, o script
encerra sem alterar nenhum registro; não há reset automático. Os dados são
fictícios e destinados a desenvolvimento e apresentação.

## Vercel

Para publicar a API como projeto separado, selecione `backend/` como diretório
raiz e o preset Hono. `src/index.ts` exporta a aplicação configurada; o servidor
Node em `src/server.ts` continua sendo usado localmente e no Docker. Configure
`DATABASE_URL` com PostgreSQL externo e `APP_ORIGINS` com as origens HTTPS exatas
do frontend. Execute `npm run db:migrate` separadamente antes do primeiro uso.
Configure `BACKEND_URL` no projeto frontend com a origem HTTPS da API, sem barra
final. As URLs de preview precisam constar em `APP_ORIGINS`.

A entrada serverless ainda precisa ser verificada em um deploy real. O limite de
tentativas de autenticação usa memória local e endereço do transporte Node: em
múltiplas instâncias ou atrás de proxy não é compartilhado por cliente. Avalie
uma proteção distribuída antes de uso público. O pool PostgreSQL é por instância;
use pooling do provedor e avalie os limites de conexões. `/api/health` não
verifica o banco.
