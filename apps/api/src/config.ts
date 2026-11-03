import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().default(4000),
  NODE_ENV: z.string().optional(),
});

export function loadConfig(env: NodeJS.ProcessEnv) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Names only, because the values are secrets.
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment. See apps/api/.env.example.\n${problems.join('\n')}`);
  }
  const { DATABASE_URL, SESSION_SECRET, PORT, NODE_ENV } = result.data;
  return {
    databaseUrl: DATABASE_URL,
    sessionSecret: SESSION_SECRET,
    port: PORT,
    cookieSecure: NODE_ENV === 'production',
  };
}
