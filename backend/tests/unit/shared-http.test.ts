import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ApiError,
  businessRule,
  databaseErrorCode,
  notFound,
  toApiError,
} from '../../src/shared/api-error.js';
import {
  monthRange,
  shiftMonth,
  systemClock,
  today,
} from '../../src/shared/clock.js';
import {
  type ApiEnv,
  currentUserId,
  installErrors,
  paginated,
  percentage,
  safeCents,
} from '../../src/shared/http.js';
import {
  financialDateSchema,
  hasPatch,
  idParamsSchema,
  listQuerySchema,
  monthSchema,
  readBody,
  readParams,
  readQuery,
  validate,
  validDateRange,
} from '../../src/shared/validation.js';

const exampleId = '10000000-0000-4000-8000-000000000001';
function appWithErrors() {
  const app = new Hono<ApiEnv>();
  app.use('*', async (c, next) => {
    c.set('requestId', 'request-example');
    await next();
  });
  installErrors(app);
  return app;
}
function parsingApp() {
  const app = appWithErrors();
  const bodySchema = z.strictObject({ name: z.string().trim().min(1) });
  app.post('/body', async (c) => c.json(await readBody(c, bodySchema)));
  app.post('/empty', async (c) =>
    c.json(await readBody(c, z.strictObject({}), true)),
  );
  app.post('/required-empty', async (c) =>
    c.json(await readBody(c, bodySchema, true)),
  );
  app.get('/query', (c) => c.json(readQuery(c, listQuerySchema)));
  app.get('/params/:id', (c) => c.json(readParams(c, idParamsSchema)));
  app.get('/anonymous', (c) => c.json({ userId: currentUserId(c) }));
  app.get('/authenticated', (c) => {
    c.set('auth', {
      user: {
        id: exampleId,
        name: 'Pessoa Exemplo',
        email: 'person@example.com',
        createdAt: new Date('2026-01-01Z'),
        updatedAt: new Date('2026-01-01Z'),
      },
      sessionId: 'session-example',
    });
    return c.json({ userId: currentUserId(c) });
  });
  return app;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('API error mapping', () => {
  it('preserves structured errors and custom not-found messages', () => {
    const error = new ApiError(400, 'EXAMPLE', 'Exemplo', [
      { path: 'name', message: 'Inválido' },
    ]);
    expect(toApiError(error)).toBe(error);
    expect(error.name).toBe('ApiError');
    expect(notFound()).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(notFound('Exemplo ausente').message).toBe('Exemplo ausente');
    expect(businessRule('Exemplo incompatível')).toMatchObject({
      status: 422,
      code: 'BUSINESS_RULE',
      message: 'Exemplo incompatível',
    });
  });
  it.each([
    ['23505', 409, 'CONFLICT'],
    ['23503', 409, 'CONFLICT'],
    ['23514', 422, 'BUSINESS_RULE'],
    ['40001', 409, 'CONCURRENT_UPDATE'],
    ['40P01', 409, 'CONCURRENT_UPDATE'],
    ['UNKNOWN', 500, 'INTERNAL_ERROR'],
  ])('maps SQL code %s to a public error', (code, status, publicCode) => {
    const result = toApiError({
      cause: { code, message: 'fictitious private SQL detail' },
    });
    expect(result).toMatchObject({ status, code: publicCode });
    expect(result.message).not.toContain('fictitious private SQL detail');
  });
  it.each([
    null,
    undefined,
    false,
    1,
    'fixture',
    {},
    { code: 123 },
    { cause: null },
  ])('ignores malformed driver errors case %#', (value) => {
    expect(databaseErrorCode(value)).toBeUndefined();
    expect(toApiError(value)).toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });
  });
  it('walks a bounded cause chain and prefers the nearest string code', () => {
    expect(
      databaseErrorCode({ code: 123, cause: { cause: { code: '23505' } } }),
    ).toBe('23505');
    expect(databaseErrorCode({ code: '23514', cause: { code: '23505' } })).toBe(
      '23514',
    );
    let nested: unknown = { code: '23505' };
    for (let depth = 0; depth < 6; depth++) nested = { cause: nested };
    expect(databaseErrorCode(nested)).toBeUndefined();
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(databaseErrorCode(cyclic)).toBeUndefined();
  });
  it('renders validation details and the request id', async () => {
    const app = appWithErrors();
    app.get('/error', () => {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Exemplo inválido', [
        { path: 'name', message: 'Valor inválido' },
      ]);
    });
    const response = await app.request('/error');
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Exemplo inválido',
        details: [{ path: 'name', message: 'Valor inválido' }],
      },
      requestId: 'request-example',
    });
  });
  it('returns a request-scoped 404 for unknown routes', async () => {
    const response = await appWithErrors().request('/missing');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
      requestId: 'request-example',
    });
  });
  it('logs only the request id for unhandled failures and conceals SQL details', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = appWithErrors();
    app.get('/error', () => {
      throw new Error('fictitious private SQL detail');
    });
    const response = await app.request('/error');
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: { code: 'INTERNAL_ERROR' },
      requestId: 'request-example',
    });
    expect(logger).toHaveBeenCalledExactlyOnceWith(
      'API request failed',
      'request-example',
    );
    expect(JSON.stringify(logger.mock.calls)).not.toContain(
      'fictitious private SQL detail',
    );
  });
  it('maps nested SQL failures without logging business conflicts', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = appWithErrors();
    app.get('/error', () => {
      throw new Error('fictitious SQL failure', { cause: { code: '23505' } });
    });
    const response = await app.request('/error');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'CONFLICT' },
    });
    expect(logger).not.toHaveBeenCalled();
  });
});

describe('request parsing helpers', () => {
  it.each([
    'application/json',
    'application/json; charset=utf-8',
    'APPLICATION/JSON',
  ])('accepts supported JSON MIME %s', async (contentType) => {
    const response = await parsingApp().request('/body', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: JSON.stringify({ name: ' Exemplo ' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'Exemplo' });
  });
  it.each([
    'text/plain',
    'application/json-patch+json',
    'application/json-invalid',
    '',
  ])('rejects invalid MIME case %#', async (contentType) => {
    const response = await parsingApp().request('/body', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: '{}',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });
  it('rejects a missing MIME header', async () => {
    const response = await parsingApp().request('/body', { method: 'POST' });
    expect(response.status).toBe(400);
  });
  it.each(['{', '', 'undefined'])(
    'rejects malformed JSON case %#',
    async (body) => {
      const response = await parsingApp().request('/body', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      });
    },
  );
  it.each([
    { name: ' ' },
    { name: 'Exemplo', extra: true },
    null,
    [],
    { name: 1 },
  ])('rejects schema violations case %#', async (body) => {
    const response = await parsingApp().request('/body', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
  });
  it('accepts empty bodies only through allowEmpty and still validates required fields', async () => {
    const app = parsingApp();
    const response = await app.request('/empty', { method: 'POST' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(
      (await app.request('/required-empty', { method: 'POST' })).status,
    ).toBe(400);
    expect(
      (
        await app.request('/empty', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(200);
  });
  it('normalizes query pagination and rejects duplicates/unknown parameters', async () => {
    const app = parsingApp();
    const response = await app.request('/query?page=2&pageSize=5');
    expect(await response.json()).toEqual({ page: 2, pageSize: 5 });
    expect((await app.request('/query')).status).toBe(200);
    expect((await app.request('/query?page=2&page=3')).status).toBe(400);
    expect((await app.request('/query?unknown=1')).status).toBe(400);
    expect((await app.request('/query?page=0')).status).toBe(400);
  });
  it('reads UUID route parameters through the public schema', async () => {
    const app = parsingApp();
    const response = await app.request(`/params/${exampleId}`);
    expect(await response.json()).toEqual({ id: exampleId });
    expect((await app.request('/params/invalid')).status).toBe(400);
  });
  it('returns the authenticated user id and rejects missing auth context', async () => {
    const app = parsingApp();
    expect(await (await app.request('/authenticated')).json()).toEqual({
      userId: exampleId,
    });
    const response = await app.request('/anonymous');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
  });
  it('sanitizes validation issues and retains their nested paths', () => {
    const schema = z.strictObject({
      nested: z.strictObject({ count: z.number() }),
    });
    expect(validate(schema, { nested: { count: 2 } })).toEqual({
      nested: { count: 2 },
    });
    try {
      validate(schema, { nested: { count: 'fictitious-sensitive-input' } });
      expect.fail('Invalid data must throw');
    } catch (error) {
      expect(error).toMatchObject({
        status: 400,
        code: 'VALIDATION_ERROR',
        details: [{ path: 'nested.count', message: 'Informe um valor válido' }],
      });
      expect(JSON.stringify(error)).not.toContain('fictitious-sensitive-input');
    }
  });
  it('detects meaningful patches, inclusive date ranges and valid calendar dates', () => {
    expect(hasPatch({})).toBe(false);
    expect(hasPatch({ name: undefined })).toBe(false);
    expect(hasPatch({ amount: 0 })).toBe(true);
    expect(validDateRange({})).toBe(true);
    expect(validDateRange({ from: '2026-01-01' })).toBe(true);
    expect(validDateRange({ to: '2026-01-01' })).toBe(true);
    expect(validDateRange({ from: '2026-01-01', to: '2026-01-01' })).toBe(true);
    expect(validDateRange({ from: '2026-02-01', to: '2026-01-01' })).toBe(
      false,
    );
    expect(financialDateSchema.safeParse('0000-01-01').success).toBe(false);
    expect(financialDateSchema.safeParse('2026-02-29').success).toBe(false);
    expect(financialDateSchema.parse('2024-02-29')).toBe('2024-02-29');
    expect(monthSchema.safeParse('0000-01').success).toBe(false);
  });
});

describe('monetary presentation helpers', () => {
  it.each([123, 123n, '123', '-123', 0, '9007199254740991'])(
    'serializes safe cents case %#',
    (value) => {
      expect(safeCents(value)).toBe(Number(value));
    },
  );
  it.each([
    'invalid',
    '1.2',
    '9007199254740992',
    -9007199254740992n,
    Infinity,
    1.1,
  ])('rejects unsafe or malformed cents case %#', (value) => {
    expect(() => safeCents(value)).toThrowError(
      expect.objectContaining({ status: 422, code: 'BUSINESS_RULE' }),
    );
  });
  it('truncates percentages through integer arithmetic and handles zero/negative totals', () => {
    expect(percentage(1, 3)).toBe('33.33');
    expect(percentage(2n, 3n)).toBe('66.66');
    expect(percentage('12501', '10000')).toBe('125.01');
    expect(percentage(0, 100)).toBe('0.00');
    expect(percentage(5, 0)).toBe('0.00');
    expect(percentage(5, -1)).toBe('0.00');
  });
  it('returns pagination with empty and partially filled final pages', () => {
    expect(paginated([], 0, { page: 1, pageSize: 20 })).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    expect(paginated(['example'], 21, { page: 2, pageSize: 20 })).toEqual({
      data: ['example'],
      pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
    });
  });
});

describe('clock and month boundaries', () => {
  it('reads system time using the public clock', () => {
    vi.useFakeTimers();
    const fixed = new Date('2026-01-01T01:00:00Z');
    vi.setSystemTime(fixed);
    expect(systemClock.now()).toEqual(fixed);
    expect(today(systemClock)).toBe('2025-12-31');
    expect(today(systemClock, 'UTC')).toBe('2026-01-01');
    expect(today(systemClock, 'Asia/Tokyo')).toBe('2026-01-01');
  });
  it.each([
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['0001-01', 0, '0001-01'],
    ['9999-12', 1, '10000-01'],
    ['2026-01', 24, '2028-01'],
  ])('shifts month %s by %i', (month, offset, expected) => {
    expect(shiftMonth(String(month), Number(offset))).toBe(expected);
  });
  it.each([
    ['0001-01', -1],
    ['9999-12', 13],
  ])('rejects a shift outside the supported years case %#', (month, offset) => {
    expect(() => shiftMonth(String(month), Number(offset))).toThrow(RangeError);
  });
  it('uses exclusive next-month boundaries including the terminal year', () => {
    expect(monthRange('2024-02')).toEqual({
      start: '2024-02-01',
      endExclusive: '2024-03-01',
    });
    expect(monthRange('9999-12')).toEqual({
      start: '9999-12-01',
      endExclusive: '10000-01-01',
    });
  });
});
