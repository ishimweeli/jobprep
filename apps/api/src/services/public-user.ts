import type { User } from '@prisma/client';
import { isoDate, nextOnboardingStep } from './onboarding';

/** `roles` = codes of the person's active role assignments ([] for a plain candidate). Never includes secrets. */
export function publicUser(u: User, roles: string[] = []) {
  const nextStep = nextOnboardingStep(u);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    countryCode: u.countryCode,
    goalCategoryId: u.goalCategoryId,
    preferredExamId: u.preferredExamId,
    level: u.level,
    subject: u.subject,
    examDate: isoDate(u.examDate),
    language: u.language,
    roles,
    onboarding: { done: nextStep === null, nextStep },
  };
}
