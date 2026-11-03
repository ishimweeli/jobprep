import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { API, isPhone, randomEmail, randomMsisdn, signUpViaApi } from './web-helpers';
import { ACCOUNTANT_SLUG, buyAccessViaApi, completeViaApi, FREE_SLUG, startFreeExam } from './web-exam-helpers';
import { cleanUser, me, openAccount, requestSignInCode } from './web-p3-helpers';

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(' | ')})`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test.describe('Web: accessibility of the Batch 1 screens', () => {
  test('axe: sign-in (both steps), 404, country gate, guest dialog', async ({ page }, info) => {
    await page.goto('/sign-in');
    await expectNoViolations(page);
    await requestSignInCode(page, randomEmail('a11y'));
    await expectNoViolations(page);
    await page.goto('/rw/nothing-here');
    await expect(page.getByText('Error 404')).toBeVisible();
    await expectNoViolations(page);
    await page.goto('/ug');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('isn’t open in Uganda yet');
    await expectNoViolations(page);
    await page.goto(`/rw/tests/${ACCOUNTANT_SLUG}?gate=paid`);
    await expect(page.getByRole('dialog', { name: 'This test is part of Full Access' })).toBeVisible();
    await expectNoViolations(page);
    void info;
  });

  test('axe: new-user dashboard, account menu / account tab, unlocked details, checkout result card', async ({ page }, info) => {
    await signUpViaApi(page, 'Aline Uwase');
    const userId = (await me(page)).id;
    await page.goto('/rw/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Aline' })).toBeVisible();
    await expectNoViolations(page);
    await openAccount(page, info);
    await expectNoViolations(page);
    if (!isPhone(info)) await page.keyboard.press('Escape');

    const u = await me(page);
    await buyAccessViaApi(page.request, randomMsisdn());
    await page.goto(`/rw/tests/${ACCOUNTANT_SLUG}`);
    await expect(page.getByText('Unlocked with Full Access')).toBeVisible();
    await expectNoViolations(page);
    await page.goto('/rw/checkout');
    await expect(page.getByRole('status').filter({ hasText: 'You already have Full Access' })).toBeVisible();
    await expectNoViolations(page);
    await cleanUser(userId);
  });

  test('axe: multiple-select question, practice runner (question, feedback, summary)', async ({ page }, info) => {
    await startFreeExam(page);
    if (isPhone(info)) {
      await page.getByRole('button', { name: /^All questions/ }).click();
      await page.getByRole('dialog').getByRole('button', { name: /^Question 7,/ }).click();
    } else {
      await page.getByRole('button', { name: /^Question 7,/ }).click();
    }
    await page.getByRole('checkbox').first().click();
    await expectNoViolations(page);

    await signUpViaApi(page, 'Aline Uwase');
    const userId = (await me(page)).id;
    const id = await completeViaApi(page.request, FREE_SLUG, 'AAAAAAAAAAAAAAAAAAAA');
    await page.goto(`/rw/results/${id}`);
    await page.getByRole('button', { name: 'Practice Weak Areas' }).click();
    await expect(page.getByText('Untimed')).toBeVisible();
    await expectNoViolations(page);
    const multi = (await page.getByRole('checkbox').count()) > 0;
    if (multi) await page.getByRole('checkbox').first().click();
    else await page.getByRole('group', { name: /Answer options/ }).getByRole('button').first().click();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await expect(page.getByRole('button', { name: 'Next question' })).toBeVisible();
    await expectNoViolations(page);
    await page.getByRole('button', { name: 'End practice' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Practice finished' })).toBeVisible();
    await expectNoViolations(page);
    await page.goto(`/rw/review/${id}?q=7`);
    await expect(page.locator('#rq7')).toBeVisible();
    await expectNoViolations(page);
    void API;
    await cleanUser(userId);
  });
});
