import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect } from 'vitest';

const crud = ['GET', 'POST', 'GET :id', 'PATCH :id', 'DELETE :id'];
export const expectedEndpoints = [
  'GET /health',
  'GET /api/health',
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  ...[
    'accounts',
    'categories',
    'transactions',
    'budgets',
    'cards',
    'goals',
    'recurrences',
  ].flatMap((resource) =>
    crud.map((item) => {
      const [method, suffix] = item.split(' ');
      return `${method} /api/${resource}${suffix ? `/${suffix}` : ''}`;
    }),
  ),
  'GET /api/transfers',
  'POST /api/transfers',
  'GET /api/dashboard',
  'GET /api/cards/:id/purchases',
  'POST /api/cards/:id/purchases',
  'GET /api/cards/:id/invoices',
  'GET /api/invoices/:id',
  'POST /api/invoices/:id/pay',
  'POST /api/recurrences/process',
  'GET /api/goals/:id/contributions',
  'POST /api/goals/:id/contributions',
].sort();
const observed = new Map<
  string,
  { successes: Set<string>; errors: Set<string> }
>();
export function recordEndpoint(method: string, path: string, status: number) {
  const route = path
    .split('?')[0]
    ?.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ':id',
    )
    .replace(/\/$/, '');
  const key = `${method.toUpperCase()} ${route}`;
  const entry = observed.get(key) ?? {
    successes: new Set<string>(),
    errors: new Set<string>(),
  };
  (status >= 200 && status < 300 ? entry.successes : entry.errors).add(
    expect.getState().currentTestName ?? 'infrastructure',
  );
  observed.set(key, entry);
}
export async function verifyEndpointCoverage() {
  const rows = expectedEndpoints.map((endpoint) => ({
    endpoint,
    successTests: [...(observed.get(endpoint)?.successes ?? [])],
    errorTests: [...(observed.get(endpoint)?.errors ?? [])],
  }));
  const directory = resolve('test-reports');
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, 'endpoints.json'),
    JSON.stringify(rows, null, 2),
  );
  await writeFile(
    resolve(directory, 'endpoints.md'),
    '| Endpoint | Cenários com sucesso | Cenários com erro |\n| --- | --- | --- |\n' +
      rows
        .map(
          (row) =>
            `| ${row.endpoint} | ${row.successTests.join('<br>')} | ${row.errorTests.join('<br>')} |`,
        )
        .join('\n'),
  );
  expect(
    rows
      .filter((row) => row.successTests.length === 0)
      .map((row) => row.endpoint),
    'Endpoints without a successful real HTTP scenario',
  ).toEqual([]);
}
