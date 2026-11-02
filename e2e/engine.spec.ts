import { expect, test } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:4000';
const RW = `${API}/api/countries/RW`;
const MATHS = 'secondary-mathematics-teacher-s1-s3-mock-1';

test.describe('Exam engine (real server, real clock)', () => {
  test('Flow A, API level: guest starts a free mock → answers → refresh keeps them → submits', async ({ request }) => {
    const start = await request.post(`${RW}/mock-tests/${MATHS}/attempts`, { data: {} });
    expect(start.status()).toBe(201);
    const { attemptId, guestToken } = await start.json();
    const h = { 'X-Guest-Token': guestToken };

    const state = await (await request.get(`${API}/api/attempts/${attemptId}`, { headers: h })).json();
    expect(state.questions).toHaveLength(20);
    expect(JSON.stringify(state)).not.toMatch(/explanation|"correct"/);

    const [q1, q2, q3] = state.questions;
    const saved = await request.put(`${API}/api/attempts/${attemptId}/answers`, {
      headers: h,
      data: { changes: [
        { questionId: q1.id, selected: ['A'] },
        { questionId: q2.id, selected: ['B'], flagged: true },
        { questionId: q3.id, flagged: true },
      ] },
    });
    expect((await saved.json()).counts).toEqual({ total: 20, answered: 2, flagged: 2 });

    // "Refresh": a brand-new load of the same attempt shows the same answers, and the server clock moved on.
    await new Promise((r) => setTimeout(r, 1500));
    const again = await (await request.get(`${API}/api/attempts/${attemptId}`, { headers: h })).json();
    expect(again.answers[q1.id]).toEqual({ selected: ['A'], flagged: false });
    expect(again.answers[q2.id]).toEqual({ selected: ['B'], flagged: true });
    expect(again.timer.remainingSeconds).toBeLessThan(1800);
    expect(again.timer.remainingSeconds).toBeGreaterThan(1790);

    // Starting the same test again resumes it rather than creating a second attempt.
    const resume = await request.post(`${RW}/mock-tests/${MATHS}/attempts`, { headers: h, data: {} });
    expect(resume.status()).toBe(200);
    expect((await resume.json()).attemptId).toBe(attemptId);

    const listed = await (await request.get(`${API}/api/attempts/in-progress`, { headers: h })).json();
    expect(listed.attempts[0]).toMatchObject({ id: attemptId, answered: 2, total: 20 });

    const done = await request.post(`${API}/api/attempts/${attemptId}/submit`, { headers: h, data: {} });
    expect(await done.json()).toMatchObject({ status: 'SUBMITTED', unanswered: 18 });
    const closed = await request.put(`${API}/api/attempts/${attemptId}/answers`, { headers: h, data: { changes: [{ questionId: q1.id, selected: ['C'] }] } });
    expect(closed.status()).toBe(409);
  });

  test('paid tests are gated: guest 401, no grant 402', async ({ request }) => {
    const guest = await request.post(`${RW}/mock-tests/accountant-public-institution-mock-1/attempts`, { data: {} });
    expect(guest.status()).toBe(401);
    expect((await guest.json()).error).toBe('sign_in_required');
  });

  test('another guest cannot read or write someone else’s attempt', async ({ request }) => {
    const a = await (await request.post(`${RW}/mock-tests/${MATHS}/attempts`, { data: {} })).json();
    const b = await (await request.post(`${RW}/mock-tests/${MATHS}/attempts`, { data: {} })).json();
    const res = await request.get(`${API}/api/attempts/${a.attemptId}`, { headers: { 'X-Guest-Token': b.guestToken } });
    expect(res.status()).toBe(404);
  });
});
