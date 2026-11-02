import { expect, test, type APIRequestContext } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:4000';
const RW = `${API}/api/countries/RW`;
const randomRwPhone = () => `+250789${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;

async function signUp(request: APIRequestContext, phone: string) {
  await request.post(`${API}/api/auth/otp/request`, { data: { purpose: 'sign_up', countryCode: 'RW', phone } });
  const { code } = await (await request.get(`${API}/api/test/otp`, { params: { phone } })).json();
  const res = await request.post(`${API}/api/auth/sign-up`, { data: { countryCode: 'RW', phone, name: 'E2E Payer', code } });
  expect(res.status()).toBe(201);
}
const simulate = (request: APIRequestContext, id: string, outcome: string) =>
  request.post(`${API}/api/test/payments/${id}/simulate`, { data: { outcome } });

test.describe('Payments (real server, fake provider)', () => {
  test('Flow B (API level): search Accountant → paid test → MoMo → Full Access → case-based exam → results', async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const phone = randomRwPhone();
    await signUp(request, phone);

    const list = await (await request.get(`${RW}/mock-tests`, { params: { q: 'Accountant' } })).json();
    const paid = list.results.find((r: { isFree: boolean }) => !r.isFree);
    const locked = await request.post(`${RW}/mock-tests/${paid.slug}/attempts`, { data: {} });
    expect(locked.status()).toBe(402);

    const summary = await (await request.get(`${API}/api/me/checkout`)).json();
    expect(summary.plan.priceLabel).toBe('RWF 2,000');
    const created = await request.post(`${API}/api/payments`, { data: { provider: 'MTN_MOMO', msisdn: phone } });
    expect(created.status()).toBe(201);
    const payment = await created.json();
    expect(payment).toMatchObject({ status: 'PENDING', priceLabel: 'RWF 2,000' });

    await simulate(request, payment.id, 'success');
    const done = await (await request.get(`${API}/api/payments/${payment.id}`)).json();
    expect(done).toMatchObject({ status: 'SUCCESSFUL', access: { daysLeft: 30, countryCode: 'RW' } });
    expect(done.transactionId).toBeTruthy();

    const start = await (await request.post(`${RW}/mock-tests/${paid.slug}/attempts`, { data: {} })).json();
    const state = await (await request.get(`${API}/api/attempts/${start.attemptId}`)).json();
    expect(state.cases).toHaveLength(1);
    expect(state.cases[0].tables[0].rows.length).toBeGreaterThan(0);
    const changes = state.questions.map((q: { id: string }) => ({ questionId: q.id, selected: ['A'] }));
    await request.put(`${API}/api/attempts/${start.attemptId}/answers`, { data: { changes } });
    expect((await request.post(`${API}/api/attempts/${start.attemptId}/submit`, { data: {} })).ok()).toBeTruthy();
    const result = await (await request.get(`${API}/api/attempts/${start.attemptId}/result`)).json();
    expect(result.counts.total).toBe(12);
    expect(result.isGuest).toBe(false);
    expect(result.noOfficialPassMark).toBe(true);
    await request.dispose();
  });

  test('declined and expired payments say "You were not charged" and give no access', async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const phone = randomRwPhone();
    await signUp(request, phone);

    const a = await (await request.post(`${API}/api/payments`, { data: { provider: 'AIRTEL_MONEY', msisdn: phone } })).json();
    await simulate(request, a.id, 'decline');
    const declined = await (await request.get(`${API}/api/payments/${a.id}`)).json();
    expect(declined).toMatchObject({ status: 'DECLINED', notCharged: true });
    expect(declined.message).toContain('You were not charged');

    const b = await (await request.post(`${API}/api/payments/${a.id}/resend`, { data: {} })).json();
    expect(b.status).toBe('PENDING');
    await simulate(request, b.id, 'timeout');
    const expired = await (await request.get(`${API}/api/payments/${b.id}`)).json();
    expect(expired).toMatchObject({ status: 'EXPIRED', notCharged: true });
    expect((await (await request.get(`${API}/api/me`)).json()).access.current).toBeNull();
    await request.dispose();
  });

  test('a forged webhook is rejected', async ({ request }) => {
    const res = await request.post(`${API}/api/payments/webhooks/fake`, {
      headers: { 'x-fake-signature': 'f'.repeat(64) },
      data: { paymentId: 'x', status: 'SUCCESSFUL' },
    });
    expect(res.status()).toBe(401);
  });
});
