import { expect, test } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:4000';
const MATHS = 'secondary-mathematics-teacher-s1-s3-mock-1';

test('Flow A (API level, no account): free mock → submit → results → review → practice weak areas → another test', async ({ request }) => {
  const start = await (await request.post(`${API}/api/countries/RW/mock-tests/${MATHS}/attempts`, { data: {} })).json();
  const h = { 'X-Guest-Token': start.guestToken };
  const state = await (await request.get(`${API}/api/attempts/${start.attemptId}`, { headers: h })).json();

  // Answer the first 8 with A (some will be right), leave the rest blank, flag one.
  const changes = state.questions.slice(0, 8).map((q: { id: string }, i: number) => ({ questionId: q.id, selected: ['A'], ...(i === 2 && { flagged: true }) }));
  expect((await request.put(`${API}/api/attempts/${start.attemptId}/answers`, { headers: h, data: { changes } })).ok()).toBeTruthy();
  expect((await request.post(`${API}/api/attempts/${start.attemptId}/submit`, { headers: h, data: {} })).ok()).toBeTruthy();

  const result = await (await request.get(`${API}/api/attempts/${start.attemptId}/result`, { headers: h })).json();
  expect(result.counts.total).toBe(20);
  expect(result.counts.correct + result.counts.incorrect + result.counts.unanswered).toBe(20);
  expect(result.counts.unanswered).toBe(12);
  expect(result.noOfficialPassMark).toBe(true);
  expect(result.isGuest).toBe(true);
  expect(result.topics.length).toBeGreaterThan(0);

  const review = await (await request.get(`${API}/api/attempts/${start.attemptId}/review?filter=all`, { headers: h })).json();
  expect(review.items).toHaveLength(20);
  expect(review.counts).toMatchObject({ all: 20, flagged: 1, unanswered: 12 });
  expect(review.items[0].explanation.length).toBeGreaterThan(10);

  const practice = await request.post(`${API}/api/attempts/${start.attemptId}/practice`, { headers: h });
  expect(practice.status()).toBe(201);
  const p = await practice.json();
  expect(p.questionCount).toBeGreaterThanOrEqual(3);
  const pState = await (await request.get(`${API}/api/attempts/${p.attemptId}`, { headers: h })).json();
  expect(pState.attempt.kind).toBe('PRACTICE');
  expect(JSON.stringify(pState)).not.toMatch(/explanation|"correct"/);

  // "Try another mock test": the next free test starts with the same guest token.
  const another = await request.post(`${API}/api/countries/RW/mock-tests/primary-teacher-general-p1-p6-mock-1/attempts`, { headers: h, data: {} });
  expect(another.status()).toBe(201);
});
