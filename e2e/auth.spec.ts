import { expect, test, type APIRequestContext } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:4000';

/** A random address, so repeated runs against the dev DB never collide. */
const randomEmail = () => `e2e.${Date.now()}.${Math.floor(Math.random() * 1_000_000)}@example.com`;
const PASSWORD = 'E2e-Pass-2026!';

async function otp(request: APIRequestContext, email: string) {
  const res = await request.get(`${API}/api/test/otp`, { params: { email } });
  expect(res.ok(), 'test OTP endpoint (needs ENABLE_TEST_ENDPOINTS=true)').toBeTruthy();
  return (await res.json()).code as string;
}

test.describe('Auth and country (real server, dev DB)', () => {
  test('sign up → verify email → pick job goal → sign out → sign in with the password', async ({ playwright }) => {
    const request = await playwright.request.newContext(); // keeps the session cookie
    const email = randomEmail();

    const signUp = await request.post(`${API}/api/auth/sign-up`, {
      data: { countryCode: 'RW', email, name: 'E2E Candidate', password: PASSWORD },
    });
    expect(signUp.status()).toBe(201);
    const body = await signUp.json();
    expect(body).toMatchObject({ status: 'verification_required', email });
    expect((await request.get(`${API}/api/me`)).status()).toBe(401); // no session until the email is verified

    const code = await otp(request, email);
    expect(JSON.stringify(body)).not.toContain(code); // the code is only ever emailed, never in the response
    const verified = await request.post(`${API}/api/auth/verify-email`, { data: { email, code } });
    expect(verified.status()).toBe(200);

    const categories = (await (await request.get(`${API}/api/countries/RW/categories`)).json()).categories;
    expect(categories).toHaveLength(6);
    const goal = categories.find((c: { slug: string }) => c.slug === 'accounting-finance');
    const patched = await request.patch(`${API}/api/me`, { data: { goalCategoryId: goal.id } });
    expect((await patched.json()).user.goalCategoryId).toBe(goal.id);

    expect((await request.post(`${API}/api/auth/sign-out`)).status()).toBe(204);
    expect((await request.get(`${API}/api/me`)).status()).toBe(401);

    const wrong = await request.post(`${API}/api/auth/sign-in`, { data: { email, password: 'not-the-password' } });
    expect(wrong.status()).toBe(401);
    expect((await wrong.json()).error).toBe('invalid_credentials');

    const signIn = await request.post(`${API}/api/auth/sign-in`, { data: { email, password: PASSWORD } });
    expect(signIn.status()).toBe(200);
    const me = await (await request.get(`${API}/api/me`)).json();
    expect(me.user).toMatchObject({ email, countryCode: 'RW', goalCategoryId: goal.id, emailVerified: true });
    expect(me.country.currencyCode).toBe('RWF');
    await request.dispose();
  });

  test('Kenya is not open yet: sign-up refused, waiting list accepted', async ({ request }) => {
    const hopeful = randomEmail();
    const refused = await request.post(`${API}/api/auth/sign-up`, {
      data: { countryCode: 'KE', email: hopeful, name: 'Kenya Hopeful', password: PASSWORD },
    });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).error).toBe('country_not_available');

    const waiting = await request.post(`${API}/api/countries/KE/waiting-list`, { data: { email: hopeful } });
    expect(waiting.status()).toBe(201);
    // a repeat is not an error: 200 with alreadyOnList
    const again = await request.post(`${API}/api/countries/KE/waiting-list`, { data: { email: hopeful } });
    expect(again.status()).toBe(200);
    expect((await again.json()).alreadyOnList).toBe(true);
  });

  test('the emailed code cannot be brute-forced: wrong guesses are rejected and counted', async ({ request }) => {
    const email = randomEmail();
    await request.post(`${API}/api/auth/sign-up`, { data: { countryCode: 'RW', email, name: 'Brute Force', password: PASSWORD } });
    const good = await otp(request, email);
    const wrong = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await request.post(`${API}/api/auth/verify-email`, { data: { email, code: wrong } });
      expect(r.status()).toBe(400);
    }
    const late = await request.post(`${API}/api/auth/verify-email`, { data: { email, code: good } });
    expect((await late.json()).error).toBe('too_many_attempts');
  });

  test('five wrong passwords lock the account for 15 minutes, even for the right password', async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const email = randomEmail();
    await request.post(`${API}/api/auth/sign-up`, { data: { countryCode: 'RW', email, name: 'Lock Out', password: PASSWORD } });
    await request.post(`${API}/api/auth/verify-email`, { data: { email, code: await otp(request, email) } });
    await request.post(`${API}/api/auth/sign-out`);
    let last = 0;
    for (let i = 0; i < 5; i++) {
      last = (await request.post(`${API}/api/auth/sign-in`, { data: { email, password: 'wrong-wrong-1' } })).status();
    }
    expect(last).toBe(429);
    const locked = await request.post(`${API}/api/auth/sign-in`, { data: { email, password: PASSWORD } });
    expect(locked.status()).toBe(429);
    expect((await locked.json()).error).toBe('too_many_attempts');
    await request.dispose();
  });

  test('forgot password: the reset link sets a new password and the old one stops working', async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const email = randomEmail();
    await request.post(`${API}/api/auth/sign-up`, { data: { countryCode: 'RW', email, name: 'Reset Me', password: PASSWORD } });
    await request.post(`${API}/api/auth/verify-email`, { data: { email, code: await otp(request, email) } });
    await request.post(`${API}/api/auth/sign-out`);

    // An unknown address gets the same answer: no account discovery.
    const unknown = await request.post(`${API}/api/auth/forgot-password`, { data: { email: randomEmail() } });
    expect(unknown.status()).toBe(200);
    const known = await request.post(`${API}/api/auth/forgot-password`, { data: { email } });
    expect(known.status()).toBe(200);

    const tokenRes = await request.get(`${API}/api/test/reset-token`, { params: { email } });
    expect(tokenRes.ok()).toBeTruthy();
    const { token } = await tokenRes.json();
    const check = await request.get(`${API}/api/auth/reset-password/check`, { params: { token } });
    expect((await check.json()).email).toBe(email);

    const NEW_PASSWORD = 'Brand-New-Pass-77!';
    expect((await request.post(`${API}/api/auth/reset-password`, { data: { token, password: NEW_PASSWORD } })).status()).toBe(200);
    const reuse = await request.post(`${API}/api/auth/reset-password`, { data: { token, password: 'Another-Pass-88!' } });
    expect(reuse.status()).toBe(400); // single use
    expect((await request.post(`${API}/api/auth/sign-in`, { data: { email, password: PASSWORD } })).status()).toBe(401);
    expect((await request.post(`${API}/api/auth/sign-in`, { data: { email, password: NEW_PASSWORD } })).status()).toBe(200);
    await request.dispose();
  });
});
