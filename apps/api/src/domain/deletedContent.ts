/**
 * Mock tests an admin deleted for good, as "RW:slug" in one setting. The content sync skips these, so a test that is
 * still in the seed files is not created again after it was deleted on purpose.
 */
export const DELETED_MOCK_TESTS_KEY = 'content.deletedMockTests';

export const deletedKey = (countryCode: string, slug: string) => `${countryCode}:${slug}`;

export function deletedSet(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
}
