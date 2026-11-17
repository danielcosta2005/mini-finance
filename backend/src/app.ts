import { Hono } from 'hono';
import type { ApiConfig } from './config/api.js';
import type { Database } from './db/types.js';
import {
  type AuthRatePolicy,
  installSecurity,
} from './middlewares/security.js';
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
import { createBudgetsRepository } from './modules/budgets/repositories.js';
import { createBudgetsRoutes } from './modules/budgets/routes.js';
import { createBudgetsService } from './modules/budgets/services.js';
import { createCardsRepository } from './modules/cards/repositories.js';
import {
  createCardsRoutes,
  createInvoicesRoutes,
} from './modules/cards/routes.js';
import { createCardsService } from './modules/cards/services.js';
import { createCategoriesRepository } from './modules/categories/repositories.js';
import { createCategoriesRoutes } from './modules/categories/routes.js';
import { createCategoriesService } from './modules/categories/services.js';
import { createDashboardRepository } from './modules/dashboard/repositories.js';
import { createDashboardRoutes } from './modules/dashboard/routes.js';
import { createDashboardService } from './modules/dashboard/services.js';
import { createGoalsRepository } from './modules/goals/repositories.js';
import { createGoalsRoutes } from './modules/goals/routes.js';
import { createGoalsService } from './modules/goals/services.js';
import { createRecurrencesRepository } from './modules/recurrences/repositories.js';
import { createRecurrencesRoutes } from './modules/recurrences/routes.js';
import { createRecurrencesService } from './modules/recurrences/services.js';
import { createTransactionsRepository } from './modules/transactions/repositories.js';
import { createTransactionsRoutes } from './modules/transactions/routes.js';
import { createTransactionsService } from './modules/transactions/services.js';
import { type Clock, systemClock } from './shared/clock.js';
import { type ApiEnv, installErrors } from './shared/http.js';

export interface AppDependencies {
  db: Database;
  config: ApiConfig;
  clock?: Clock;
  passwordHasher?: PasswordHasher;
  authRatePolicy?: AuthRatePolicy;
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
    installSecurity(app, config, auth, clock, dependencies.authRatePolicy);
    app.route('/api/auth', createAuthRoutes(auth, config));
    const accounts = createAccountsService(createAccountsRepository(db));
    app.route('/api/accounts', createAccountsRoutes(accounts));
    app.route(
      '/api/dashboard',
      createDashboardRoutes(
        createDashboardService(
          createDashboardRepository(db),
          clock,
          config.timeZone,
        ),
      ),
    );
    app.route(
      '/api/recurrences',
      createRecurrencesRoutes(
        createRecurrencesService(
          createRecurrencesRepository(db),
          clock,
          config.timeZone,
        ),
      ),
    );
    app.route(
      '/api/goals',
      createGoalsRoutes(
        createGoalsService(createGoalsRepository(db), clock, config.timeZone),
      ),
    );
    const cards = createCardsService(
      createCardsRepository(db),
      clock,
      config.timeZone,
    );
    app.route('/api/cards', createCardsRoutes(cards));
    app.route('/api/invoices', createInvoicesRoutes(cards));
    app.route(
      '/api/budgets',
      createBudgetsRoutes(createBudgetsService(createBudgetsRepository(db))),
    );
    app.route(
      '/api/transactions',
      createTransactionsRoutes(
        createTransactionsService(createTransactionsRepository(db)),
      ),
    );
    app.route('/api/transfers', createTransfersRoutes(accounts));
    app.route(
      '/api/categories',
      createCategoriesRoutes(
        createCategoriesService(createCategoriesRepository(db)),
      ),
    );
  }
  app.get('/health', (c) => c.json({ status: 'ok' }, 200));
  app.get('/api/health', (c) => c.json({ status: 'ok' }, 200));
  return app;
}
export const app = createApp();
