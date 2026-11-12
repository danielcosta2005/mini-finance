import { notFound } from '../../shared/api-error.js';
import { paginated } from '../../shared/http.js';
import type { CategoriesRepository } from './repositories.js';
import type {
  CategoriesQuery,
  CreateCategory,
  PatchCategory,
} from './schemas.js';

export function createCategoriesService(repository: CategoriesRepository) {
  return {
    async list(userId: string, query: CategoriesQuery) {
      const result = await repository.list(userId, query);
      return paginated(result.data, result.total, {
        page: query.page,
        pageSize: query.pageSize,
      });
    },
    async get(userId: string, id: string) {
      const category = await repository.find(userId, id);
      if (!category) throw notFound();
      return category;
    },
    async create(userId: string, input: CreateCategory) {
      const category = await repository.create(userId, input);
      if (!category) throw notFound();
      return category;
    },
    async update(userId: string, id: string, input: PatchCategory) {
      const category = await repository.update(userId, id, input);
      if (!category) throw notFound();
      return category;
    },
    async delete(userId: string, id: string) {
      const category = await repository.delete(userId, id);
      if (!category) throw notFound();
      return { id: category.id, deleted: true as const };
    },
  };
}
export type CategoriesService = ReturnType<typeof createCategoriesService>;
