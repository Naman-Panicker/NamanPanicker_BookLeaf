import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, seed } from './seed';
import { makeTestApp, prisma, resetDatabase } from './testing/harness';

beforeEach(resetDatabase);

describe('seeding', () => {
  it('lets a sample Author sign in with the demo password', async () => {
    await seed(prisma);

    const res = await request(makeTestApp())
      .post('/api/session')
      .send({ email: 'kavita.deshmukh@email.com', password: DEMO_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'AUTHOR', name: 'Kavita Deshmukh' });
  });

  it('lets both Admins sign in with the demo password', async () => {
    const { admins } = await seed(prisma);

    expect(admins).toHaveLength(2);
    for (const email of admins) {
      const res = await request(makeTestApp())
        .post('/api/session')
        .send({ email, password: DEMO_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('ADMIN');
    }
  });

  it('loads the sample Author profile and keeps the sample ID as a reference', async () => {
    await seed(prisma);

    const priya = await prisma.author.findUnique({ where: { externalRef: 'AUTH001' } });

    expect(priya).toMatchObject({
      name: 'Priya Sharma',
      email: 'priya.sharma@email.com',
      phone: '+91-98765-43210',
      city: 'Mumbai',
      joinedDate: new Date('2023-03-15'),
    });
  });

  it('can run again without creating duplicates or changing IDs', async () => {
    await seed(prisma);
    const before = await prisma.author.findUnique({ where: { externalRef: 'AUTH001' } });

    await seed(prisma);

    expect(await prisma.author.count()).toBe(10);
    expect(await prisma.admin.count()).toBe(2);
    const after = await prisma.author.findUnique({ where: { externalRef: 'AUTH001' } });
    expect(after?.id).toBe(before?.id);
  });
});
