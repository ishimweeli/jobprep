import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fillPayerNumber, isPhone, signUpViaApi } from './web-helpers';
import {
  ACCOUNTANT_SLUG, choose, simulatePayment, completeViaApi, FREE_SLUG, nextButton, questionHeading, startFreeExam, submitButton,
} from './web-exam-helpers';

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(' | ')})`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test.describe('Web: accessibility of the exam, results, review, dashboard and checkout', () => {
  test('axe: exam (question, submit dialog, and on phone the navigator sheet)', async ({ page }, info) => {
    await startFreeExam(page);
    await choose(page, 'B');
    await expectNoViolations(page);
    await submitButton(page, info).click();
    await expect(page.getByRole('dialog', { name: 'Submit your exam?' })).toBeVisible();
    await expectNoViolations(page);
    await page.keyboard.press('Escape');
    if (isPhone(info)) {
      await page.getByRole('button', { name: /^All questions/ }).click();
      await expect(page.getByRole('dialog', { name: 'Questions' })).toBeVisible();
      await expectNoViolations(page);
    }
  });

  test('axe: results and review (guest, free test)', async ({ page }, info) => {
    await startFreeExam(page);
    await choose(page, 'A');
    await nextButton(page, info).click();
    await choose(page, 'C');
    await submitButton(page, info).click();
    await page.getByRole('button', { name: 'Submit now' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectNoViolations(page);
    await page.getByRole('link', { name: 'Review Answers' }).click();
    await expect(page.getByRole('heading', { name: /^Question \d+$/ }).first()).toBeVisible();
    await expectNoViolations(page);
  });

  test('axe: case-based exam, dashboard and checkout (signed in with Full Access)', async ({ page }, info) => {
    await signUpViaApi(page);
    await page.goto('/rw/checkout');
    await expect(page.getByRole('button', { name: 'Pay RWF 2,000' })).toBeVisible();
    await expectNoViolations(page); // checkout form
    await fillPayerNumber(page);
    const created = page.waitForResponse((r) => r.url().endsWith('/api/payments') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Pay RWF 2,000' }).click();
    const payment = (await (await created).json()) as { id: string };
    await expect(page.getByRole('heading', { level: 1, name: 'Approve on your phone' })).toBeVisible();
    await expectNoViolations(page); // pending

    await simulatePayment(page.request, payment.id, 'success');
    await completeViaApi(page.request, FREE_SLUG, 'ABCDABCDABCDABCDABCD');
    await page.goto('/rw/progress');
    await expect(page.getByRole('heading', { level: 1, name: /^Muraho/ })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expectNoViolations(page);

    await page.goto(`/rw/tests/${ACCOUNTANT_SLUG}/start`);
    await expect(questionHeading(page)).toHaveText('Question 1 of 12');
    for (let i = 0; i < 7; i++) await nextButton(page, info).click();
    await expect(page.getByRole('heading', { level: 1, name: /^Question 8 of 12/ })).toBeVisible();
    await expectNoViolations(page);
    if (isPhone(info)) {
      await page.getByRole('button', { name: 'Case study' }).click();
      await expectNoViolations(page);
    }
  });

  test('axe: Time is up, payment confirmed and payment not completed', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto('/rw/checkout');
    await fillPayerNumber(page);
    const created = page.waitForResponse((r) => r.url().endsWith('/api/payments') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Pay RWF 2,000' }).click();
    const { id } = (await (await created).json()) as { id: string };
    await simulatePayment(page.request, id, 'decline');
    await expect(page.getByText('Payment declined')).toBeVisible({ timeout: 15_000 });
    await expectNoViolations(page);
    await page.getByRole('button', { name: 'Try again' }).click();
    const again = page.waitForResponse((r) => r.url().endsWith('/api/payments') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Pay RWF 2,000' }).click();
    const second = (await (await again).json()) as { id: string };
    await simulatePayment(page.request, second.id, 'success');
    await expect(page.getByRole('heading', { level: 1, name: 'Payment confirmed' })).toBeVisible({ timeout: 15_000 });
    await expectNoViolations(page);
  });
});
