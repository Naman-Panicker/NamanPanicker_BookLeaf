import { z } from 'zod';

export const roleSchema = z.enum(['AUTHOR', 'ADMIN']);
export type Role = z.infer<typeof roleSchema>;

export const sessionUserSchema = z.object({
  id: z.string(),
  role: roleSchema,
  name: z.string(),
  email: z.string(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const loginRequestSchema = z.object({
  email: z
    .string({ error: 'Enter your email address.' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Enter a valid email address.' })),
  password: z.string({ error: 'Enter your password.' }).min(1, { error: 'Enter your password.' }),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const sessionResponseSchema = z.object({ user: sessionUserSchema });
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
