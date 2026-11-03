import type { Country, PrismaClient, User } from '@prisma/client';
import { z } from 'zod';
import { badRequest, conflict } from '../http/errors';

export type OnboardingStep = 'country' | 'category' | 'goal';

type SetupFields = Pick<User, 'countryConfirmedAt' | 'goalCategoryId' | 'level' | 'subject' | 'onboardedAt'>;

/**
 * Where the setup screens should send the person next:
 *  country  - they have not confirmed their exam country yet
 *  category - setup is not finished and there is no job goal (changing country clears the goal AND reopens setup)
 *  goal     - setup is not finished and level or subject is missing
 *  null     - nothing to ask. Accounts that existed before setup was built have onboardedAt set (migration), so they are
 *             never sent through it, even without a job goal.
 */
export function nextOnboardingStep(u: SetupFields): OnboardingStep | null {
  if (!u.countryConfirmedAt) return 'country';
  if (u.onboardedAt) return null;
  if (!u.goalCategoryId) return 'category';
  if (!u.level || !u.subject) return 'goal';
  return null;
}

export const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * The one place that changes a person's country (used by the setup screen and by "Switch my account to Kenya").
 * Grants, attempts and payments stay attached to their own country. The job goal belongs to the old country's
 * categories, so it is cleared with the level and subject, and setup is reopened (onboardedAt cleared) so the screens ask for
 * the new goal; the language resets to the new country's default.
 * Choosing the country the person is already in only confirms it.
 */
export function countryChangeData(user: Pick<User, 'countryCode'>, target: Country, at: Date) {
  const same = user.countryCode === target.code;
  return {
    countryConfirmedAt: at,
    ...(same ? {} : { countryCode: target.code, goalCategoryId: null, level: null, subject: null, onboardedAt: null, language: target.languages[0] ?? 'en' }),
  };
}

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, 'not a real date');

export const onboardingSchema = z.object({
  countryCode: z.string().length(2).transform((s) => s.toUpperCase()).optional(),
  goalCategoryId: z.string().min(1).nullable().optional(),
  level: z.string().trim().min(1).max(80).nullable().optional(),
  subject: z.string().trim().min(1).max(80).nullable().optional(),
  examDate: ymd.nullable().optional(),
  finish: z.boolean().optional(),
  skip: z.boolean().optional(),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

/** Apply a setup step (any subset of fields). Returns the updated user. */
export async function applyOnboarding(prisma: PrismaClient, user: User, body: OnboardingInput, at: Date): Promise<User> {
  const data: Record<string, unknown> = {};
  let countryCode = user.countryCode;

  if (body.countryCode !== undefined) {
    const target = await prisma.country.findUnique({ where: { code: body.countryCode } });
    if (!target || target.status !== 'LIVE') throw badRequest('country_not_available');
    Object.assign(data, countryChangeData(user, target, at));
    countryCode = target.code;
  }

  if (body.goalCategoryId !== undefined) {
    if (body.goalCategoryId !== null) {
      // The job goal must be one of the person's (possibly just changed) country's categories.
      const cat = await prisma.category.findFirst({ where: { id: body.goalCategoryId, countryCode } });
      if (!cat) throw badRequest('invalid_goal');
    }
    data.goalCategoryId = body.goalCategoryId;
  }
  if (!body.skip) {
    if (body.level !== undefined) data.level = body.level;
    if (body.subject !== undefined) data.subject = body.subject;
    if (body.examDate !== undefined) data.examDate = body.examDate === null ? null : new Date(`${body.examDate}T00:00:00Z`);
  }

  if (body.finish || body.skip) {
    const goal = 'goalCategoryId' in data ? data.goalCategoryId : user.goalCategoryId;
    const confirmed = 'countryConfirmedAt' in data ? data.countryConfirmedAt : user.countryConfirmedAt;
    if (!confirmed || !goal) throw conflict('onboarding_incomplete');
    data.onboardedAt = at;
  }

  if (Object.keys(data).length === 0) return user;
  return prisma.user.update({ where: { id: user.id }, data });
}
