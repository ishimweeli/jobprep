import { expect, test } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:4000';

test.describe('API smoke (seeded dev database)', () => {
  test('health is ok', async ({ request }) => {
    const res = await request.get(`${API}/api/health`);
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toEqual({ status: 'ok', db: 'up' });
  });

  test('Rwanda: RWF 2,000 comes from the database, Kenya has no price', async ({ request }) => {
    const rw = await (await request.get(`${API}/api/countries/RW`)).json();
    expect(rw.plan.priceLabel).toBe('RWF 2,000');
    expect(rw.plan.checkoutAvailable).toBe(true);
    const ke = await (await request.get(`${API}/api/countries/KE`)).json();
    expect(ke.plan.priceLabel).toBeNull();
    expect(ke.plan.checkoutAvailable).toBe(false);
  });

  test('security headers are present and the framework is not advertised', async ({ request }) => {
    const res = await request.get(`${API}/api/health`);
    expect(res.headers()['x-powered-by']).toBeUndefined();
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });
});
