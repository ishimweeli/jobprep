import { describe, expect, it } from 'vitest';
import { actionLabel, auditSearch, dateRangeProblem, dayEndIso, dayStartIso, detailRows, emptyAuditFilters, hasBeforeAfter, hasFilters, parseAuditQuery, toApiQuery } from './auditModel';

describe('audit filters in the query string', () => {
  it('round-trips and keeps defaults out of the URL', () => {
    const f = parseAuditQuery(new URLSearchParams('q=price&actor=u1&action=country.plan.set&country=rw&from=2026-10-01&to=2026-10-31&page=3'));
    expect(f).toEqual({ q: 'price', actor: 'u1', action: 'country.plan.set', entityType: '', country: 'RW', from: '2026-10-01', to: '2026-10-31', page: 3 });
    expect(auditSearch({}, emptyAuditFilters)).toBe('');
    expect(auditSearch({ page: 3 }, f)).toContain('page=3');
  });

  it('changing a filter goes back to page 1; bad dates and pages are ignored', () => {
    expect(auditSearch({ action: 'x.y' }, { ...emptyAuditFilters, page: 4 })).toBe('?action=x.y');
    const f = parseAuditQuery(new URLSearchParams('from=yesterday&page=0'));
    expect(f.from).toBe('');
    expect(f.page).toBe(1);
  });

  it('builds the API query with whole Kigali days and paging', () => {
    const q = toApiQuery({ ...emptyAuditFilters, from: '2026-10-01', to: '2026-10-02', actor: 'u1', page: 2 }, 25);
    expect(q).toMatchObject({ actorId: 'u1', page: 2, pageSize: 25, from: '2026-09-30T22:00:00.000Z', to: '2026-10-02T21:59:59.999Z' });
    expect(dayStartIso('2026-10-01')).toBe('2026-09-30T22:00:00.000Z');
    expect(dayEndIso('2026-10-01')).toBe('2026-10-01T21:59:59.999Z');
    expect(toApiQuery(emptyAuditFilters, 25, false)).not.toHaveProperty('page');
  });

  it('knows when filters are active and when the range is backwards', () => {
    expect(hasFilters(emptyAuditFilters)).toBe(false);
    expect(hasFilters({ ...emptyAuditFilters, q: 'a' })).toBe(true);
    expect(dateRangeProblem({ from: '2026-10-05', to: '2026-10-01' })).toMatch(/before the start/);
    expect(dateRangeProblem({ from: '2026-10-01', to: '2026-10-05' })).toBeNull();
  });
});

describe('entry details', () => {
  it('words an action and puts before and after first', () => {
    expect(actionLabel('mock_test.publish')).toBe('Mock test, publish');
    const m = { to: 'RWF 2,500', from: 'RWF 2,000', country: 'Rwanda', reason: null };
    expect(hasBeforeAfter(m)).toBe(true);
    expect(detailRows(m).map((r) => [r.label, r.value])).toEqual([['Before', 'RWF 2,000'], ['After', 'RWF 2,500'], ['Country', 'Rwanda'], ['Reason', 'not set']]);
    expect(hasBeforeAfter({ title: 'x' })).toBe(false);
    expect(detailRows(undefined)).toEqual([]);
  });
});
