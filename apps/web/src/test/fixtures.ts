import type { MeResponse, PublicUser } from '../api/types';

/** A signed-in, fully set-up Rwanda candidate (what `GET /api/me` returns); override what a test cares about. */
export const testUser = (over: Partial<PublicUser> = {}): PublicUser => ({
  id: 'u1',
  name: 'Aline Uwase',
  email: 'aline@example.test',
  emailVerified: true,
  countryCode: 'RW',
  goalCategoryId: null,
  preferredExamId: null,
  level: null,
  subject: null,
  examDate: null,
  language: 'en',
  onboarding: { done: true, nextStep: null },
  ...over,
});

export const testSession = (over: Partial<PublicUser> = {}): MeResponse => ({
  user: testUser(over),
  country: { code: 'RW', name: 'Rwanda', currencyCode: 'RWF', languages: ['en', 'rw'] },
  access: { current: null, expired: null, otherCountries: [] },
  preferredJob: null,
});
