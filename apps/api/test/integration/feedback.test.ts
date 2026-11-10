import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { ConsoleEmailProvider } from '../../src/services/email';
import { adminAgent, ADMINS, resetAndSeed, testConfig, testPrisma } from '../helpers';

const prisma = testPrisma();
const mail = new ConsoleEmailProvider(() => {});
const app = createApp({ prisma, config: testConfig(), email: mail, now: () => new Date('2026-11-02T10:00:00Z') });
const MATHS = 'secondary-mathematics-teacher-s1-s3-mock-1';

beforeAll(() => resetAndSeed(prisma));
afterAll(() => prisma.$disconnect());

async function start() {
  const res = await request(app).post(`/api/countries/RW/mock-tests/${MATHS}/attempts`).send({});
  return { id: res.body.attemptId as string, token: res.body.guestToken as string };
}

describe('optional exam feedback', () => {
  it('only after the exam is finished, one per attempt, and it shows on the result', async () => {
    const { id, token } = await start();
    const post = (body: object, t = token) => request(app).post(`/api/attempts/${id}/feedback`).set('X-Guest-Token', t).send(body);

    // Not while the exam is still running.
    expect((await post({ rating: 4 })).status).toBe(409);

    await request(app).post(`/api/attempts/${id}/submit`).set('X-Guest-Token', token).send({});
    const sent = await post({ rating: 4, comment: '  Question 7 looked wrong.  ' });
    expect(sent.status).toBe(201);
    expect(sent.body.feedback).toEqual({ rating: 4, comment: 'Question 7 looked wrong.' });
    expect((await request(app).get(`/api/attempts/${id}/result`).set('X-Guest-Token', token)).body.feedback).toEqual({ rating: 4, comment: 'Question 7 looked wrong.' });

    // A rating alone is fine; sending again replaces the earlier answer instead of adding a second one.
    expect((await post({ rating: 2 })).body.feedback).toEqual({ rating: 2, comment: null });
    expect(await prisma.examFeedback.count({ where: { attemptId: id } })).toBe(1);

    // Bad input and somebody else's attempt are refused.
    expect((await post({ rating: 6 })).status).toBe(400);
    expect((await post({ rating: 0 })).status).toBe(400);
    expect((await post({ rating: 3, comment: 'x'.repeat(1001) })).status).toBe(400);
    expect((await post({ comment: 'no rating' })).status).toBe(400);
    expect([403, 404]).toContain((await post({ rating: 5 }, 'some-other-token-1234567890')).status);
  });

  it('a result without feedback says so, and an admin sees the average and the comments', async () => {
    const { id, token } = await start();
    await request(app).post(`/api/attempts/${id}/submit`).set('X-Guest-Token', token).send({});
    expect((await request(app).get(`/api/attempts/${id}/result`).set('X-Guest-Token', token)).body.feedback).toBeNull();
    await request(app).post(`/api/attempts/${id}/feedback`).set('X-Guest-Token', token).send({ rating: 5, comment: 'Clear and fair.' });

    const admin = await adminAgent(app, mail, ADMINS.SYSTEM);
    const all = await admin.get('/api/admin/feedback');
    expect(all.status).toBe(200);
    expect(all.body.summary.count).toBe(2);
    expect(all.body.summary.average).toBe(3.5); // 2 and 5
    expect(all.body.summary.byRating.find((b: { rating: number }) => b.rating === 5).count).toBe(1);
    expect(all.body.results[0]).toMatchObject({ rating: 5, comment: 'Clear and fair.', user: null });
    expect((await admin.get('/api/admin/feedback?withComment=1')).body.total).toBe(1);

    // Support has no access to exams, so none to feedback either.
    const support = await adminAgent(app, mail, ADMINS.SUPPORT);
    expect((await support.get('/api/admin/feedback')).status).toBe(403);
  });
});
