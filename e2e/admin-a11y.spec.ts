import { expect, test } from '@playwright/test';
import { BASE, adminApi, expectAccessible, expectNoHorizontalScroll, isPhone, signInAs } from './admin-helpers';

test.use({ baseURL: BASE });

/** axe (WCAG 2 A/AA) on every admin screen, at both sizes, plus focus visibility and touch targets. */
const SCREENS: { name: string; url: string; heading: RegExp | string; level?: 1 | 2 }[] = [
  { name: 'Overview', url: '/admin', heading: 'Overview' },
  { name: 'Users', url: '/admin/users', heading: 'Users' },
  { name: 'Exams & questions', url: '/admin/exams', heading: 'Exams & questions' },
  { name: 'Payments', url: '/admin/payments', heading: 'Payments' },
  { name: 'Settings', url: '/admin/settings', heading: 'Settings' },
  { name: 'Countries', url: '/admin/countries', heading: 'Countries' },
];

for (const s of SCREENS) {
  test(`axe: ${s.name}`, async ({ page, playwright }, info) => {
    await signInAs(page, playwright, 'system');
    await page.goto(s.url);
    // the phone header's h1 is the short name ("Exams")
    const name = isPhone(info) && s.name === 'Exams & questions' ? 'Exams' : s.heading;
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText(/^Loading/)).toHaveCount(0);
    await expectAccessible(page, s.name);
    await expectNoHorizontalScroll(page);
  });
}

test('axe: the user detail, the question editor (single and multiple-select), the audit log', async ({ page, playwright }, info) => {
  const api = await adminApi(playwright);
  const users = await (await api.get('/api/admin/users', { params: { pageSize: 1 } })).json();
  const exams = await (await api.get('/api/admin/exams', { params: { q: 'Secondary Mathematics' } })).json();
  const maths = exams.results.find((r: { title: string }) => r.title.includes('S1–S3') && !r.title.includes('Free'));
  const detail = await (await api.get(`/api/admin/mock-tests/${maths.id}`)).json();
  const multi = detail.questions.find((q: { type: string }) => q.type === 'MULTIPLE_SELECT');
  await signInAs(page, playwright, 'system');

  await page.goto(`/admin/users/${users.results[0].id}`);
  await expect(page.getByText('ACCESS', { exact: true })).toBeVisible();
  await expectAccessible(page, 'user detail');

  await page.goto(`/admin/exams/${maths.id}/q/${detail.questions[0].id}`);
  await expect(page.getByLabel('Question', { exact: true })).toBeVisible();
  await expectAccessible(page, 'question editor');

  await page.goto(`/admin/exams/${maths.id}/q/${multi.id}`);
  await expect(page.getByLabel('Question', { exact: true })).toBeVisible();
  await expectAccessible(page, 'question editor, multiple-select (editable since A10)');

  // the full audit log (A12) is on both sizes now
  await page.goto('/admin/settings/audit');
  await expect(page.getByRole('heading', { name: 'Audit log' }).first()).toBeVisible();
  await expectAccessible(page, 'audit log');
  await api.dispose();
});

test('focus is visible (3px #6AA6EE ring) and the main controls are at least 44px', async ({ page, playwright }, info) => {
  await signInAs(page, playwright, 'system');
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
  const search = page.getByRole('searchbox', { name: /Search (by )?name or email/ });
  await search.focus();
  const outline = await search.evaluate((el) => {
    const c = getComputedStyle(el);
    return { w: c.outlineWidth, color: c.outlineColor, style: c.outlineStyle };
  });
  expect(outline).toMatchObject({ w: '3px', style: 'solid', color: 'rgb(106, 166, 238)' });

  const nav = page.getByRole('navigation', { name: 'Admin', exact: true }).getByRole('link');
  for (const link of await nav.all()) {
    const box = (await link.boundingBox())!;
    expect(box.height, 'nav item height').toBeGreaterThanOrEqual(isPhone(info) ? 44 : 40);
  }
  const chips = page.getByRole('group', { name: 'Access status' }).getByRole('button');
  for (const chip of await chips.all()) expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(40);
});

test('360px wide: no page scrolls sideways (wide tables scroll inside their own box)', async ({ page, playwright }, info) => {
  test.skip(!isPhone(info), 'phone widths only');
  await page.setViewportSize({ width: 360, height: 800 });
  await signInAs(page, playwright, 'system');
  for (const url of ['/', '/admin/users', '/admin/exams', '/admin/payments', '/admin/settings', '/admin/settings/audit', '/admin/countries']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/^Loading/)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  }
});
