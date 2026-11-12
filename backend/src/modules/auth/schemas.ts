import { z } from 'zod';
import { nameSchema } from '../../shared/validation.js';

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
const password = z.string().min(12).max(128);
export const registerSchema = z.strictObject({
  name: nameSchema,
  email,
  password,
});
export const loginSchema = z.strictObject({ email, password });
export const emptyBodySchema = z.strictObject({});
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
