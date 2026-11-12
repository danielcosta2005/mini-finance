import { Hono } from 'hono';
import { type ApiEnv, currentUserId } from '../../shared/http.js';
import {
  idParamsSchema,
  readBody,
  readParams,
  readQuery,
} from '../../shared/validation.js';
import {
  contributionSchema,
  contributionsQuerySchema,
  createGoalSchema,
  goalsQuerySchema,
  updateGoalSchema,
} from './schemas.js';
import type { GoalsService } from './services.js';

export function createGoalsRoutes(service: GoalsService) {
  const routes = new Hono<ApiEnv>({ strict: false });
  routes.get('/', async (c) =>
    c.json(
      await service.list(currentUserId(c), readQuery(c, goalsQuerySchema)),
    ),
  );
  routes.post('/', async (c) =>
    c.json(
      {
        data: await service.create(
          currentUserId(c),
          await readBody(c, createGoalSchema),
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
        await readBody(c, updateGoalSchema),
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
  routes.get('/:id/contributions', async (c) =>
    c.json(
      await service.contributions(
        currentUserId(c),
        readParams(c, idParamsSchema).id,
        readQuery(c, contributionsQuerySchema),
      ),
    ),
  );
  routes.post('/:id/contributions', async (c) =>
    c.json(
      {
        data: await service.contribute(
          currentUserId(c),
          readParams(c, idParamsSchema).id,
          await readBody(c, contributionSchema),
        ),
      },
      201,
    ),
  );
  return routes;
}
