import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, expect, inject } from 'vitest';
import { TEST_ORIGIN } from './constants.js';
import { recordEndpoint } from './endpoint-coverage.js';

export { TEST_NOW } from './constants.js';

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface Envelope<T> {
  data: T;
  pagination?: Pagination;
  error?: { code: string; message: string };
}
export interface RequestOptions {
  cookie?: string;
  origin?: string | null;
  headers?: Record<string, string>;
}
let pool: Pool | undefined;
export function database() {
  const connectionString = inject('databaseUrl');
  if (new URL(connectionString).pathname !== '/minifinance_test')
    throw new Error('Tests require the generated isolated database');
  pool ??= new Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  return pool;
}
afterAll(async () => {
  if (pool) await pool.end();
});
export class ApiClient {
  cookie = '';
  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    expectedStatus: number | readonly number[] = 200,
    options: RequestOptions = {},
  ) {
    const headers = new Headers(options.headers);
    const origin = options.origin === undefined ? TEST_ORIGIN : options.origin;
    if (origin !== null) headers.set('Origin', origin);
    const cookie = options.cookie ?? this.cookie;
    if (cookie) headers.set('Cookie', cookie);
    if (body !== undefined && !headers.has('Content-Type'))
      headers.set('Content-Type', 'application/json');
    const response = await fetch(new URL(path, inject('apiBaseUrl')), {
      method,
      headers,
      signal: AbortSignal.timeout(15000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    recordEndpoint(method, path, response.status);
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
    const value = (await response.json()) as Envelope<T>;
    const allowed =
      typeof expectedStatus === 'number' ? [expectedStatus] : expectedStatus;
    // Failure messages contain only route/status, never submitted credentials or cookies.
    expect(
      allowed.includes(response.status),
      `${method} ${path}: unexpected status ${response.status} (${value.error?.code ?? 'success'})`,
    ).toBe(true);
    const updated = response.headers.get('set-cookie');
    if (updated) this.cookie = updated.split(';')[0] ?? '';
    return { response, body: value };
  }
  async data<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    expectedStatus: number | readonly number[] = 200,
  ) {
    return (await this.request<T>(method, path, body, expectedStatus)).body
      .data;
  }
  async list<T>(path: string) {
    const result = await this.request<T[]>('GET', path);
    expect(result.body.pagination).toBeDefined();
    return {
      data: result.body.data,
      pagination: result.body.pagination as Pagination,
    };
  }
}
export async function registerClient() {
  const client = new ApiClient();
  const email = `scenario-${randomUUID()}@example.test`;
  const password = randomUUID();
  const user = await client.data<{ id: string; name: string; email: string }>(
    'POST',
    '/api/auth/register',
    { name: 'Pessoa fictícia', email, password },
    201,
  );
  return { client, user, email, password };
}
