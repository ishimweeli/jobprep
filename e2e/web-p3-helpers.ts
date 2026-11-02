import { PrismaClient } from '@prisma/client';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { API, isPhone, readOtp } from './web-helpers';

/** Helpers for the Batch 1 specs (sign-in, account menu, access states, gates, practice). */

let client: PrismaClient | null = null;
export function prisma(): PrismaClient {
  client ??= new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL ?? 'postgresql://jobprep:jobprep@localhost:5433/jobprep?schema=public' } },
  });
  return client;
}

export const DAY = 86_400_000;

export interface MeInfo {
  id: string;
  name: string;
  phone: string;
}

/** The signed-in user of this page's cookie jar. */
export async function me(page: Page): Promise<MeInfo> {
  const res = await page.request.get(`${API}/api/me`);
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { user: MeInfo }).user;
}

/** A grant of Full Access with the given start / end, in days from now (negative = past). Removed by `cleanUser`. */
export async function addGrant(userId: string, startDays: number, endDays: number) {
  const plan = await prisma().planConfig.findFirstOrThrow({ where: { countryCode: 'RW' } });
  return prisma().accessGrant.create({
    data: {
      userId, countryCode: 'RW', planId: plan.id, source: 'MANUAL', reason: 'e2e', status: 'ACTIVE',
      startsAt: new Date(Date.now() + startDays * DAY), endsAt: new Date(Date.now() + endDays * DAY),
    },
  });
}

/** Remove what a spec attached to its throwaway user (grants and payments), so the dev database stays tidy. */
export async function cleanUser(userId: string) {
  await prisma().accessGrant.deleteMany({ where: { userId } });
  await prisma().paymentEvent.deleteMany({ where: { payment: { userId } } }).catch(() => undefined);
  await prisma().payment.deleteMany({ where: { userId } }).catch(() => undefined);
}

/** Open the account menu (desktop) or go to the Account tab (phone). */
export async function openAccount(page: Page, info: TestInfo) {
  if (isPhone(info)) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Account' }).click();
    await expect(page).toHaveURL(/\/account$/);
  } else {
    await page.getByRole('button', { name: /account menu for/i }).click();
    await expect(page.getByRole('menu', { name: 'Account' })).toBeVisible();
  }
}

export const signOutControl = (page: Page, info: TestInfo) =>
  isPhone(info) ? page.getByRole('button', { name: 'Sign out' }) : page.getByRole('menuitem', { name: 'Sign out' });

/** Fill the phone step of /sign-in and move to the code step. */
export async function requestSignInCode(page: Page, national: string) {
  await page.getByLabel('Phone number').fill(national);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
}

export async function typeCode(page: Page, code: string) {
  await page.getByLabel('Digit 1').click();
  await page.keyboard.type(code);
}

export async function signInWithCode(page: Page, national: string) {
  await requestSignInCode(page, national);
  const code = await readOtp(page.request, `+250${national}`);
  await typeCode(page, code);
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
}

/** A running full attempt of the paid Accountant test for a user with access (used for "sign out with a test in progress"). */
export async function startRunningAttempt(page: Page, slug: string) {
  const r = await page.request.post(`${API}/api/countries/RW/mock-tests/${slug}/attempts`, { data: {} });
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as { attemptId: string }).attemptId;
}
