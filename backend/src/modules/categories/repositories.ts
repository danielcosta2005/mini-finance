import { and, asc, count, desc, eq, ilike } from 'drizzle-orm';
import { categories } from '../../db/schema/catalog.js';
import type { DbExecutor } from '../../db/types.js';
import type {
  CategoriesQuery,
  CreateCategory,
  PatchCategory,
} from './schemas.js';

export function createCategoriesRepository(db: DbExecutor) {
  const owned = (userId: string, id: string) =>
    and(eq(categories.id, id), eq(categories.userId, userId));
  return {
    async list(userId: string, query: CategoriesQuery) {
      const where = and(
        eq(categories.userId, userId),
        query.type ? eq(categories.type, query.type) : undefined,
        query.search
          ? ilike(
              categories.name,
              `%${query.search.replace(/[\\%_]/g, '\\$&')}%`,
            )
          : undefined,
      );
      const order = query.order === 'asc' ? asc : desc;
      const [data, totals] = await Promise.all([
        db
          .select()
          .from(categories)
          .where(where)
          .orderBy(order(categories[query.sortBy]), order(categories.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(categories).where(where),
      ]);
      return { data, total: totals[0]?.total ?? 0 };
    },
    async find(userId: string, id: string) {
      return (
        await db.select().from(categories).where(owned(userId, id)).limit(1)
      )[0];
    },
    async create(userId: string, input: CreateCategory) {
      return (
        await db
          .insert(categories)
          .values({ userId, ...input })
          .returning()
      )[0];
    },
    async update(userId: string, id: string, input: PatchCategory) {
      return (
        await db
          .update(categories)
          .set({ ...input, updatedAt: new Date() })
          .where(owned(userId, id))
          .returning()
      )[0];
    },
    async delete(userId: string, id: string) {
      return (
        await db
          .delete(categories)
          .where(owned(userId, id))
          .returning({ id: categories.id })
      )[0];
    },
  };
}
export type CategoriesRepository = ReturnType<
  typeof createCategoriesRepository
>;
