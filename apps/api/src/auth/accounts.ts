import type { Role, SessionUser } from '@bookleaf/shared';
import type { PrismaClient } from '../db';
import type { Session } from './sessions';

export type Account = SessionUser & { passwordHash: string };

type AccountRecord = { id: string; name: string; email: string; passwordHash: string };

export async function findAccountByEmail(prisma: PrismaClient, email: string): Promise<Account | undefined> {
  const admin = await prisma.admin.findUnique({ where: { email } });
  if (admin) return toAccount(admin, 'ADMIN');
  const author = await prisma.author.findUnique({ where: { email } });
  return author ? toAccount(author, 'AUTHOR') : undefined;
}

export async function findAccountForSession(
  prisma: PrismaClient,
  { id, role }: Session,
): Promise<Account | undefined> {
  const record =
    role === 'ADMIN'
      ? await prisma.admin.findUnique({ where: { id } })
      : await prisma.author.findUnique({ where: { id } });
  return record ? toAccount(record, role) : undefined;
}

function toAccount({ id, name, email, passwordHash }: AccountRecord, role: Role): Account {
  return { id, role, name, email, passwordHash };
}

export function toSessionUser({ id, role, name, email }: Account): SessionUser {
  return { id, role, name, email };
}
