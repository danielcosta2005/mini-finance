import { Hono } from 'hono';
import { type ApiEnv, currentUserId } from '../../shared/http.js';
import { readQuery } from '../../shared/validation.js';
import { dashboardQuerySchema } from './schemas.js';
import type { DashboardService } from './services.js';

export function createDashboardRoutes(service: DashboardService) {
  const routes = new Hono<ApiEnv>({ strict: false });
  routes.get('/', async (c) =>
    c.json({
      data: await service.get(
        currentUserId(c),
        readQuery(c, dashboardQuerySchema),
      ),
    }),
  );
  return routes;
}
