// Resetting wipes every table, so never run against the database the app uses.
export function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('Set TEST_DATABASE_URL in apps/api/.env to a database the tests can wipe. See .env.example.');
  }
  if (url === process.env.DATABASE_URL || url === process.env.DIRECT_URL) {
    throw new Error('TEST_DATABASE_URL must not point at the same database as DATABASE_URL or DIRECT_URL.');
  }
  return url;
}
