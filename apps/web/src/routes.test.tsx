import { matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from './routes';

const leaf = (path: string) => matchRoutes(routes, path)?.at(-1)?.route.path;

describe('route table', () => {
  it('every /admin path goes to the lazily loaded admin subtree, never to a country page', () => {
    for (const p of ['/admin', '/admin/', '/admin/users', '/admin/users/u1', '/admin/exams/t1/q/q1', '/admin/settings/audit', '/admin/nothing']) {
      expect(leaf(p), p).toBe('/admin/*');
    }
  });

  it('candidate paths are untouched', () => {
    expect(leaf('/rw/tests')).toBe('tests');
    expect(leaf('/sign-in')).toBe('/sign-in');
    expect(leaf('/account')).toBe('/account');
    expect(leaf('/rw/exam/a1')).toBe('/:country/exam/:attemptId');
  });
});
