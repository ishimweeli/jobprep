import { expect, test, type APIRequestContext } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:4000';

/** A random valid Rwanda mobile, so repeated runs against the dev DB never collide. */
const randomRwPhone = () => `+250789${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;

async function otp(request: APIRequestContext, phone: string) {
  const res = await request.get(`${API}/api/test/otp`, { params: { phone } });
  expect(res.ok(), 'test OTP endpoint (needs ENABLE_TEST_ENDPOINTS=true)').toBeTruthy();
  return (await res.json()).code as string;
}

test.describe('Auth and country (real server, dev DB)', () => {
  test('sign up → pick job goal → sign out → sign in again', async ({ playwright }) => {
    const request = await playwright.request.newContext(); // keeps the session cookie
    const phone = randomRwPhone();

    const req = await request.post(`${API}/api/auth/otp/request`, { data: { purpose: 'sign_up', countryCode: 'RW', phone } });
    expect(req.status()).toBe(200);
    expect(JSON.stringify(await req.json())).not.toMatch(/\d{6}/); // code never in the response

    const signUp = await request.post(`${API}/api/auth/sign-up`, {
      data: { countryCode: 'RW', phone, name: 'E2E Candidate', code: await otp(request, phone) },
    });
    expect(signUp.status()).toBe(201);

    const categories = (await (await request.get(`${API}/api/countries/RW/categories`)).json()).categories;
    expect(categories).toHaveLength(6);
    const goal = categories.find((c: { slug: string }) => c.slug === 'accounting-finance');
    const patched = await request.patch(`${API}/api/me`, { data: { goalCategoryId: goal.id } });
    expect((await patched.json()).user.goalCategoryId).toBe(goal.id);

    expect((await request.post(`${API}/api/auth/sign-out`)).status()).toBe(204);
    expect((await request.get(`${API}/api/me`)).status()).toBe(401);

    // The 45s resend cooldown is per phone + purpose, and sign-in is a different purpose.
    const inReq = await request.post(`${API}/api/auth/otp/request`, { data: { purpose: 'sign_in', phone } });
    expect(inReq.status()).toBe(200);
    const signIn = await request.post(`${API}/api/auth/sign-in`, { data: { phone, code: await otp(request, phone) } });
    expect(signIn.status()).toBe(200);
    const me = await (await request.get(`${API}/api/me`)).json();
    expect(me.user).toMatchObject({ phone, countryCode: 'RW', goalCategoryId: goal.id });
    expect(me.country.currencyCode).toBe('RWF');
    await request.dispose();
  });

  test('Kenya is not open yet: sign-up refused, waiting list accepted', async ({ request }) => {
    const refused = await request.post(`${API}/api/auth/otp/request`, { data: { purpose: 'sign_up', countryCode: 'KE', phone: '0712345678' } });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).error).toBe('country_not_available');

    const waiting = await request.post(`${API}/api/countries/KE/waiting-list`, { data: { phone: '0712345678' } });
    expect(waiting.status()).toBe(201);
  });

  test('an OTP cannot be brute-forced: wrong guesses are rejected and counted', async ({ request }) => {
    const phone = randomRwPhone();
    await request.post(`${API}/api/auth/otp/request`, { data: { purpose: 'sign_up', countryCode: 'RW', phone } });
    const good = await otp(request, phone);
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await request.post(`${API}/api/auth/sign-up`, { data: { countryCode: 'RW', phone, name: 'Brute Force', code: wrong } });
      expect(r.status()).toBe(400);
    }
    const late = await request.post(`${API}/api/auth/sign-up`, { data: { countryCode: 'RW', phone, name: 'Brute Force', code: good } });
    expect((await late.json()).error).toBe('too_many_attempts');
  });
});
