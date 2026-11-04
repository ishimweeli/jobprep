import { expect, test } from '@playwright/test';
import { ADMINS, BASE, adminApi, expectNoHorizontalScroll, isPhone, signInAs, watchErrors } from './admin-helpers';

test.use({ baseURL: BASE });

test.describe('Settings', () => {
  test('stuck minutes and the two switches save and read back; nothing is left changed', async ({ page, playwright }, info) => {
    const w = watchErrors(page);
    const api = await adminApi(playwright);
    const before = await (await api.get('/api/admin/settings')).json();
    try {
      await signInAs(page, playwright, 'system');
      await page.goto('/admin/settings');
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
    await page.goto('/admin/settings');
    const box = page.getByLabel(isPhone(info) ? 'Free samples without an account' : 'Free sample tests open without an account');
    await expect(box).toBeChecked();
    await expect(box).toHaveAttribute('aria-disabled', 'true');
    await box.dispatchEvent('click');
    await expect(box).toBeChecked();
  });

  test('plan card shows the live price and days; "Change price…", Invite and the team buttons open their dialogs', async ({ page, playwright }, info) => {
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/settings');
    await expect(page.getByRole('heading', { name: 'Full Access plan · Rwanda' })).toBeVisible();
    await expect(page.getByLabel('Price (RWF)')).toHaveValue('2000');
    await expect(page.getByLabel(isPhone(info) ? 'Days' : 'Access length (days)')).toHaveValue('30');
    // formerly "Save plan" (inert): the price changes through a dialog that asks for a reason (A14)
    await page.getByRole('button', { name: 'Change price…' }).click();
    const price = page.getByRole('dialog', { name: /Set the Full Access price in Rwanda/ });
    await expect(price.getByText(/never shortened/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Payment providers' })).toBeVisible();
    await expect(page.getByText('MTN MoMo').first()).toBeVisible();
    await expect(page.getByText('Airtel Money').first()).toBeVisible();
    await expect(page.getByText('callbacks healthy')).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Admin team' })).toBeVisible();
    for (const name of ['Jean Bosco N.', 'Marie C.', 'Support Agent']) await expect(page.getByText(name).first()).toBeVisible();
    const invite = page.getByRole('button', { name: isPhone(info) ? 'Invite admin' : 'Invite' });
    await invite.click();
    await expect(page.getByRole('dialog', { name: 'Invite an admin' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    {
      // each team row carries the admin's email address
      for (const email of Object.values(ADMINS)) await expect(page.getByText(email, { exact: true })).toBeVisible();
      // the closed role selects are gone: each role has Change / Deactivate buttons (A13)
      await expect(page.getByRole('combobox', { name: 'Role for Marie C.' })).toHaveCount(0);
    }
    await page.getByRole('button', { name: /^Change Content editor role of Marie C./ }).click();
    const edit = page.getByRole('dialog', { name: /Change role of Marie C./ });
    await expect(edit.getByRole('radio', { name: /Content editor/ })).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
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
      await page.goto('/admin/settings');
      if (isPhone(info)) {
        await page.getByRole('link', { name: 'Audit log' }).click();
        await expect(page).toHaveURL(`${BASE}/admin/settings/audit`);
      }
      await expect(page.getByRole('heading', { name: 'Audit log' }).first()).toBeVisible();
      await expect(page.getByText(`changed the setting stuckAfterMinutes from ${stamp} to ${before.stuckAfterMinutes}`).first()).toBeVisible();
      await expect(page.locator('strong, td').filter({ hasText: 'Jean Bosco N.' }).first()).toBeVisible(); // not the filter's <option>
      await expect(page.getByText(/\d+ \w{3}, \d{2}:\d{2}/).first()).toBeVisible();
      await expectNoHorizontalScroll(page);
    } finally {
      await api.dispose();
    }
  });

  test('"Countries" leads to the Countries screen; Support and the editor are told they have no access to Settings', async ({ page, playwright }, info) => {
    await signInAs(page, playwright, 'system');
    await page.goto('/admin/settings');
    await page.getByRole('link', { name: /^Countries/ }).first().click();
    await expect(page).toHaveURL(`${BASE}/admin/countries`);
    for (const role of ['support', 'editor'] as const) {
      await signInAs(page, playwright, role);
      await page.goto('/admin/settings');
      await expect(page).toHaveURL(`${BASE}/admin/settings`);
      await expect(page.getByRole('heading', { level: 1, name: 'You do not have access to this' })).toBeVisible();
    }
    void info;
  });
});
