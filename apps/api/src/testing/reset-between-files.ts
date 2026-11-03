import { afterAll, beforeAll } from 'vitest';
import { disconnectTestDatabase, resetDatabase } from './harness';

beforeAll(resetDatabase);
afterAll(disconnectTestDatabase);
