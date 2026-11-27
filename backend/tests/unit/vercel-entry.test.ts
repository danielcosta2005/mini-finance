import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Vercel Hono entrypoint', () => {
  it('exports the configured application without starting a server', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ORIGINS', 'https://example.com');
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/test');
    const { default: entry } = await import('../../src/app.js');
    const app = {
      request: (path: string) =>
        entry.fetch(new Request(`https://example.com${path}`)),
    };
    expect((await app.request('/api/health')).status).toBe(200);
    expect((await app.request('/api/accounts')).status).toBe(401);
  }, 15000);
});
