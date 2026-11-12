import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { ApiConfig } from '../../config/api.js';
import type { ApiEnv } from '../../shared/http.js';
import { readBody } from '../../shared/validation.js';
import { emptyBodySchema, loginSchema, registerSchema } from './schemas.js';
import type { AuthService } from './services.js';
export function createAuthRoutes(service: AuthService, config: ApiConfig) {
  const routes = new Hono<ApiEnv>({ strict: false });
  const options = {
    httpOnly: true,
    secure: config.production,
    sameSite: 'Lax' as const,
    path: '/',
  };
  routes.post('/register', async (c) => {
    const result = await service.register(await readBody(c, registerSchema));
    setCookie(c, config.cookieName, result.token, {
      ...options,
      maxAge: config.sessionTtlSeconds,
    });
    return c.json({ data: result.user }, 201);
  });
  routes.post('/login', async (c) => {
    const result = await service.login(await readBody(c, loginSchema));
    setCookie(c, config.cookieName, result.token, {
      ...options,
      maxAge: config.sessionTtlSeconds,
    });
    return c.json({ data: result.user });
  });
  routes.get('/me', (c) => c.json({ data: c.get('auth').user }));
  routes.post('/logout', async (c) => {
    await readBody(c, emptyBodySchema, true);
    const auth = c.get('auth');
    await service.logout(auth.user.id, auth.sessionId);
    deleteCookie(c, config.cookieName, options);
    return c.json({ data: { loggedOut: true } });
  });
  return routes;
}
