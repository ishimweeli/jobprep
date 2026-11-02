import { expect, test } from '@playwright/test';
import { attemptIdFromUrl, guestTokens, serverState, startFreeExam } from './web-exam-helpers';
import { isPhone } from './web-helpers';

// Offline and back online on desktop (TimeUpDesktop.dc). The 2-minute offline run lives in web-exam.spec.ts.
test.describe('Web: offline on desktop (C8)', () => {
  test('banner with "kept on this computer", dashed outlines for waiting answers, then "Back online" with the count', async ({ page, request, context }, info) => {
    test.skip(isPhone(info), 'desktop layout');
    await startFreeExam(page);
    const id = attemptIdFromUrl(page);
    const tokens = await guestTokens(page);
    await page.getByRole('button', { name: /^Question 1,/ }).click();
    await page.getByRole('group', { name: 'Answer options' }).getByRole('button').first().click(); // saved while online
    await expect.poll(async () => (await serverState(request, id, tokens)).counts.answered).toBe(1);

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const banner = page.getByRole('status').filter({ hasText: 'No connection.' });
    await expect(banner).toContainText('Keep answering — your answers are kept on this computer and will save when you reconnect. The timer keeps running.');
    await page.getByRole('button', { name: /^Question 2,/ }).click();
    await page.getByRole('group', { name: 'Answer options' }).getByRole('button').nth(1).click();
    await page.getByRole('button', { name: /^Question 3,/ }).click();
    await page.getByRole('group', { name: 'Answer options' }).getByRole('button').nth(2).click();
    await expect(page.locator('header [role=status]')).toHaveText('2 answers waiting to save', { useInnerText: true });
    // the navigator outlines what is waiting, and says so in words
    await expect(page.getByRole('button', { name: /^Question 2, answered, waiting to save/ })).toBeVisible();
    await expect(page.getByText('Answered, waiting to save (2)')).toBeVisible();
    // Submit exam is still drawn on desktop while offline
    await expect(page.getByRole('button', { name: 'Submit exam' })).toBeVisible();
    // nothing reached the server meanwhile
    expect((await serverState(request, id, tokens)).counts.answered).toBe(1);

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByRole('status').filter({ hasText: 'Back online.' })).toContainText('Your 2 waiting answers are saved.');
    await expect(page.locator('header [role=status]')).toHaveText('All answers saved', { useInnerText: true });
    await expect(page.getByText('Answered, waiting to save')).toHaveCount(0);
    await expect.poll(async () => (await serverState(request, id, tokens)).counts.answered).toBe(3);
  });

  test('phone keeps its own wording and has no "Back online" banner', async ({ page, context }, info) => {
    test.skip(!isPhone(info), 'phone layout');
    await startFreeExam(page);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByRole('status').filter({ hasText: 'No connection.' })).toContainText('your answers are kept on this phone and will save when you are back online.');
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByText('Back online.')).toHaveCount(0);
  });
});
