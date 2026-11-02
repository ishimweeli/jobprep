import { expect, test } from '@playwright/test';
import { BASE, adminApi, expectAccessible, expectNoHorizontalScroll, isPhone, signInAs } from './admin-helpers';

test.use({ baseURL: BASE });

/** axe (WCAG 2 A/AA) on every admin screen, at both sizes, plus focus visibility and touch targets. */
const SCREENS: { name: string; url: string; heading: RegExp | string; level?: 1 | 2 }[] = [
  { name: 'Overview', url: '/', heading: 'Overview' },
  { name: 'Users', url: '/users', heading: 'Users' },
  { name: 'Exams & questions', url: '/exams', heading: 'Exams & questions' },
  { name: 'Payments', url: '/payments', heading: 'Payments' },
  { name: 'Settings', url: '/settings', heading: 'Settings' },
  { name: 'Countries', url: '/countries', heading: 'Countries' },
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

test('axe: the user detail, the question editor (editable and read-only), the phone audit page', async ({ page, playwright }, info) => {
  const api = await adminApi(playwright);
  const users = await (await api.get('/api/admin/users', { params: { pageSize: 1 } })).json();
  const exams = await (await api.get('/api/admin/exams', { params: { q: 'Secondary Mathematics' } })).json();
  const maths = exams.results.find((r: { title: string }) => r.title.includes('S1–S3') && !r.title.includes('Free'));
  const detail = await (await api.get(`/api/admin/mock-tests/${maths.id}`)).json();
  const multi = detail.questions.find((q: { type: string }) => q.type === 'MULTIPLE_SELECT');
  await signInAs(page, playwright, 'system');

  await page.goto(`/users/${users.results[0].id}`);
  await expect(page.getByText('ACCESS', { exact: true })).toBeVisible();
  await expectAccessible(page, 'user detail');

  await page.goto(`/exams/${maths.id}/q/${detail.questions[0].id}`);
  await expect(page.getByLabel('Question', { exact: true })).toBeVisible();
  await expectAccessible(page, 'question editor');

  await page.goto(`/exams/${maths.id}/q/${multi.id}`);
  await expect(page.getByLabel('Question', { exact: true })).toBeVisible();
  await expectAccessible(page, 'question editor, read-only');

  if (isPhone(info)) {
    await page.goto('/settings/audit');
    await expect(page.getByRole('heading', { level: 2, name: 'Audit log' })).toBeVisible();
    await expectAccessible(page, 'audit log (phone)');
  }
  await api.dispose();
});

test('focus is visible (3px #A78BFA ring) and the main controls are at least 44px', async ({ page, playwright }, info) => {
  await signInAs(page, playwright, 'system');
  await page.goto('/users');
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
  const search = page.getByRole('searchbox', { name: /Search (by )?name or phone/ });
  await search.focus();
  const outline = await search.evaluate((el) => {
    const c = getComputedStyle(el);
    return { w: c.outlineWidth, color: c.outlineColor, style: c.outlineStyle };
  });
  expect(outline).toMatchObject({ w: '3px', style: 'solid', color: 'rgb(167, 139, 250)' });

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
  for (const url of ['/', '/users', '/exams', '/payments', '/settings', '/settings/audit', '/countries']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/^Loading/)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  }
});
