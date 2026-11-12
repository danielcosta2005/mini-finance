import { Hono } from 'hono';
import { type ApiEnv, currentUserId } from '../../shared/http.js';
import {
  idParamsSchema,
  readBody,
  readParams,
  readQuery,
} from '../../shared/validation.js';
import {
  createTransactionSchema,
  patchTransactionSchema,
  transactionsQuerySchema,
} from './schemas.js';
import type { TransactionsService } from './services.js';

export function createTransactionsRoutes(service: TransactionsService) {
  const routes = new Hono<ApiEnv>({ strict: false });
  routes.get('/', async (c) =>
    c.json(
      await service.list(
        currentUserId(c),
        readQuery(c, transactionsQuerySchema),
      ),
    ),
  );
  routes.post('/', async (c) =>
    c.json(
      {
        data: await service.create(
          currentUserId(c),
          await readBody(c, createTransactionSchema),
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
        await readBody(c, patchTransactionSchema),
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
