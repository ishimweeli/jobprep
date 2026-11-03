import { expect, test, type Page } from '@playwright/test';
import { API, FREE_SLUG, PAID_SLUG, isPhone, watchErrors } from './web-helpers';

const NO_PASS_MARK = 'No official pass mark is published for this examination, so JobPrep shows your score and percentage only.';

/** Serve the real API response with a patch applied (to exercise states the seed data does not contain). */
async function patchDetail(page: Page, slug: string, patch: (b: Record<string, unknown>) => void) {
  await page.route(`**/api/countries/rw/mock-tests/${slug}`, async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as Record<string, unknown>;
    patch(body);
    await route.fulfill({ response: res, json: body });
  });
}

test.describe('Web: exam details', () => {
  test('free test: facts, sections, instructions, no-pass-mark note, Get started, no price', async ({ page, request }) => {
    const w = watchErrors(page);
    const api = await (await request.get(`${API}/api/countries/rw/mock-tests/${FREE_SLUG}`)).json();
    await page.goto(`/rw/tests/${FREE_SLUG}`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(api.title);
    const facts = page.getByRole('definition').filter({ hasText: /./ });
    await expect(facts.first()).toBeVisible();
    await expect(page.getByText(`${api.durationMinutes} min`, { exact: true })).toBeVisible();
    await expect(page.getByText(String(api.totalMarks), { exact: true }).locator("visible=true").first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What the test covers' })).toBeVisible();
    await expect(page.getByText(api.sections[0].name).locator("visible=true").first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Instructions' })).toBeVisible();
    await expect(page.getByTestId('no-pass-mark')).toHaveText(NO_PASS_MARK);
    await expect(page.getByText('You have not taken this test yet.')).toBeVisible();

    await expect(page.getByRole('link', { name: 'Get started' }).last()).toBeVisible();
    await expect(page.getByText('Free', { exact: true }).locator("visible=true").first()).toBeVisible();
    await expect(page.locator('main').getByText(/RWF/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Get Full Access/ })).toHaveCount(0);
    w.expectClean();
  });

  test('paid test: price from the API, Get Full Access / Unlock, free sample, pass-mark note', async ({ page, request }, info) => {
    const api = await (await request.get(`${API}/api/countries/rw/mock-tests/${PAID_SLUG}`)).json();
    expect(api.pricing.priceLabel).toMatch(/^RWF /);
    await page.goto(`/rw/tests/${PAID_SLUG}`);

    await expect(page.getByText(api.pricing.priceLabel, { exact: true }).locator("visible=true").first()).toBeVisible();
    await expect(page.getByText(`Full Access · ${api.pricing.durationDays} days`).locator("visible=true").first()).toBeVisible();
    const sample = `Try the free ${api.freeSample.questionCount}-question sample`;
    await expect(page.getByRole('link', { name: sample })).toBeVisible();
    if (isPhone(info)) {
      await expect(page.getByRole('button', { name: 'Unlock with Mobile Money' })).toBeVisible(); // a guest gets the "part of Full Access" dialog
    } else {
      await expect(page.getByRole('button', { name: `Get Full Access · ${api.pricing.priceLabel}` })).toBeVisible();
      await expect(page.getByText(`Pay with ${api.pricing.paymentMethods.join(' or ')}`)).toBeVisible();
    }
    await expect(page.locator('a[href$="/start"]', { hasText: 'Get started' })).toHaveCount(0);
    await expect(page.getByTestId('no-pass-mark')).toHaveText(NO_PASS_MARK);
  });

  test('a price change in the API shows up on the page (never hardcoded)', async ({ page }) => {
    await patchDetail(page, PAID_SLUG, (b) => {
      (b.pricing as Record<string, unknown>).priceLabel = 'RWF 9,999';
      (b.pricing as Record<string, unknown>).durationDays = 7;
    });
    await page.goto(`/rw/tests/${PAID_SLUG}`);
    await expect(page.getByText('RWF 9,999', { exact: true }).locator("visible=true").first()).toBeVisible();
    await expect(page.getByText('Full Access · 7 days').locator("visible=true").first()).toBeVisible();
    await expect(page.getByText('RWF 2,000')).toHaveCount(0);
  });

  test('an official pass mark is shown only when the API returns one with its source', async ({ page }) => {
    await patchDetail(page, FREE_SLUG, (b) => {
      b.passMark = { percent: 60, source: 'REB circular 12/2026' };
      b.noOfficialPassMark = false;
    });
    await page.goto(`/rw/tests/${FREE_SLUG}`);
    await expect(page.getByTestId('pass-mark')).toContainText('60%');
    await expect(page.getByTestId('pass-mark')).toContainText('REB circular 12/2026');
    await expect(page.getByTestId('no-pass-mark')).toHaveCount(0);
  });

  test('a test unlocked by Full Access uses the unlocked layout (ExamDetailUnlocked.dc)', async ({ page }) => {
    await patchDetail(page, PAID_SLUG, (b) => {
      b.access = { state: 'GRANTED', canStart: true, requiresAccount: false, needsFullAccess: false, accessEndsAt: null, daysLeft: 12 };
      b.pricing = null;
    });
    await page.goto(`/rw/tests/${PAID_SLUG}`);
    await expect(page.getByText('Unlocked with Full Access')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Start' }).getByRole('link', { name: 'Get started' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What the test covers' })).toHaveCount(0);
  });

  test('phone: the CTA bar is fixed at the bottom of the viewport', async ({ page }, info) => {
    test.skip(!isPhone(info), 'phone layout');
    await page.goto(`/rw/tests/${PAID_SLUG}`);
    const bar = page.getByTestId('cta-bar');
    await expect(bar).toBeVisible();
    const vh = page.viewportSize()!.height;
    const box = (await bar.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(vh);
    await page.mouse.wheel(0, 600);
    const after = (await bar.boundingBox())!;
    expect(Math.round(after.y + after.height)).toBeLessThanOrEqual(vh);
    expect(after.y).toBeGreaterThan(vh / 2);
  });

  test('an unknown test shows the designed error state', async ({ page }) => {
    await page.goto('/rw/tests/does-not-exist');
    await expect(page.getByRole('alert')).toContainText('We could not load this mock test');
  });
});
