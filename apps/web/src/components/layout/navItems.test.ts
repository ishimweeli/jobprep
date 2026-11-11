import { describe, expect, it } from 'vitest';
import { LICENSING_CATEGORY, primaryNav } from './navItems';

const active = (pathname: string, search = '') =>
  primaryNav('rw', { interviewPrep: true }).filter((i) => i.isActive(pathname, search)).map((i) => i.label);

describe('primaryNav', () => {
  it('lists Licensing exams right after Mock tests, linking to the licensing category', () => {
    const items = primaryNav('rw', {});
    const i = items.findIndex((x) => x.label === 'Licensing exams');
    expect(items[i - 1]!.label).toBe('Mock tests');
    expect(items[i]!.to).toBe(`/rw/tests?category=${LICENSING_CATEGORY}`);
  });

  it('marks only Licensing exams as current on the licensing category, and only Mock tests elsewhere under /tests', () => {
    expect(active('/rw/tests', `?category=${LICENSING_CATEGORY}`)).toEqual(['Licensing exams']);
    expect(active('/rw/tests')).toEqual(['Mock tests']);
    expect(active('/rw/tests', '?category=procurement')).toEqual(['Mock tests']);
    expect(active('/rw/tests/jobs/rw-accountant')).toEqual(['Mock tests']);
  });

  it('keeps the other items working and hides Interview prep when it is off', () => {
    expect(active('/rw/progress')).toEqual(['Dashboard']);
    expect(active('/account/settings')).toEqual(['Account']);
    expect(primaryNav('rw', {}).some((i) => i.label === 'Interview prep')).toBe(false);
  });
});
