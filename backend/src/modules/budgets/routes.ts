import { Hono } from 'hono';
import { type ApiEnv, currentUserId } from '../../shared/http.js';
import {
  idParamsSchema,
  readBody,
  readParams,
  readQuery,
} from '../../shared/validation.js';
import {
  budgetsQuerySchema,
  createBudgetSchema,
  patchBudgetSchema,
} from './schemas.js';
import type { BudgetsService } from './services.js';

export function createBudgetsRoutes(service: BudgetsService) {
  const routes = new Hono<ApiEnv>({ strict: false });
  routes.get('/', async (c) =>
    c.json(
      await service.list(currentUserId(c), readQuery(c, budgetsQuerySchema)),
    ),
  );
  routes.post('/', async (c) =>
    c.json(
      {
        data: await service.create(
          currentUserId(c),
          await readBody(c, createBudgetSchema),
        ),
      },
      201,
    ),
  );
  routes.get('/:id', async (c) =>
    c.json({
      data: await service.get(
        currentUserId(c),
        readParams(c, idParamsSchema).id,
      ),
    }),
  );
  routes.patch('/:id', async (c) =>
    c.json({
      data: await service.update(
        currentUserId(c),
        readParams(c, idParamsSchema).id,
        await readBody(c, patchBudgetSchema),
      ),
    }),
  );
  routes.delete('/:id', async (c) =>
    c.json({
      data: await service.delete(
        currentUserId(c),
        readParams(c, idParamsSchema).id,
      ),
    }),
  );
  return routes;
}
