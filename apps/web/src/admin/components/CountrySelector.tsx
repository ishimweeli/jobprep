import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { getCountries, keys } from '../api/admin';
import { useAdmin } from '../features/auth/session';
import { useAdminCountry } from '../lib/adminCountry';
import { cx } from '../lib/cx';
import { countryName } from '../lib/format';

const chip = 'flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg border border-border bg-white text-[11px] font-semibold text-muted';

/** "Rwanda live · Kenya preparing": every country with its status, in the words of the artboard. */
export function statusLine(countries: { code: string; status: string }[]): string {
  return countries.map((c) => `${countryName(c.code)} ${c.status.toLowerCase()}`).join(' · ');
}

/**
 * The "Country" selector at the top of the desktop sidebar (AdminOverview.dc and the other desktop admin screens).
 * The artboard draws only the closed button ("ALL · All countries · Rwanda live · Kenya preparing"); its menu is a plain
 * list of the countries the admin's scope allows, plus "All countries" for an admin who is not limited to one country.
 * The choice is the global country filter (`useAdminCountry`): it becomes the `country` query parameter of the lists.
 */
export function CountrySelector() {
  const admin = useAdmin();
  const { country, setCountry, options, canChooseAll } = useAdminCountry();
  const canCountries = admin.permissions.includes('countries:read');
  const countries = useQuery({ queryKey: keys.countries, queryFn: getCountries, enabled: canCountries, staleTime: 5 * 60_000 });
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Only countries that exist (the API already limits them to the admin's scope); before it answers, the scope itself.
  const known = countries.data?.countries.filter((c) => options.includes(c.code));
  const codes = known ? known.map((c) => c.code) : options;
  const statusOf = (code: string) => countries.data?.countries.find((c) => c.code === code)?.status;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const all = !country;
  const faceChip = country ?? 'ALL';
  const faceName = country ? countryName(country) : 'All countries';
  const faceSub = country ? (statusOf(country)?.toLowerCase() ?? '') : known ? statusLine(known) : codes.map(countryName).join(' · ');

  const pick = (code: string) => {
    setCountry(code);
    setOpen(false);
    root.current?.querySelector('button')?.focus();
  };

  return (
    <div ref={root} className="relative flex flex-col gap-1.5">
      <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Country</span>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-border bg-page px-3 py-2.5 text-left text-ink"
      >
        <span className="sr-only">Country filter: </span>
        <span className={chip}>{faceChip}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold">{faceName}</span>
          {faceSub && <span className="text-xs text-muted">{faceSub}</span>}
        </span>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none text-muted">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Country" className="absolute left-0 right-0 top-full z-30 mt-1 flex flex-col gap-0.5 rounded-[10px] border border-border bg-white p-1.5 shadow-search">
          {canChooseAll && <Item label="All countries" chip="ALL" sub="" checked={all} onPick={() => pick('')} />}
          {codes.map((c) => (
            <Item key={c} label={countryName(c)} chip={c} sub={statusOf(c)?.toLowerCase() ?? ''} checked={country === c} onPick={() => pick(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Item({ label, chip: code, sub, checked, onPick }: { label: string; chip: string; sub: string; checked: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      onClick={onPick}
      className={cx('flex min-h-[44px] w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-0 px-2.5 py-1.5 text-left text-ink', checked ? 'bg-brand-soft' : 'bg-transparent hover:bg-page')}
    >
      <span className={chip}>{code}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cx('text-sm', checked ? 'font-semibold text-brand' : 'font-semibold')}>{label}</span>
        {sub && <span className="text-xs text-muted">{sub}</span>}
      </span>
    </button>
  );
}
