import { Hono } from 'hono';
import { type ApiEnv, currentUserId } from '../../shared/http.js';
import {
  idParamsSchema,
  readBody,
  readParams,
  readQuery,
} from '../../shared/validation.js';
import {
  createRecurrenceSchema,
  processRecurrencesSchema,
  recurrencesQuerySchema,
  updateRecurrenceSchema,
} from './schemas.js';
import type { RecurrencesService } from './services.js';

export function createRecurrencesRoutes(service: RecurrencesService) {
  const routes = new Hono<ApiEnv>({ strict: false });
  routes.get('/', async (c) =>
    c.json(
      await service.list(
        currentUserId(c),
        readQuery(c, recurrencesQuerySchema),
      ),
    ),
  );
  routes.post('/', async (c) =>
    c.json(
      {
        data: await service.create(
          currentUserId(c),
          await readBody(c, createRecurrenceSchema),
        ),
      },
      201,
    ),
  );
  routes.post('/process', async (c) => {
    readQuery(c, processRecurrencesSchema);
    await readBody(c, processRecurrencesSchema, true);
    return c.json({ data: await service.process(currentUserId(c)) });
  });
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
        await readBody(c, updateRecurrenceSchema),
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
