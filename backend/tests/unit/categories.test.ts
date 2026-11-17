import { describe, expect, it, vi } from 'vitest';
import type { Category } from '../../src/db/schema/types.js';
import type { CategoriesRepository } from '../../src/modules/categories/repositories.js';
import {
  categoriesQuerySchema,
  createCategorySchema,
  patchCategorySchema,
} from '../../src/modules/categories/schemas.js';
import { createCategoriesService } from '../../src/modules/categories/services.js';

const userId = '10000000-0000-4000-8000-000000000001';
const id = '20000000-0000-4000-8000-000000000001';
const category: Category = {
  id,
  userId,
  name: 'Categoria Exemplo',
  type: 'expense',
  archivedAt: null,
  createdAt: new Date('2026-01-01Z'),
  updatedAt: new Date('2026-01-01Z'),
};
function setup() {
  const repository = {
    list: vi
      .fn<CategoriesRepository['list']>()
      .mockResolvedValue({ data: [category], total: 3 }),
    find: vi.fn<CategoriesRepository['find']>().mockResolvedValue(category),
    create: vi.fn<CategoriesRepository['create']>().mockResolvedValue(category),
    update: vi.fn<CategoriesRepository['update']>().mockResolvedValue(category),
    delete: vi.fn<CategoriesRepository['delete']>().mockResolvedValue({ id }),
  } satisfies CategoriesRepository;
  return { repository, service: createCategoriesService(repository) };
}
describe('category service', () => {
  it('forwards owner and normalized filters and calculates pagination', async () => {
    const { service, repository } = setup();
    const query = categoriesQuerySchema.parse({
      page: 2,
      pageSize: 2,
      type: 'expense',
      search: ' Exemplo ',
    });
    expect(await service.list(userId, query)).toEqual({
      data: [category],
      pagination: { page: 2, pageSize: 2, total: 3, totalPages: 2 },
    });
    expect(repository.list).toHaveBeenCalledWith(userId, query);
  });
  it('returns an empty page without inventing results', async () => {
    const { service, repository } = setup();
    repository.list.mockResolvedValue({ data: [], total: 0 });
    expect(
      await service.list(userId, categoriesQuerySchema.parse({})),
    ).toMatchObject({ data: [], pagination: { totalPages: 0 } });
  });
  it('gets the category within the owner scope', async () => {
    const { service, repository } = setup();
    expect(await service.get(userId, id)).toEqual(category);
    expect(repository.find).toHaveBeenCalledWith(userId, id);
  });
  it('creates the normalized category', async () => {
    const { service, repository } = setup();
    const input = createCategorySchema.parse({
      name: ' Exemplo ',
      type: 'expense',
    });
    expect(await service.create(userId, input)).toEqual(category);
    expect(repository.create).toHaveBeenCalledWith(userId, {
      name: 'Exemplo',
      type: 'expense',
    });
  });
  it('passes only the supplied patch fields to the repository', async () => {
    const { service, repository } = setup();
    expect(await service.update(userId, id, { name: 'Novo exemplo' })).toEqual(
      category,
    );
    expect(repository.update).toHaveBeenCalledWith(userId, id, {
      name: 'Novo exemplo',
    });
  });
  it('returns a deletion receipt after a scoped delete', async () => {
    const { service, repository } = setup();
    expect(await service.delete(userId, id)).toEqual({ id, deleted: true });
    expect(repository.delete).toHaveBeenCalledWith(userId, id);
  });
  it.each(['get', 'create', 'update', 'delete'] as const)(
    'returns 404 for an absent row in %s',
    async (method) => {
      const { service, repository } = setup();
      repository.find.mockResolvedValue(undefined);
      repository.create.mockResolvedValue(undefined);
      repository.update.mockResolvedValue(undefined);
      repository.delete.mockResolvedValue(undefined);
      const calls = {
        get: () => service.get(userId, id),
        create: () =>
          service.create(userId, { name: 'Exemplo', type: 'expense' }),
        update: () => service.update(userId, id, { name: 'Exemplo' }),
        delete: () => service.delete(userId, id),
      };
      await expect(calls[method]()).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    },
  );
});
describe('category schemas', () => {
  it('accepts both transaction category types and trims names', () => {
    for (const type of ['income', 'expense'])
      expect(createCategorySchema.parse({ name: ' Exemplo ', type })).toEqual({
        name: 'Exemplo',
        type,
      });
  });
  it.each([
    { name: ' ', type: 'expense' },
    { name: 'x'.repeat(121), type: 'income' },
    { name: 'Exemplo', type: 'transfer' },
    { name: 'Exemplo', type: 'expense', userId },
  ])('rejects invalid category case %#', (input) => {
    expect(createCategorySchema.safeParse(input).success).toBe(false);
  });
  it('requires an actual patch field', () => {
    expect(patchCategorySchema.safeParse({}).success).toBe(false);
    expect(patchCategorySchema.safeParse({ name: undefined }).success).toBe(
      false,
    );
    expect(patchCategorySchema.parse({ type: 'income' })).toEqual({
      type: 'income',
    });
  });
  it('supplies defaults and supports explicit sort/filter pagination', () => {
    expect(categoriesQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      sortBy: 'name',
      order: 'asc',
    });
    expect(
      categoriesQuerySchema.parse({
        page: '2',
        pageSize: '5',
        search: ' exemplo ',
        sortBy: 'createdAt',
        order: 'desc',
        type: 'income',
      }),
    ).toMatchObject({
      page: 2,
      pageSize: 5,
      search: 'exemplo',
      sortBy: 'createdAt',
      order: 'desc',
      type: 'income',
    });
    expect(categoriesQuerySchema.safeParse({ pageSize: 101 }).success).toBe(
      false,
    );
  });
});
