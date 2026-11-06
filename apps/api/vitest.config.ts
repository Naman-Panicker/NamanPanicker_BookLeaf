import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineProject } from 'vitest/config';

const envFile = resolve(import.meta.dirname, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineProject({
  test: {
    name: 'api',
    environment: 'node',
    globalSetup: ['./src/testing/global-setup.ts'],
    setupFiles: ['./src/testing/reset-between-files.ts'],
    // All test files share one database, and each one starts by resetting it.
    fileParallelism: false,
    // Every query crosses the network to Neon, and seeding alone makes dozens of them. On a slow
    // connection a query takes 500ms and a new connection 5s, so a tighter limit fails at random.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
