import { getConnInfo } from '@hono/node-server/conninfo';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseApiConfig } from '../../src/config/api.js';
import { installSecurity } from '../../src/middlewares/security.js';
import {
  type AuthService,
  passwordHasher,
} from '../../src/modules/auth/services.js';
import type { Clock } from '../../src/shared/clock.js';
import {
  type ApiEnv,
  currentUserId,
  installErrors,
} from '../../src/shared/http.js';

vi.mock('@hono/node-server/conninfo', () => ({ getConnInfo: vi.fn() }));
const origin = 'http://localhost:5173';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Pessoa exemplo',
  email: 'example@example.test',
  createdAt: new Date('2026-01-01Z'),
  updatedAt: new Date('2026-01-01Z'),
};
function fixture() {
  let now = new Date('2026-03-31T12:00:00Z');
  const clock: Clock = { now: () => new Date(now) };
  const authenticate = vi.fn<AuthService['authenticate']>().mockResolvedValue({
    user,
    sessionId: '00000000-0000-4000-8000-000000000002',
  });
  const auth: AuthService = {
    authenticate,
    register: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  };
  const app = new Hono<ApiEnv>({ strict: false });
  installErrors(app);
  installSecurity(app, parseApiConfig({}), auth, clock);
  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/health', (c) => c.json({ status: 'ok' }));
  app.get('/api/private', (c) =>
    c.json({ data: { userId: currentUserId(c) } }),
  );
  app.post('/api/private', (c) =>
    c.json({ data: { userId: currentUserId(c) } }),
  );
  app.post('/api/auth/login', (c) => c.json({ data: { accepted: true } }));
  app.post('/api/auth/register', (c) => c.json({ data: { accepted: true } }));
  return {
    app,
    authenticate,
    advance: (milliseconds: number) => {
      now = new Date(now.getTime() + milliseconds);
    },
  };
}
afterEach(() => vi.resetAllMocks());

describe('HTTP security middleware (unit)', () => {
  it('keeps both health paths public and sets hardening headers', async () => {
    const { app, authenticate } = fixture();
    for (const path of ['/health', '/api/health']) {
      const response = await app.request(path);
      expect(response.status).toBe(200);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('strict-transport-security')).toBeNull();
    }
    expect(authenticate).not.toHaveBeenCalled();
  });
  it('assigns a server-generated request ID and prevents caching private responses', async () => {
    const { app } = fixture();
    const response = await app.request('/api/private', {
      headers: { 'X-Request-Id': 'untrusted-example' },
    });
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ data: { userId: user.id } });
  });
  it('returns 401 without a live session and does not call the handler', async () => {
    const { app, authenticate } = fixture();
    authenticate.mockResolvedValue(undefined);
    const response = await app.request('/api/private');
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
  });
  it('passes only the configured session cookie to the authentication boundary', async () => {
    const { app, authenticate } = fixture();
    await app.request('/api/private', {
      headers: {
        Cookie: 'irrelevant=example; minifinance_session=opaque-example',
      },
    });
    expect(authenticate).toHaveBeenCalledWith('opaque-example');
  });
  it.each([undefined, 'null', 'https://untrusted.example.test'])(
    'rejects mutation origin %s',
    async (value) => {
      const { app } = fixture();
      const headers = new Headers();
      if (value) headers.set('Origin', value);
      const response = await app.request('/api/private', {
        method: 'POST',
        headers,
      });
      expect(response.status).toBe(403);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe('FORBIDDEN_ORIGIN');
    },
  );
  it('accepts same-origin authenticated mutation', async () => {
    const { app } = fixture();
    expect(
      (
        await app.request('/api/private', {
          method: 'POST',
          headers: { Origin: origin },
        })
      ).status,
    ).toBe(200);
  });
  it('allows trusted preflight before authentication', async () => {
    const { app, authenticate } = fixture();
    const response = await app.request('/api/private', {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
    expect(authenticate).not.toHaveBeenCalled();
  });
  it('does not grant CORS to an untrusted origin', async () => {
    const { app } = fixture();
    const response = await app.request('/api/private', {
      headers: { Origin: 'https://untrusted.example.test' },
    });
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('rejects an oversized body before invoking authentication or a financial handler', async () => {
    const { app, authenticate } = fixture();
    const body = 'x'.repeat(32769);
    const response = await app.request('/api/private', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Length': String(body.length) },
      body,
    });
    expect(response.status).toBe(413);
    expect(authenticate).not.toHaveBeenCalled();
  });
  it('requires Origin for public authentication routes too', async () => {
    const { app, authenticate } = fixture();
    const response = await app.request('/api/auth/login', { method: 'POST' });
    expect(response.status).toBe(403);
    expect(authenticate).not.toHaveBeenCalled();
  });
  it('accepts trailing slash on a public authentication route', async () => {
    const { app, authenticate } = fixture();
    expect(
      (
        await app.request('/api/auth/register/', {
          method: 'POST',
          headers: { Origin: origin },
        })
      ).status,
    ).toBe(200);
    expect(authenticate).not.toHaveBeenCalled();
  });
  it('shares the twenty-attempt limit across register/login and resets it after its clock window', async () => {
    const { app, advance } = fixture();
    vi.mocked(getConnInfo).mockImplementation(() => {
      throw new Error('No transport in unit request');
    });
    for (let index = 0; index < 20; index++)
      expect(
        (
          await app.request(
            index % 2 ? '/api/auth/login' : '/api/auth/register',
            { method: 'POST', headers: { Origin: origin } },
          )
        ).status,
      ).toBe(200);
    const limited = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { Origin: origin },
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    advance(60001);
    expect(
      (
        await app.request('/api/auth/login', {
          method: 'POST',
          headers: { Origin: origin },
        })
      ).status,
    ).toBe(200);
  });
  it('uses transport addresses and ignores client-controlled forwarding headers', async () => {
    const { app } = fixture();
    vi.mocked(getConnInfo).mockReturnValue({
      remote: { address: '192.0.2.1' },
    });
    for (let index = 0; index < 20; index++)
      await app.request('/api/auth/login', {
        method: 'POST',
        headers: { Origin: origin, 'X-Forwarded-For': `198.51.100.${index}` },
      });
    expect(
      (
        await app.request('/api/auth/login', {
          method: 'POST',
          headers: { Origin: origin, 'X-Forwarded-For': '198.51.100.250' },
        })
      ).status,
    ).toBe(429);
    vi.mocked(getConnInfo).mockReturnValue({
      remote: { address: '192.0.2.2' },
    });
    expect(
      (
        await app.request('/api/auth/login', {
          method: 'POST',
          headers: { Origin: origin },
        })
      ).status,
    ).toBe(200);
  });
});

describe('production password hasher', () => {
  it('produces salted Argon2id hashes and verifies correct and incorrect inputs', async () => {
    const sample = 'fictitious-unit-input';
    const [first, second] = await Promise.all([
      passwordHasher.hash(sample),
      passwordHasher.hash(sample),
    ]);
    // Assert properties rather than printing hashes or the opaque inputs in assertion diffs.
    expect(first.startsWith('$argon2id$')).toBe(true);
    expect(first !== second).toBe(true);
    expect(await passwordHasher.verify(first, sample)).toBe(true);
    expect(
      await passwordHasher.verify(first, 'different-fictitious-input'),
    ).toBe(false);
  });
});
