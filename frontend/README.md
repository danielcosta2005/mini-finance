# MiniFinance frontend

Projeto npm independente: React/Vite, TypeScript strict, React Router, TanStack
Query, Zod, Tailwind CSS 4 e componentes locais shadcn/ui.

```sh
npm ci
cp .env.example .env
npm run dev
```

Executar nesta pasta. No PowerShell, usar `Copy-Item .env.example .env`.
O Vite atende em `http://localhost:5173`. Iniciar o backend separadamente.

`src/app/` contém providers, router e layout; `src/features/home/` contém a Home
e o cliente de health; `src/shared/` contém UI e utilitários. Não há módulos
financeiros. `components.json`, aliases `@/`, tokens CSS e o Button local preparam
shadcn/ui; novos componentes podem ser adicionados com `npx shadcn@latest add …`
dentro desta pasta, sem criar workspaces.

| Script      | Ação                                                |
| ----------- | --------------------------------------------------- |
| `dev`       | Vite com hot reload e proxy de desenvolvimento      |
| `build`     | Typecheck e build estático em `dist/`               |
| `preview`   | Inspeção local do build; não é servidor de produção |
| `typecheck` | Verificação TypeScript strict                       |
| `lint`      | Biome, formatação e imports                         |
| `format`    | Formatação e correções seguras                      |
| `test:unit` | Vitest, jsdom, React Testing Library e MSW          |
| `test:e2e`  | Chromium real com Playwright, Vite e backend reais  |
| `check`     | Typecheck, lint e unitários                         |

Variáveis do servidor de desenvolvimento:

- `API_PROXY_TARGET`: origem da API; padrão local `http://127.0.0.1:3000`.
- `DEV_SERVER_PORT`: porta Vite; padrão `5173`.
- `WATCH_USE_POLLING`: `true` para polling dos arquivos, útil em Docker Desktop.

Essas variáveis não têm prefixo `VITE_` e não são expostas ao navegador. O código
React usa somente `fetch('/api/health')`, com cookies na mesma origem. O proxy preserva
`/api` e o backend atende nesse prefixo. `Set-Cookie` e cookies HttpOnly podem
atravessar o proxy, sem armazenar tokens no JavaScript.

MSW é carregado apenas por `tests/setup.ts`; a aplicação e o Playwright não o
importam. Os testes de componente verificam sucesso e indisponibilidade da API.
O E2E verifica `/api/health` pelo proxy e a Home no navegador real, sem mocks.

Para E2E local, primeiro instalar dependências também em `../backend`, subir o
banco de testes pela raiz e instalar Chromium:

```sh
# Na raiz:
docker compose -f compose.test.yaml up --detach --wait postgres
# Em frontend/:
npx playwright install chromium
npm run test:e2e
```

O Playwright inicia seus próprios servidores em `3001` e `5174`, não reutiliza
servidores de desenvolvimento e define `NODE_ENV=test`. Usa banco separado
`minifinance_test` na porta `55433`. Para alterar esses parâmetros, definir no
processo `E2E_BACKEND_PORT`, `E2E_FRONTEND_PORT` e `E2E_DATABASE_URL`; a URL precisa
apontar a `minifinance_test`. O health não consulta PostgreSQL; a conexão real ao
banco é verificada pelos testes de integração do backend.

`npm run preview` não possui o proxy de desenvolvimento. Para validar comunicação
após o build, usar o estágio `production` do Dockerfile: Nginx serve os estáticos,
faz fallback do React Router e encaminha `/api/` ao `BACKEND_UPSTREAM`. O padrão
`backend:3000` pressupõe os serviços na mesma rede Docker. Ver a raiz para comandos.
