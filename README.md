# MiniFinance

Alunos: Daniel da Cunha Costa e Pedro Luiz Silva
Matriculas: 2024006064 e 2024006129

Base de uma aplicação web de gestão financeira pessoal, com dois projetos npm
independentes. Não há npm workspaces, dependências compartilhadas ou ferramentas
de monorepo. O backend implementa a API de autenticação e gestão financeira;
o frontend mantém a estrutura inicial. Contratos completos em [docs/api.md](docs/api.md).

## Arquitetura e estrutura

```text
backend/       Hono, TypeScript ESM, PostgreSQL/Drizzle, Zod, Vitest/V8 e Biome
frontend/      React/Vite, TypeScript strict, Router, Query, Tailwind/shadcn e Zod
compose.yaml   PostgreSQL + backend + frontend em desenvolvimento
compose.test.yaml  Backend + PostgreSQL isolados para testes
.github/workflows/ci.yaml  Verificações independentes dos dois projetos
```

Cada aplicação tem package.json, package-lock.json, Dockerfile, .dockerignore,
TypeScript, Biome, testes, README e .env.example próprios. Usar Node 26 LTS e npm
11. As configurações e os scripts do backend foram preservados na mudança.

Fluxo local/Docker: navegador → Vite `/api/*` → backend `/api/*`.
Fluxo de produção: navegador → Nginx `/api/*` → backend `/api/*`.
PostgreSQL atende o backend pela rede Docker. A rota health é uma verificação
de vida da API, sem consulta ao banco.

## Design e experiência

O frontend usa IBM Plex Sans e tokens CSS em `frontend/src/styles/globals.css`.
O layout tem sidebar de 240px no desktop e barra lateral compacta de 56px no
tablet e no celular. O header tem 56px, título alinhado à esquerda, seletor de mês
quando aplicável e menu do usuário com iniciais, tema e saída.

O MiniFinance usa neutros com tom petróleo, um acento para marca, navegação,
links e foco, e cores semânticas separadas para receitas e despesas. Botões
primários usam `primary`; sinais `+` e `−` e rótulos acompanham os valores.
O dashboard começa pela faixa de saldo consolidado, receitas e despesas, segue
com fluxo de caixa e ranking de categorias, depois transações e listas compactas.
Não há títulos duplicados dentro do conteúdo nem eixos de gráfico sem dados.

| Token | Claro | Escuro |
| --- | --- | --- |
| `background` | `#F5F8F8` | `#0C1316` |
| `foreground` | `#11191D` | `#E6EDEF` |
| `muted` | `#EBF0F1` | `#17232A` |
| `accent` | `#0E6F7E` | `#4FB3C2` |
| `income` | `#1F7A4D` | `#4CC38A` |
| `expense` | `#A8402F` | `#E0705C` |

As bordas de inputs usam `#7E8B8F` no tema claro e `#607078` no escuro porque
os valores inicialmente propostos para `input` não atingiam contraste 3:1 sobre
as superfícies de controles. Os tokens `border` continuam mais sutis para
separadores e contêineres. A referência completa está em [docs/a.md](docs/a.md),
seção 4.

## Docker Compose

Na raiz, copiar `.env.example` para `.env` e executar:

```sh
docker compose up --build
```

No PowerShell, a cópia é `Copy-Item .env.example .env`; em Linux/macOS, `cp
.env.example .env`. Não sobrescrever ambientes locais já configurados. Todos os
exemplos contêm somente placeholders fictícios. Não versionar arquivos `.env`.

Endereços de desenvolvimento:

- Frontend: `http://localhost:5173`.
- Backend: `http://localhost:3000/health`.
- PostgreSQL no host: porta `55432`; dentro do Docker: `postgres:5432`.

Também é possível aguardar os health checks em segundo plano:

```sh
docker compose up --build --detach --wait
docker compose ps
docker compose exec -T backend npm run db:migrate
docker compose down
```

`down` preserva o volume de desenvolvimento. Backend espera PostgreSQL saudável;
frontend espera backend saudável. O backend aplica as migrations versionadas antes
de iniciar em desenvolvimento com Compose. Os fontes são montados por diretório, sem montar
`node_modules` do host. O frontend usa polling por padrão no Docker Desktop e o
backend mantém seu `node --watch`. Alterar código em `backend/src` ou `frontend/src`
deve disparar recarga; mudanças de dependências/configuração exigem rebuild.

## Execução independente

Subir somente PostgreSQL, na raiz:

```sh
docker compose up --detach --wait postgres
```

Em um terminal:

```sh
cd backend
npm install
# Copiar .env.example para .env se ainda não existir.
npm run dev
```

Em outro terminal:

```sh
cd frontend
npm install
# Copiar .env.example para .env se ainda não existir.
npm run dev
```

Para instalações reproduzíveis, usar `npm ci` em cada pasta. A configuração local
do backend existente foi movida para `backend/.env` sem alterar valores.

## Ambientes e comunicação

Há três ambientes separados:

| Arquivo         | Finalidade                                                             |
| --------------- | ---------------------------------------------------------------------- |
| `.env` da raiz  | Interpolação do Compose: banco, portas e destino interno do proxy      |
| `backend/.env`  | API executada no host; `DATABASE_URL` usa localhost e porta publicada  |
| `frontend/.env` | Vite executado no host; `API_PROXY_TARGET` usa origem local do backend |

As variáveis do processo prevalecem sobre os arquivos. Usar os `.env.example` de
cada diretório como referência. Ao mudar usuário/banco/senha, manter as URLs
consistentes; `POSTGRES_PASSWORD` é bruto, enquanto usuário/senha nas URLs usam
percent-encoding quando necessário. Alterar essas variáveis não reconfigura um
volume PostgreSQL já inicializado.

Principais variáveis da raiz: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`,
`POSTGRES_PORT`, `DOCKER_DATABASE_URL`, `BACKEND_PORT`, `FRONTEND_PORT`,
`API_PROXY_TARGET`, `WATCH_USE_POLLING` e `TEST_POSTGRES_PORT`.
Os padrões são locais e fictícios; os arquivos de exemplo não são um deploy público.

No Vite local, `API_PROXY_TARGET=http://127.0.0.1:3000`; no Docker,
`http://backend:3000`. O destino é lido por variável no servidor Vite e nunca por
componentes React. O frontend solicita `/api/health`; o proxy preserva `/api`.
O Hono também mantém `/health` para compatibilidade. Todas as mutações exigem
um `Origin` presente em `APP_ORIGINS`; configure as origens exatas quando mudar
a porta do frontend. Cookies são HttpOnly; em produção exigem HTTPS e `Secure`.

O proxy do Vite funciona **apenas no desenvolvimento**. `preview` serve para
inspecionar estáticos e não substitui o servidor de produção. Na produção, usar
Nginx ou roteamento equivalente na mesma origem. Cookies e `Set-Cookie` passam
pelos proxies; a aplicação usa `credentials: 'same-origin'`, compatível com futura
autenticação por cookies HttpOnly, sem tokens no JavaScript.

## Build de produção

```sh
cd backend
npm run build
npm start
```

```sh
cd frontend
npm run build
```

Dockerfiles independentes, a partir da raiz:

```sh
docker build --target production -t minifinance-backend:local ./backend
docker build --target production -t minifinance-frontend:local ./frontend
```

O backend final contém JavaScript e dependências de runtime. O frontend final usa
Nginx sem Vite, atende na porta `8080`, faz fallback de SPA e encaminha `/api/` para
`BACKEND_UPSTREAM` (padrão `backend:3000`). Para testar as imagens na rede do Compose:

```sh
docker compose up --detach --wait postgres
docker run --detach --rm --name minifinance-backend-preview --network minifinance-dev_default --network-alias backend -e NODE_ENV=production -e DATABASE_URL=postgresql://minifinance:local-only-placeholder@postgres:5432/minifinance minifinance-backend:local
docker run --rm --network minifinance-dev_default -e BACKEND_UPSTREAM=backend:3000 -p 127.0.0.1:8080:8080 minifinance-frontend:local
```

O exemplo usa somente os placeholders fictícios padrão do banco local. Se as
variáveis do banco foram personalizadas, passar uma `DATABASE_URL` equivalente,
com host Docker `postgres` e porta `5432`, por um arquivo de ambiente próprio de
produção. Preservar o `backend/.env` destinado ao processo no host.
Remover o backend temporário com `docker stop minifinance-backend-preview` após o teste.
Migrations devem rodar como uma etapa separada do deploy.

## Verificações e testes

Em `backend/`: `npm run check`, `npm run build` e `npm run test:coverage`.
Em `frontend/`: `npm run check` e `npm run build`.
Os unitários não precisam de Docker. MSW existe apenas nos testes de componente;
a comunicação real em desenvolvimento, Docker e E2E usa o backend real.

Integração do backend, sem iniciar serviços manualmente:

```sh
cd backend
npm ci
npm run test:unit
npm run test:coverage
npm run test:integration
```

`test:integration` usa Testcontainers para construir e iniciar API compilada e
PostgreSQL em um projeto Compose exclusivo, aplica migrations e aguarda os health
checks. Descobre portas aleatórias, executa HTTP real e remove contêineres/volumes
ao terminar, inclusive quando os testes falham. Exige Docker com contêineres Linux;
não usa o banco de desenvolvimento nem `DATABASE_URL` do ambiente local.

Os unitários medem todos os services, schemas, utilitários, configurações e middleware
de segurança, com mínimo de 80% em statements, branches, functions e lines. SQL e
adaptadores HTTP são complementados pela integração real. Relatórios HTML/LCOV/JSON
ficam em `backend/coverage/`; JUnit, matriz de endpoints e diagnóstico de contêineres
ficam em `backend/test-reports/`.

Instruções, isolamento e diagnóstico: [docs/testes.md](docs/testes.md).
Matriz de endpoints: [docs/matriz-endpoints.md](docs/matriz-endpoints.md).

E2E do frontend, com dependências instaladas nos dois projetos:

```sh
# Na raiz:
docker compose -f compose.test.yaml up --detach --wait postgres
# Em frontend/:
npx playwright install chromium
npm run test:e2e
```

Playwright inicia backend e Vite reais em `3001` e `5174`, sem reutilizar servidores
de desenvolvimento. A URL do banco de testes é separada da `DATABASE_URL` local.
O teste verifica a resposta HTTP através do proxy e a Home no Chromium, sem mocks.
O health não valida o banco; os smoke tests de integração verificam a consulta Drizzle.
Ao finalizar, remover apenas o ambiente descartável pela raiz:

```sh
docker compose -f compose.test.yaml down --volumes --remove-orphans
```

## CI e referências

A CI mantém typecheck, lint, unitários e build do backend em Ubuntu, Windows e
macOS, com cobertura V8 nos três sistemas e integração Testcontainers somente no
Ubuntu. Essa integração Linux não comprova integração nos runners Windows/macOS;
os respectivos jobs de qualidade não exigem Docker. Relatórios de testes e cobertura
são publicados como artifacts, inclusive em falhas. O frontend tem sua
própria matriz de qualidade e um job E2E Ubuntu com Chromium e banco de testes.
Cada job instala dependências pelo respectivo lockfile.

Scripts completos: [backend/README.md](backend/README.md) e
[frontend/README.md](frontend/README.md).
Referências: [Vite proxy](https://vite.dev/config/server-options#server-proxy),
[Tailwind/Vite](https://tailwindcss.com/docs/installation/using-vite),
[shadcn/ui](https://ui.shadcn.com/docs/installation/vite) e
[MSW Node](https://mswjs.io/api/setup-server/).
