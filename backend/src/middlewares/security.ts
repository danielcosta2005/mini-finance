import { randomUUID } from 'node:crypto';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { ApiConfig } from '../config/api.js';
import type { AuthService } from '../modules/auth/services.js';
import { ApiError } from '../shared/api-error.js';
import type { Clock } from '../shared/clock.js';
import type { ApiEnv } from '../shared/http.js';
export interface AuthRatePolicy {
  maxAttempts: number;
  windowMs: number;
}
export function installSecurity(
  app: Hono<ApiEnv>,
  config: ApiConfig,
  auth: AuthService,
  clock: Clock,
  ratePolicy: AuthRatePolicy = { maxAttempts: 20, windowMs: 60000 },
) {
  app.use('*', async (c, next) => {
    c.set('requestId', randomUUID());
    c.header('X-Request-Id', c.get('requestId'));
    await next();
  });
  app.use('*', secureHeaders({ strictTransportSecurity: false }));
  app.use(
    '/api/*',
    cors({
      origin: (origin) =>
        config.origins.includes(origin) ? origin : undefined,
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      exposeHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 32768,
      onError: () => {
        throw new ApiError(
          413,
          'PAYLOAD_TOO_LARGE',
          'Corpo da requisição excede o limite',
        );
      },
    }),
  );
  const attempts = new Map<string, { count: number; until: number }>();
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    const path = c.req.path.replace(/\/+$/, '');
    const publicAuth =
      c.req.method === 'POST' &&
      ['/api/auth/register', '/api/auth/login'].includes(path);
    if (!(c.req.method === 'GET' && path === '/api/health') && !publicAuth) {
      const session = await auth.authenticate(getCookie(c, config.cookieName));
      if (!session)
        throw new ApiError(401, 'UNAUTHENTICATED', 'Autenticação necessária');
      c.set('auth', session);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('origin');
      if (!origin || !config.origins.includes(origin))
        throw new ApiError(
          403,
          'FORBIDDEN_ORIGIN',
          'Origem da requisição não autorizada',
        );
    }
    if (publicAuth) {
      // Transport peer only: forwarding headers supplied by the client are untrusted.
      let peer = 'unknown';
      try {
        peer = getConnInfo(c).remote.address ?? peer;
      } catch {
        /* app.request has no transport */
      }
      const now = clock.now().getTime();
      for (const [key, entry] of attempts)
        if (entry.until <= now) attempts.delete(key);
      if (!attempts.has(peer) && attempts.size >= 10000)
        throw new ApiError(429, 'RATE_LIMITED', 'Tente novamente mais tarde');
      const entry = attempts.get(peer) ?? {
        count: 0,
        until: now + ratePolicy.windowMs,
      };
      entry.count++;
      attempts.set(peer, entry);
      if (entry.count > ratePolicy.maxAttempts) {
        c.header('Retry-After', String(Math.ceil(ratePolicy.windowMs / 1000)));
        throw new ApiError(429, 'RATE_LIMITED', 'Tente novamente mais tarde');
      }
    }
    await next();
  });
}
