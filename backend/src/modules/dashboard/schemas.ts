import { z } from 'zod';
import { monthSchema } from '../../shared/validation.js';

export const dashboardQuerySchema = z.strictObject({
  month: monthSchema.optional(),
});
export type DashboardQuery = z.output<typeof dashboardQuerySchema>;
