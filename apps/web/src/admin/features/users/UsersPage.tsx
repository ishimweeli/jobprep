import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getOverview, getUsers, keys } from '../../api/admin';
import type { UserFilter, UserRow } from '../../api/types';
import { AdminShell } from '../../components/AdminShell';
import { EmptyLine, ErrorBox, Skeleton } from '../../components/states';
import { Avatar, FilterChips, InertButton, Pager, Pill } from '../../components/ui';
import { ACCESS_TONE } from '../../lib/badges';
import { cx } from '../../lib/cx';
import { formatCount, formatLastActive, initials } from '../../lib/format';
import { pageCount, parseUsersQuery, usersSearch } from '../../lib/queryState';
import { useDebouncedSearch } from '../../lib/useDebouncedSearch';
import { useIsDesktop } from '../../lib/useMediaQuery';
import { UserDetailView } from './UserDetail';

const PAGE_SIZE = 25;

const chips = (phone: boolean): { value: UserFilter; label: string }[] => [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Full Access' },
  { value: 'free', label: phone ? 'Free' : 'Free only' },
  { value: 'expired', label: 'Expired' },
  { value: 'suspended', label: 'Suspended' },
];

/**
 * Users (AdminUsers.dc, AdminUsersPhone.dc, AdminUserPhone.dc). Search, filter and page live in the query string.
 * Desktop: the list with the chosen user's panel beside it. Phone: the list, and a page per user.
 */
export function UsersPage() {
  const isDesktop = useIsDesktop();
  const { id } = useParams();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const query = parseUsersQuery(sp);
  const search = usersSearch;

  const list = useQuery({
    queryKey: keys.users({ ...query }),
    queryFn: () => getUsers({ q: query.q || undefined, filter: query.filter, page: query.page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const totals = useQuery({ queryKey: keys.overview(), queryFn: () => getOverview(), staleTime: 60_000 });

  const setQuery = (next: Partial<typeof query>) => setSp(new URLSearchParams(search(next, query)), { replace: true });
  const [text, setText] = useDebouncedSearch(query.q, (q) => setQuery({ q }));

  // Phone: one user fills the page.
  if (!isDesktop && id) {
    return (
      <AdminShell title="User" back="/admin/users">
        <UserDetailView id={id} phone />
      </AdminShell>
    );
  }

  const rows = list.data?.results ?? [];
  const selected = id ?? rows[0]?.id;
  const total = list.data?.total ?? 0;
  const pages = pageCount(total, PAGE_SIZE);
  const now = new Date();
  const open = (u: UserRow) => navigate({ pathname: `/admin/users/${u.id}`, search: search({}, query).replace(/&?page=\d+/, '') });

  const searchInput = (phone: boolean) =>
    phone ? (
      <input
        type="search"
        aria-label="Search name or email"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search name or email"
        className="h-[46px] rounded-[12px] border border-input-border bg-white px-3.5 text-base text-ink"
      />
    ) : (
      <>
        <label htmlFor="au-q" className="sr-only">Search by name or email</label>
        <input
          id="au-q"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search name or email"
          className="h-11 max-w-[380px] flex-[1_1_280px] rounded-[10px] border border-input-border bg-white px-3.5 text-[15px] text-ink"
        />
      </>
    );

  const body = list.isPending ? (
    <Skeleton label="Loading users…" />
  ) : list.isError ? (
    <ErrorBox error={list.error} onRetry={() => void list.refetch()} />
  ) : null;

  if (!isDesktop) {
    return (
      <AdminShell
        title="Users"
        headerExtra={
          <>
            {searchInput(true)}
            <FilterChips label="Access status" items={chips(true)} value={query.filter} onPick={(f) => setQuery({ filter: f as UserFilter })} scroll />
          </>
        }
      >
        <span className="text-[13px] font-semibold text-muted" aria-live="polite">
          {query.filter === 'all' && !query.q ? `${formatCount(total)} users · showing latest` : `${formatCount(total)} matching`}
        </span>
        {body}
        {!body && rows.length === 0 && <p className="m-0 rounded-[14px] border border-dashed border-input-border bg-white p-6 text-center text-ink-2">No users match.</p>}
        {rows.map((u) => {
          const t = ACCESS_TONE[u.access.state];
          return (
            <Link key={u.id} to={`/admin/users/${u.id}`} className="flex items-center gap-3 rounded-[14px] border border-border bg-white px-3.5 py-3 text-ink no-underline hover:text-ink">
              <Avatar text={initials(u.name)} size={40} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold">{u.name}</span>
                <span className="break-all text-[13px] text-muted">{u.email} · {formatLastActive(u.lastActiveAt, now, { phone: true })}</span>
              </span>
              <Pill tone={t} className="px-2 py-[3px] !text-[11px]">{t.label}</Pill>
            </Link>
          );
        })}
        {pages > 1 && (
          <div className="flex items-center justify-between text-[13px] text-muted">
            <span>Page {query.page} of {formatCount(pages)}</span>
            <Pager page={query.page} pages={pages} onPage={(p) => setQuery({ page: p })} />
          </div>
        )}
      </AdminShell>
    );
  }

  const o = totals.data;
  return (
    <AdminShell title="Users">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-[28px] tracking-[-0.02em]">Users</h1>
          <span className="text-sm text-muted">{o ? `${formatCount(o.kpis.registeredUsers)} candidates · ${formatCount(o.kpis.fullAccessActive)} with Full Access` : ' '}</span>
        </div>
        <InertButton kind="secondary" sizeClass="h-11 rounded-[10px] px-4 text-[15px] font-semibold">Export CSV</InertButton>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {searchInput(false)}
        <FilterChips label="Access status" items={chips(false)} value={query.filter} onPick={(f) => setQuery({ filter: f as UserFilter })} />
      </div>

      <div className="flex flex-wrap items-start gap-[18px]">
        <section aria-label="User list" className="min-w-0 flex-[999_1_560px] overflow-hidden rounded-[16px] border border-border bg-white">
          {body ?? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-page text-left text-xs text-muted">
                      <th className="px-4 py-3 font-semibold">Candidate</th>
                      <th className="px-2 py-3 font-semibold">Goal</th>
                      <th className="px-2 py-3 font-semibold">Access</th>
                      <th className="px-2 py-3 text-right font-semibold">Tests</th>
                      <th className="px-4 py-3 text-right font-semibold">Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => {
                      const on = u.id === selected;
                      const t = ACCESS_TONE[u.access.state];
                      return (
                        <tr key={u.id} className={cx('border-t border-[#F4F4F5]', on ? 'bg-brand-softer' : 'bg-white')}>
                          <td className="px-4 py-2.5">
                            <button type="button" aria-pressed={on} onClick={() => open(u)} className="flex cursor-pointer items-center gap-2.5 border-0 bg-transparent py-1 text-left text-ink">
                              <Avatar text={initials(u.name)} size={34} />
                              <span className="flex flex-col">
                                <span className="font-semibold">{u.name}</span>
                                <span className="break-all text-xs text-muted">{u.email}</span>
                              </span>
                            </button>
                          </td>
                          <td className="px-2 py-2.5 text-ink-2">{u.goal ?? '—'}</td>
                          <td className="px-2 py-2.5"><Pill tone={t} className="px-[9px] py-[3px]">{t.label}</Pill></td>
                          <td className="px-2 py-2.5 text-right tabular">{u.testsTaken}</td>
                          <td className="px-4 py-2.5 text-right text-muted">{formatLastActive(u.lastActiveAt, now)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length === 0 && <EmptyLine>No users match this search.</EmptyLine>}
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-muted">
                <span>Showing {rows.length} of {formatCount(total)}</span>
                <span className="flex items-center gap-3">
                  <span>Page {query.page} of {formatCount(pages)}</span>
                  {pages > 1 && <Pager page={query.page} pages={pages} onPage={(p) => setQuery({ page: p })} />}
                </span>
              </div>
            </>
          )}
        </section>
        {selected ? <UserDetailView key={selected} id={selected} phone={false} /> : null}
      </div>
    </AdminShell>
  );
}
