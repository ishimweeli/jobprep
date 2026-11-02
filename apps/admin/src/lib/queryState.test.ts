import { describe, expect, it } from 'vitest';
import { examsSearch, pageCount, parseExamsQuery, parsePaymentsQuery, parseUsersQuery, paymentsSearch, usersSearch } from './queryState';

const sp = (s: string) => new URLSearchParams(s);

describe('users filters <-> query string', () => {
  it('reads search, filter and page, with defaults', () => {
    expect(parseUsersQuery(sp(''))).toEqual({ q: '', filter: 'all', page: 1 });
    expect(parseUsersQuery(sp('q=alice&filter=expired&page=3'))).toEqual({ q: 'alice', filter: 'expired', page: 3 });
  });
  it('ignores unknown filters and bad pages', () => {
    expect(parseUsersQuery(sp('filter=bogus&page=-2'))).toMatchObject({ filter: 'all', page: 1 });
    expect(parseUsersQuery(sp('page=abc')).page).toBe(1);
  });
  it('writes only what is not a default; changing a filter goes back to page 1', () => {
    const cur = parseUsersQuery(sp('q=al&page=4'));
    expect(usersSearch({ filter: 'active' }, cur)).toBe('?q=al&filter=active');
    expect(usersSearch({ page: 5 }, cur)).toBe('?q=al&page=5');
    expect(usersSearch({ q: '', filter: 'all' }, cur)).toBe('');
  });
  it('round-trips', () => {
    const q = { q: 'jean claude', filter: 'suspended' as const, page: 2 };
    expect(parseUsersQuery(sp(usersSearch(q, { q: '', filter: 'all', page: 1 }).slice(1)))).toEqual(q);
  });
});

describe('payments filters <-> query string', () => {
  it('reads the status chips', () => {
    expect(parsePaymentsQuery(sp('status=paid'))).toMatchObject({ status: 'paid', stuck: false });
    expect(parsePaymentsQuery(sp('status=nope')).status).toBe('all');
  });
  it('"stuck" (from Needs attention) is a pending filter and shows the Pending chip as chosen', () => {
    expect(parsePaymentsQuery(sp('stuck=true'))).toMatchObject({ status: 'pending', stuck: true });
  });
  it('writes stuck instead of status, and picking a chip clears stuck', () => {
    const cur = parsePaymentsQuery(sp('stuck=true'));
    expect(paymentsSearch({}, cur)).toBe('?stuck=true');
    expect(paymentsSearch({ status: 'failed', stuck: false }, cur)).toBe('?status=failed');
    expect(paymentsSearch({ status: 'all', stuck: false }, cur)).toBe('');
  });
  it('keeps provider and search from a link', () => {
    const cur = parsePaymentsQuery(sp('provider=MTN_MOMO&q=aline&page=2'));
    expect(cur).toMatchObject({ provider: 'MTN_MOMO', q: 'aline', page: 2 });
    expect(paymentsSearch({ page: 3 }, cur)).toBe('?provider=MTN_MOMO&q=aline&page=3');
  });
});

describe('exams filters and paging', () => {
  it('search and category', () => {
    const cur = parseExamsQuery(sp('q=math&category=teaching-positions'));
    expect(cur).toEqual({ q: 'math', category: 'teaching-positions' });
    expect(examsSearch({ category: '' }, cur)).toBe('?q=math');
  });
  it('page count', () => {
    expect(pageCount(4218, 25)).toBe(169);
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });
});
