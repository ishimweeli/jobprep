import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { API, FREE_SLUG, isPhone } from './web-helpers';

/** Helpers shared by the exam / results / checkout specs. */

export const FREE_TITLE = 'Secondary Mathematics Teacher (S1–S3) — Mock 1';
export { FREE_SLUG };

/** Guest tokens this browser holds (the web app keeps them in localStorage `jobprep.guestTokens`). */
export const guestTokens = (page: Page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('jobprep.guestTokens') ?? '[]') as string[];
    } catch {
      return [];
    }
  });

export const attemptIdFromUrl = (page: Page): string => {
  const m = page.url().match(/\/exam\/([a-z0-9]+)/i);
  if (!m?.[1]) throw new Error(`not on an exam page: ${page.url()}`);
  return m[1];
};

/** Server-side view of an attempt, as the owner (guest token or the page's session cookie). */
export async function serverState(request: APIRequestContext, id: string, tokens: string[] = []) {
  const res = await request.get(`${API}/api/attempts/${id}`, { headers: tokens.length ? { 'X-Guest-Token': tokens.join(',') } : {} });
  expect(res.ok(), `GET attempt ${id}`).toBeTruthy();
  return (await res.json()) as {
    attempt: { status: string };
    timer: { remainingSeconds: number };
    questions: { id: string; number: number }[];
    answers: Record<string, { selected: string[]; flagged: boolean }>;
    counts: { total: number; answered: number; flagged: number };
    finished: boolean;
  };
}

export async function serverTimer(request: APIRequestContext, id: string, tokens: string[] = []) {
  const res = await request.get(`${API}/api/attempts/${id}/timer`, { headers: tokens.length ? { 'X-Guest-Token': tokens.join(',') } : {} });
  return (await res.json()) as { remainingSeconds: number; status: string };
}

/** Whole seconds on the clock ("42:18" -> 2538). */
export async function clockSeconds(page: Page): Promise<number> {
  const text = (await page.getByRole('timer').innerText()).trim();
  const [m, s] = text.split(':').map(Number);
  return (m ?? 0) * 60 + (s ?? 0);
}

export const optionButtons = (page: Page) => page.getByRole('group', { name: 'Answer options' }).getByRole('button');

/** Choose option A..D of the current question. */
export const choose = (page: Page, letter: 'A' | 'B' | 'C' | 'D') => optionButtons(page).nth('ABCD'.indexOf(letter)).click();

export const nextButton = (page: Page, info: TestInfo) =>
  isPhone(info) ? page.getByRole('button', { name: 'Next question' }) : page.getByRole('button', { name: /^(Next →|Finish)$/ });
export const prevButton = (page: Page, info: TestInfo) =>
  isPhone(info) ? page.getByRole('button', { name: 'Previous question' }) : page.getByRole('button', { name: '← Previous' });
export const submitButton = (page: Page, info: TestInfo) => page.getByRole('button', { name: isPhone(info) ? 'Submit' : 'Submit exam', exact: true });
export const flagButton = (page: Page) => page.getByRole('button', { name: 'Flag for review' });

/** The header's save line: "All answers saved" / "Saved" (phone) / "N answers waiting to save". */
export const saveStatus = (page: Page) => page.locator('header [role=status]');
export const expectSaved = (page: Page, info: TestInfo) => expect(saveStatus(page)).toHaveText(isPhone(info) ? 'Saved' : 'All answers saved', { useInnerText: true });

export const questionHeading = (page: Page) => page.getByRole('heading', { level: 1, name: /^Question \d+ of \d+/ });

/** Start the seeded free Secondary Mathematics test with no account and land on question 1. */
export async function startFreeExam(page: Page) {
  await page.goto(`/rw/tests/${FREE_SLUG}/start`);
  await expect(page).toHaveURL(/\/rw\/exam\/[a-z0-9]+$/);
  await expect(questionHeading(page)).toHaveText('Question 1 of 20');
  return attemptIdFromUrl(page);
}

export const ACCOUNTANT_SLUG = 'accountant-public-institution-mock-1';

export const simulatePayment = (request: APIRequestContext, id: string, outcome: 'success' | 'decline' | 'fail' | 'duplicate' | 'timeout') =>
  request.post(`${API}/api/test/payments/${id}/simulate`, { data: { outcome } });

/** Buy Full Access through the API (fake provider) for the signed-in cookie jar of `request`. */
export async function buyAccessViaApi(request: APIRequestContext, phone: string) {
  const created = await request.post(`${API}/api/payments`, { data: { provider: 'MTN_MOMO', msisdn: phone } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  expect((await simulatePayment(request, id, 'success')).ok()).toBeTruthy();
  return id;
}

/** Start, answer (letters in order, '-' = skip) and submit a test through the API as the signed-in user. */
export async function completeViaApi(request: APIRequestContext, slug: string, letters: string) {
  const start = await request.post(`${API}/api/countries/RW/mock-tests/${slug}/attempts`, { data: {} });
  expect(start.ok(), `start ${slug}`).toBeTruthy();
  const { attemptId } = (await start.json()) as { attemptId: string };
  const state = await (await request.get(`${API}/api/attempts/${attemptId}`)).json();
  const changes = (state.questions as { id: string }[])
    .map((q, i) => ({ questionId: q.id, selected: letters[i] && letters[i] !== '-' ? [letters[i]!] : undefined }))
    .filter((c): c is { questionId: string; selected: string[] } => !!c.selected);
  if (changes.length) expect((await request.put(`${API}/api/attempts/${attemptId}/answers`, { data: { changes } })).ok()).toBeTruthy();
  expect((await request.post(`${API}/api/attempts/${attemptId}/submit`, { data: {} })).ok()).toBeTruthy();
  return attemptId;
}
