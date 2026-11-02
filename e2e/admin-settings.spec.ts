import { expect, test } from '@playwright/test';
import { BASE, adminApi, expectNoHorizontalScroll, isPhone, signInAs, watchErrors } from './admin-helpers';

test.use({ baseURL: BASE });

test.describe('Settings', () => {
  test('stuck minutes and the two switches save and read back; nothing is left changed', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    const api = await adminApi(playwright);
    const before = await (await api.get('/api/admin/settings')).json();
    try {
      await signInAs(page, playwright, 'system');
      await page.goto('/settings');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

      const stuck = page.getByLabel('Mark a pending payment as stuck after (minutes)');
      const next = before.stuckAfterMinutes === 7 ? 8 : 7;
      await stuck.fill(String(next));
      await stuck.press('Enter');
      await expect.poll(async () => (await (await api.get('/api/admin/settings')).json()).stuckAfterMinutes).toBe(next);

      const explain = page.getByLabel(isPhone(info) ? 'Explanations on free results' : 'Show explanations on free sample results');
      const passMarks = page.getByLabel('Show pass marks (only where an official source is entered)');
      await explain.setChecked(!before.showExplanationsOnFreeResults);
      await passMarks.setChecked(!before.showPassMarks);
      await expect.poll(async () => {
        const s = await (await api.get('/api/admin/settings')).json();
        return [s.showExplanationsOnFreeResults, s.showPassMarks];
      }).toEqual([!before.showExplanationsOnFreeResults, !before.showPassMarks]);

      // read-back after a reload
      await page.reload();
      await expect(stuck).toHaveValue(String(next));
      await expect(explain).toBeChecked({ checked: !before.showExplanationsOnFreeResults });
      await expect(passMarks).toBeChecked({ checked: !before.showPassMarks });

      // a number the API would refuse is caught and put back
      await stuck.fill('999');
      await stuck.press('Enter');
      await expect(page.getByRole('alert')).toContainText('Enter a whole number from 1 to 240.');
      await expect(stuck).toHaveValue(String(next));
      await expectNoHorizontalScroll(page);
      w.expectClean();
    } finally {
      await api.put('/api/admin/settings', { data: { stuckAfterMinutes: before.stuckAfterMinutes, showExplanationsOnFreeResults: before.showExplanationsOnFreeResults, showPassMarks: before.showPassMarks } });
      const after = await (await api.get('/api/admin/settings')).json();
      expect(after).toMatchObject({ stuckAfterMinutes: before.stuckAfterMinutes, showExplanationsOnFreeResults: before.showExplanationsOnFreeResults, showPassMarks: before.showPassMarks });
      await api.dispose();
    }
  });

  test('"free samples without an account" is shown on and cannot be changed', async ({ page, playwright }, info) => {
    await signInAs(page, playwright, 'system');
    await page.goto('/settings');
    const box = page.getByLabel(isPhone(info) ? 'Free samples without an account' : 'Free sample tests open without an account');
    await expect(box).toBeChecked();
    await expect(box).toHaveAttribute('aria-disabled', 'true');
    await box.dispatchEvent('click');
    await expect(box).toBeChecked();
  });

  test('plan card shows the live price and days; Save plan, Invite and the role selects are drawn and do nothing', async ({ page, playwright }, info) => {
    await signInAs(page, playwright, 'system');
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Full Access plan · Rwanda' })).toBeVisible();
    await expect(page.getByLabel('Price (RWF)')).toHaveValue('2000');
    await expect(page.getByLabel(isPhone(info) ? 'Days' : 'Access length (days)')).toHaveValue('30');
    const save = page.getByRole('button', { name: 'Save plan' });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await save.dispatchEvent('click');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Payment providers' })).toBeVisible();
    await expect(page.getByText('MTN MoMo').first()).toBeVisible();
    await expect(page.getByText('Airtel Money').first()).toBeVisible();
    await expect(page.getByText('callbacks healthy')).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Admin team' })).toBeVisible();
    for (const name of ['Jean Bosco N.', 'Marie C.', 'Support Agent']) await expect(page.getByText(name).first()).toBeVisible();
    const invite = page.getByRole('button', { name: isPhone(info) ? 'Invite admin' : 'Invite' });
    await expect(invite).toHaveAttribute('aria-disabled', 'true');
    if (!isPhone(info)) {
      const role = page.getByRole('combobox', { name: 'Role for Marie C.' });
      await expect(role).toHaveValue('CONTENT_EDITOR');
      await expect(role).toHaveAttribute('aria-disabled', 'true');
      await role.focus();
      await page.keyboard.press('ArrowDown');
      await expect(role).toHaveValue('CONTENT_EDITOR'); // nothing changed
    }
  });

  test('audit log: the server\'s sentences with who and when (desktop on the page, phone behind "Audit log")', async ({ page, playwright }, info) => {
    const api = await adminApi(playwright);
    const before = await (await api.get('/api/admin/settings')).json();
    // make one entry to look for
    const stamp = before.stuckAfterMinutes === 9 ? 11 : 9;
    await api.put('/api/admin/settings', { data: { stuckAfterMinutes: stamp } });
    await api.put('/api/admin/settings', { data: { stuckAfterMinutes: before.stuckAfterMinutes } });
    try {
      await signInAs(page, playwright, 'system');
      await page.goto('/settings');
      if (isPhone(info)) {
        await page.getByRole('link', { name: 'Audit log' }).click();
        await expect(page).toHaveURL(`${BASE}/settings/audit`);
      }
      await expect(page.getByRole('heading', { name: 'Audit log' }).first()).toBeVisible();
      await expect(page.getByText(`changed the setting stuckAfterMinutes from ${stamp} to ${before.stuckAfterMinutes}`).first()).toBeVisible();
      await expect(page.getByText('Jean Bosco N.').first()).toBeVisible();
      await expect(page.getByText(/\d+ \w{3}, \d{2}:\d{2}/).first()).toBeVisible();
      await expectNoHorizontalScroll(page);
    } finally {
      await api.dispose();
    }
  });

  test('"Countries" leads to the Countries screen; Support and the editor cannot open Settings', async ({ page, playwright }, info) => {
    await signInAs(page, playwright, 'system');
    await page.goto('/settings');
    await page.getByRole('link', { name: /^Countries/ }).first().click();
    await expect(page).toHaveURL(`${BASE}/countries`);
    for (const role of ['support', 'editor'] as const) {
      await signInAs(page, playwright, role);
      await page.goto('/settings');
      await expect(page).toHaveURL(`${BASE}/`);
    }
    void info;
  });
});
