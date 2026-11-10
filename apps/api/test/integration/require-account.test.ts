import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ConsoleEmailProvider } from '../../src/services/email';
import { resetAndSeed, signedInAgent, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
const now = () => new Date('2026-11-02T10:00:00Z');
const open = createApp({ prisma, config: testConfig({ REQUIRE_ACCOUNT: 'false' }), email: mail, now }); // how the site behaved before
const strict = createApp({ prisma, config: testConfig({ REQUIRE_ACCOUNT: 'true' }), email: mail, now }); // the default now
const MATHS = 'secondary-mathematics-teacher-s1-s3-mock-1';
const start = (app: Parameters<typeof request>[0]) => request(app).post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({});

beforeAll(() => resetAndSeed(prisma));
afterAll(() => prisma.$disconnect());

describe('an exam needs an account', () => {
  it('a guest cannot start an exam: they are told to sign up; a signed-in candidate starts normally', async () => {
    const guest = await start(strict);
    expect(guest.status).toBe(401);
    expect(guest.body.error).toBe('account_required');
    expect(guest.body.attemptId).toBeUndefined();

    const { agent } = await signedInAgent(strict, mail, 'needsaccount@example.com');
    const mine = await agent.post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({});
    expect(mine.status).toBe(201);
    expect(mine.body.attemptId).toBeTruthy();
  });

  it('a guest attempt that already exists shows no marks or review until the person signs up', async () => {
    const begun = await start(open);
    const id = begun.body.attemptId as string;
    const token = begun.body.guestToken as string;
    expect((await request(strict).post(`/api/attempts/${id}/submit`).set('X-Guest-Token', token).send({})).status).toBe(200);

    for (const path of [`/api/attempts/${id}/result`, `/api/attempts/${id}/review`]) {
      const r = await request(strict).get(path).set('X-Guest-Token', token);
      expect(r.status, path).toBe(403);
      expect(r.body.error).toBe('sign_up_required');
      expect(JSON.stringify(r.body)).not.toMatch(/score|percent/i);
    }

    // Signing up in the same browser attaches the attempt, and then the marks are there.
    const { agent } = await signedInAgent(strict, mail, 'lockedguest@example.com');
    expect((await agent.post('/api/me/claim-attempts').send({ guestTokens: [token] })).status).toBe(200);
    const result = await agent.get(`/api/attempts/${id}/result`);
    expect(result.status).toBe(200);
    expect(result.body.score.totalMarks).toBeGreaterThan(0);
  });
});
