import { Hono } from 'hono';
import { type ApiEnv, currentUserId } from '../../shared/http.js';
import {
  idParamsSchema,
  readBody,
  readParams,
  readQuery,
} from '../../shared/validation.js';
import {
  categoriesQuerySchema,
  createCategorySchema,
  patchCategorySchema,
} from './schemas.js';
import type { CategoriesService } from './services.js';

export function createCategoriesRoutes(service: CategoriesService) {
  const routes = new Hono<ApiEnv>({ strict: false });
  routes.get('/', async (c) =>
    c.json(
      await service.list(currentUserId(c), readQuery(c, categoriesQuerySchema)),
    ),
  );
  routes.post('/', async (c) =>
    c.json(
      {
        data: await service.create(
          currentUserId(c),
          await readBody(c, createCategorySchema),
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
        await readBody(c, patchCategorySchema),
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
