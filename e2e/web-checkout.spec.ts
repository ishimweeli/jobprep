import { expect, test, type Page } from '@playwright/test';
import { API, fillPayerNumber, isPhone, randomEmail, randomNational, readOtp, signUpViaApi, watchErrors } from './web-helpers';
import {
  ACCOUNTANT_SLUG, choose, expectSaved, nextButton, questionHeading, simulatePayment, submitButton,
} from './web-exam-helpers';

/** Sign up through the real screens (country, email, code, goal). Returns the account's email. */
async function signUpThroughUi(page: Page, name = 'Aline Uwase') {
  const email = randomEmail('flowb');
  await page.goto('/sign-up');
  await page.getByRole('button', { name: 'Continue with Rwanda' }).click();
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Enter the code' })).toBeVisible();
  const code = await readOtp(page.request, email);
  await page.getByLabel('Digit 1').click();
  await page.keyboard.type(code);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'What are you preparing for?' })).toBeVisible();
  await page.getByText('Accounting & finance', { exact: true }).click();
  await page.getByRole('button', { name: 'Finish and see my Rwanda tests' }).click();
  await expect(page).toHaveURL(/\/rw\/tests\?category=accounting-finance$/);
  return { email, name };
}

const payButton = (page: Page) => page.getByRole('button', { name: 'Pay RWF 2,000' });

/** Press Pay and return the id of the payment the API created. */
async function pay(page: Page) {
  const created = page.waitForResponse((r) => r.url().endsWith('/api/payments') && r.request().method() === 'POST');
  await payButton(page).click();
  const res = await created;
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test.describe('Web: Flow B — sign up, find a paid test, pay with MTN MoMo, take the case-based exam', () => {
  test('sign up -> search Accountant -> paid details -> Get Full Access -> MTN MoMo -> pending -> confirmed -> Start -> case exam -> results', async ({ page }, info) => {
    test.setTimeout(120_000);
    const w = watchErrors(page);
    const account = await signUpThroughUi(page);

    // search "Accountant" in the catalog, open the paid test
    await page.getByRole('searchbox').filter({ visible: true }).fill('Accountant');
    const card = page.getByRole('link', { name: 'View test: Accountant (Public Institution) — Mock 1' });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Accountant (Public Institution) — Mock 1' })).toBeVisible();

    // Get Full Access -> checkout (the test is remembered)
    // the user is signed in: the buy button is a link to the checkout (guests get the dialog instead)
    await page.getByRole('link', { name: isPhone(info) ? 'Unlock with Mobile Money' : 'Get Full Access · RWF 2,000' }).or(page.getByRole('button', { name: isPhone(info) ? 'Unlock with Mobile Money' : 'Get Full Access · RWF 2,000' })).click();
    await expect(page).toHaveURL(new RegExp(`/rw/checkout\\?test=${ACCOUNTANT_SLUG}$`));
    // desktop draws the heading "Get Full Access" above the form (CheckoutStates.dc); the phone has it in the top bar
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(isPhone(info) ? 0 : 1);
    const summary = page.getByRole('region', { name: 'Order summary' });
    await expect(summary).toContainText('JobPrep Full Access');
    await expect(summary).toContainText('Every mock test, every category · 30 days');
    await expect(summary).toContainText('RWF 2,000');
    await expect(summary).toContainText('Access starts once payment is confirmed · until');
    const providers = page.getByRole('group', { name: 'Pay with' });
    await expect(providers.getByRole('button')).toHaveCount(2);
    await expect(providers.getByRole('button', { name: /MTN MoMo/ })).toHaveAttribute('aria-pressed', 'true');
    await providers.getByRole('button', { name: /MTN MoMo/ }).click();
    const number = page.getByLabel('Mobile Money number');
    await expect(number).toHaveValue(''); // an account has no phone number: nothing to prefill on a first payment
    await fillPayerNumber(page, randomNational()); // the payer types the Mobile Money number
    await expect(page.getByText('We never ask for your PIN.')).toBeVisible();
    await expect(page.locator('input[type=password], input[name*=pin i]')).toHaveCount(0);

    // Pay -> "Approve on your phone"
    const id = await pay(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Approve on your phone' })).toBeVisible();
    await expect(page.getByText(/A MTN MoMo prompt for/)).toContainText('RWF 2,000');
    await expect(page.getByText('Waiting for confirmation…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use a different number' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send again' })).toBeVisible();

    // the operator approves (fake provider): the screen polls and turns into "Payment confirmed"
    expect((await simulatePayment(page.request, id, 'success')).ok()).toBeTruthy();
    await expect(page.getByRole('heading', { level: 1, name: 'Payment confirmed' })).toBeVisible({ timeout: 15_000 });
    const rows = page.getByRole('definition').locator('xpath=..');
    await expect(page.getByText('Full Access is active. Every mock test on JobPrep is unlocked for 30 days.')).toBeVisible();
    await expect(rows.filter({ hasText: 'Package' })).toContainText('Full Access · 30 days');
    await expect(rows.filter({ hasText: 'Amount' })).toContainText('RWF 2,000');
    await expect(rows.filter({ hasText: 'Paid with' })).toContainText('MTN MoMo');
    await expect(rows.filter({ hasText: 'Access until' })).toContainText(/\d{1,2} \w{3} 20\d\d/);
    await expect(rows.filter({ hasText: 'Transaction ID' })).not.toContainText('undefined');
    await expect(page.getByText(`A receipt was sent to ${account.email}.`)).toBeVisible();

    // Start the test: the case-based Accountant mock
    await page.getByRole('link', { name: 'Start Mock 1 now' }).click();
    await expect(page).toHaveURL(/\/rw\/exam\/[a-z0-9]+$/);
    await expect(questionHeading(page)).toHaveText('Question 1 of 12');

    // answer 1..7 (standalone questions), then the five case questions
    for (let i = 1; i <= 7; i++) {
      await expect(questionHeading(page)).toHaveText(`Question ${i} of 12`);
      await choose(page, 'A');
      await nextButton(page, info).click();
    }
    await expect(page.getByRole('heading', { level: 1, name: /^Question 8 of 12/ })).toBeVisible();
    // the case study: desktop shows it beside the question, phone has the "Question | Case study" switch
    if (isPhone(info)) {
      const view = page.getByRole('group', { name: 'View' });
      await expect(view.getByRole('button', { name: 'Question' })).toHaveAttribute('aria-pressed', 'true');
      await page.getByRole('button', { name: /^Based on: Umucyo District Hospital case$/ }).click();
      await expect(view.getByRole('button', { name: 'Case study' })).toHaveAttribute('aria-pressed', 'true');
    }
    const caseRegion = page.getByRole('region', { name: 'Umucyo District Hospital, financial year 2025/26' });
    await expect(caseRegion).toBeVisible();
    await expect(caseRegion).toContainText(/Case study · (applies to )?questions 8–12/i);
    await expect(caseRegion.getByRole('table', { name: 'Cash summary (RWF)' })).toBeVisible();
    await expect(caseRegion.getByText('Transfers from central government')).toBeVisible();
    await expect(caseRegion.getByText('Additional information')).toBeVisible();
    if (isPhone(info)) {
      await page.getByRole('button', { name: 'Back to question 8' }).click();
      await expect(page.getByRole('button', { name: /^Based on:/ })).toBeVisible();
    } else {
      await expect(page.getByText(/^Case question 1 of 5/)).toBeVisible();
      await expect(page.getByRole('group', { name: 'Case questions' }).getByRole('button')).toHaveCount(5);
      await expect(page.getByRole('complementary', { name: 'Question navigator' })).toHaveCount(0); // the case layout has no navigator, as drawn
    }
    for (let i = 8; i <= 12; i++) {
      await expect(page.getByRole('heading', { level: 1, name: new RegExp(`^Question ${i} of 12`) })).toBeVisible();
      await choose(page, 'B');
      if (i < 12) await nextButton(page, info).click();
    }
    await expectSaved(page, info);

    // submit -> results
    await submitButton(page, info).click();
    const dialog = page.getByRole('dialog', { name: 'Submit your exam?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Submit now' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Your results' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Performance by topic' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Save my result' })).toHaveCount(0); // signed in: no banner
    w.expectClean();
  });

  for (const outcome of ['decline', 'timeout'] as const) {
    test(`${outcome === 'decline' ? 'declined' : 'expired'} payment shows "You were not charged" and offers Try again`, async ({ page }) => {
      const w = watchErrors(page);
      await signUpViaApi(page);
      await page.goto('/rw/checkout');
      await expect(payButton(page)).toBeVisible();
      await fillPayerNumber(page);
      const id = await pay(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Approve on your phone' })).toBeVisible();
      expect((await simulatePayment(page.request, id, outcome)).ok()).toBeTruthy();
      const card = page.getByRole('status').filter({ hasText: outcome === 'timeout' ? 'The request expired' : 'Payment declined' });
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card).toContainText('You were not charged.');
      await page.getByRole('button', { name: outcome === 'timeout' ? 'Send a new prompt' : 'Try again' }).click();
      if (outcome === 'timeout') await expect(page.getByRole('heading', { level: 1, name: 'Approve on your phone' })).toBeVisible();
      else await expect(payButton(page)).toBeVisible();
      w.expectClean();
    });
  }

  test('"Send again" and "Use a different number" re-send the request; a late approval after expiry still confirms', async ({ page }) => {
    test.setTimeout(60_000);
    await signUpViaApi(page);
    await page.goto('/rw/checkout');
    await fillPayerNumber(page);
    const first = await pay(page);

    // Send again: a new request for the same number
    const resent = page.waitForResponse((r) => /\/api\/payments\/[^/]+\/resend$/.test(r.url()));
    await page.getByRole('button', { name: 'Send again' }).click();
    const second = ((await (await resent).json()) as { id: string }).id;
    expect(second).not.toBe(first);
    await expect(page.getByRole('heading', { level: 1, name: 'Approve on your phone' })).toBeVisible();

    // Use a different number: back to the form, edit, pay -> resend with the new number
    await page.getByRole('button', { name: 'Use a different number' }).click();
    await expect(payButton(page)).toBeVisible();
    const other = `+250789${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
    await page.getByLabel('Mobile Money number').fill(`0${other.slice(4, 6)} ${other.slice(6, 9)} ${other.slice(9)}`);
    const resent2 = page.waitForResponse((r) => /\/api\/payments\/[^/]+\/resend$/.test(r.url()));
    await payButton(page).click();
    const view2 = (await (await resent2).json()) as { id: string; msisdn: string };
    expect(view2.msisdn).toBe(other);
    await expect(page.getByText(`0${other.slice(4, 6)} ${other.slice(6, 9)} ${other.slice(9)}`, { exact: false }).first()).toBeVisible();

    // the request times out: "You were not charged" ...
    expect((await simulatePayment(page.request, view2.id, 'timeout')).ok()).toBeTruthy();
    await expect(page.getByText('The request expired')).toBeVisible({ timeout: 15_000 });
    // ... then the payer approves late: the API honours it and the screen becomes "Payment confirmed"
    expect((await simulatePayment(page.request, view2.id, 'success')).ok()).toBeTruthy();
    await expect(page.getByRole('heading', { level: 1, name: 'Payment confirmed' })).toBeVisible({ timeout: 20_000 });
  });

  test('a bad phone number is refused on the form without calling the API', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto('/rw/checkout');
    let posted = false;
    page.on('request', (r) => {
      if (r.url().endsWith('/api/payments') && r.method() === 'POST') posted = true;
    });
    await page.getByLabel('Mobile Money number').fill('078 812');
    await payButton(page).click();
    await expect(page.getByText('Enter a 9-digit Rwanda number, like 788 123 456.')).toBeVisible();
    expect(posted).toBe(false);
  });

  test('a guest at checkout sees "This test is part of Full Access" (create account or sign in, then back to checkout)', async ({ page }) => {
    await page.goto('/rw/checkout?test=accountant-public-institution-mock-1');
    await expect(page).toHaveURL(/\/rw\/tests\/accountant-public-institution-mock-1\?gate=paid$/);
    await expect(page.getByRole('dialog', { name: 'This test is part of Full Access' })).toBeVisible();
    await page.getByRole('link', { name: 'Create account and continue' }).click();
    await expect(page).toHaveURL(/\/sign-up\?next=%2Frw%2Fcheckout%3Ftest%3Daccountant-public-institution-mock-1$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Which country is your exam in?' })).toBeVisible();
  });

  test('a paid test that is not unlocked leads a signed-in user to checkout, not to the exam', async ({ page }) => {
    await signUpViaApi(page);
    await page.goto(`/rw/tests/${ACCOUNTANT_SLUG}/start`);
    await expect(page).toHaveURL(new RegExp(`/rw/checkout\\?test=${ACCOUNTANT_SLUG}$`));
  });

  test('Kenya checkout reads as CheckoutKenyaPhone: M-Pesa, KES, no price shown when unset (country data mocked: Kenya is not live yet)', async ({ page }, info) => {
    await signUpViaApi(page);
    await page.route('**/api/countries', async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { countries: { code: string; status: string; selectable?: boolean }[] };
      await route.fulfill({ response: res, json: { countries: body.countries.map((c) => (c.code === 'KE' ? { ...c, status: 'LIVE', selectable: true } : c)) } });
    });
    await page.route('**/api/me', (route) => route.fulfill({ json: {
      user: { id: 'u', name: 'Wanjiru Kamau', email: 'wanjiru@example.test', countryCode: 'KE', goalCategoryId: null, language: 'en' },
      country: { code: 'KE', name: 'Kenya', currencyCode: 'KES', languages: ['en'] }, access: { current: null, expired: null, otherCountries: [] },
    } }));
    await page.route('**/api/me/checkout', (route) => route.fulfill({ json: {
      country: { code: 'KE', name: 'Kenya', dialCode: '+254', currencyCode: 'KES' },
      plan: { name: 'Full Access', priceMinor: null, priceLabel: null, durationDays: 30, paidOnce: true, checkoutAvailable: false },
      paymentMethods: [{ provider: 'MPESA', label: 'M-Pesa', hint: 'Safaricom numbers' }], prefillPhone: '+254712345678', currentAccess: null, newAccessEndsAt: null,
    } }));
    await page.goto('/ke/checkout');
    const summary = page.getByRole('region', { name: 'Order summary' });
    await expect(summary).toContainText('JobPrep Full Access · Kenya');
    await expect(summary).toContainText('Every Kenya mock test · 30 days');
    await expect(summary).not.toContainText('[PRICE]'); // no price in the data: nothing is shown instead of a placeholder
    await expect(summary).toContainText('Paid once. Nothing renews.');
    if (isPhone(info)) await expect(page.getByText('KE · KES')).toBeVisible(); // the top bar chip (the desktop heading has no chip)
    await expect(page.getByLabel('M-Pesa phone number')).toHaveValue('712 345 678');
    await expect(page.getByText('+254', { exact: true })).toBeVisible();
    await expect(page.getByText('An M-Pesa prompt will appear on this phone. Enter your PIN there — we never ask for it.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay', exact: true })).toBeDisabled(); // no price: no pay button
  });
});
