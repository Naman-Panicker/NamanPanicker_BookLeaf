import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

const COST = 10;
const HASH_FOR_UNKNOWN_EMAIL = bcrypt.hashSync(randomUUID(), COST);

export function hashPassword(password: string) {
  return bcrypt.hash(password, COST);
}

// With no account to check, it still does the same work, so response time doesn't reveal which emails exist.
export async function verifyPassword(password: string, hash: string | undefined) {
  const matches = await bcrypt.compare(password, hash ?? HASH_FOR_UNKNOWN_EMAIL);
  return matches && hash !== undefined;
}
