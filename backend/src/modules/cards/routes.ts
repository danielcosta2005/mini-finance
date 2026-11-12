import { Hono } from 'hono';
import { type ApiEnv, currentUserId } from '../../shared/http.js';
import {
  idParamsSchema,
  readBody,
  readParams,
  readQuery,
} from '../../shared/validation.js';
import {
  cardsQuerySchema,
  createCardSchema,
  createPurchaseSchema,
  invoicesQuerySchema,
  payInvoiceSchema,
  purchasesQuerySchema,
  updateCardSchema,
} from './schemas.js';
import type { CardsService } from './services.js';

export function createCardsRoutes(service: CardsService) {
  const app = new Hono<ApiEnv>({ strict: false });
  app.get('/', async (c) =>
    c.json(
      await service.listCards(currentUserId(c), readQuery(c, cardsQuerySchema)),
    ),
  );
  app.post('/', async (c) =>
    c.json(
      {
        data: await service.createCard(
          currentUserId(c),
          await readBody(c, createCardSchema),
        ),
      },
      201,
    ),
  );
  app.get('/:id', async (c) =>
    c.json({
      data: await service.getCard(
        currentUserId(c),
        readParams(c, idParamsSchema).id,
      ),
    }),
  );
  app.patch('/:id', async (c) =>
    c.json({
      data: await service.updateCard(
        currentUserId(c),
        readParams(c, idParamsSchema).id,
        await readBody(c, updateCardSchema),
      ),
    }),
  );
  app.delete('/:id', async (c) =>
    c.json({
      data: await service.deleteCard(
        currentUserId(c),
        readParams(c, idParamsSchema).id,
      ),
    }),
  );
  app.get('/:id/purchases', async (c) =>
    c.json(
      await service.listPurchases(
        currentUserId(c),
        readParams(c, idParamsSchema).id,
        readQuery(c, purchasesQuerySchema),
      ),
    ),
  );
  app.post('/:id/purchases', async (c) =>
    c.json(
      {
        data: await service.createPurchase(
          currentUserId(c),
          readParams(c, idParamsSchema).id,
          await readBody(c, createPurchaseSchema),
        ),
      },
      201,
    ),
  );
  app.get('/:id/invoices', async (c) =>
    c.json(
      await service.listInvoices(
        currentUserId(c),
        readParams(c, idParamsSchema).id,
        readQuery(c, invoicesQuerySchema),
      ),
    ),
  );
  return app;
}
export function createInvoicesRoutes(service: CardsService) {
  const app = new Hono<ApiEnv>({ strict: false });
  app.get('/:id', async (c) =>
    c.json({
      data: await service.getInvoice(
        currentUserId(c),
        readParams(c, idParamsSchema).id,
      ),
    }),
  );
  app.post('/:id/pay', async (c) =>
    c.json({
      data: await service.payInvoice(
        currentUserId(c),
        readParams(c, idParamsSchema).id,
        await readBody(c, payInvoiceSchema),
      ),
    }),
  );
  return app;
}
