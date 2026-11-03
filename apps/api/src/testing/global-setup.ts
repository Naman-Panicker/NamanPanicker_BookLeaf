import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { testDatabaseUrl } from './test-database';

export default function globalSetup() {
  const url = testDatabaseUrl();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: resolve(import.meta.dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: 'pipe',
  });
}
