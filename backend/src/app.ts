import { Hono } from 'hono';
import type { ApiConfig } from './config/api.js';
import type { Database } from './db/types.js';
import { installSecurity } from './middlewares/security.js';
import { createAccountsRepository } from './modules/accounts/repositories.js';
import {
  createAccountsRoutes,
  createTransfersRoutes,
} from './modules/accounts/routes.js';
import { createAccountsService } from './modules/accounts/services.js';
import { createAuthRepository } from './modules/auth/repositories.js';
import { createAuthRoutes } from './modules/auth/routes.js';
import {
  createAuthService,
  type PasswordHasher,
} from './modules/auth/services.js';
import { type Clock, systemClock } from './shared/clock.js';
import { type ApiEnv, installErrors } from './shared/http.js';

export interface AppDependencies {
  db: Database;
  config: ApiConfig;
  clock?: Clock;
  passwordHasher?: PasswordHasher;
}
export function createApp(dependencies?: AppDependencies) {
  const app = new Hono<ApiEnv>({ strict: false });
  installErrors(app);
  if (dependencies) {
    const { db, config } = dependencies;
    const clock = dependencies.clock ?? systemClock;
    const auth = createAuthService(
      createAuthRepository(db),
      clock,
      config.sessionTtlSeconds,
      dependencies.passwordHasher,
    );
    installSecurity(app, config, auth, clock);
    app.route('/api/auth', createAuthRoutes(auth, config));
    const accounts = createAccountsService(createAccountsRepository(db));
    app.route('/api/accounts', createAccountsRoutes(accounts));
    app.route('/api/transfers', createTransfersRoutes(accounts));
  }
  app.get('/health', (c) => c.json({ status: 'ok' }, 200));
  app.get('/api/health', (c) => c.json({ status: 'ok' }, 200));
  return app;
}
export const app = createApp();
