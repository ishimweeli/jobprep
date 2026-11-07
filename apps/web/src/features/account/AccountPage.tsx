import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { countriesKeys, listCategories } from '../../api/countries';
import { meKeys, patchMe } from '../../api/me';
import type { MeResponse } from '../../api/types';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { PhoneBackHeader } from '../../components/layout/Header';
import { StrokeIcon } from '../../components/StrokeIcon';
import { cx } from '../../lib/cx';
import { authErrorMessage } from '../../lib/errorCopy';
import { formatDate, languageList } from '../../lib/format';
import { useOfferedLanguages } from '../../lib/i18n';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/session';
import { countryPath } from '../country/hooks';
import { LEGAL_URL, NEW_TAB } from '../legal/legalModel';
import { accessSummaryView, goalName, goalRowLine, tidyName, validateName } from './accountModel';
import { useSignOut } from './useSignOut';

const card = 'm-0 rounded-[14px] border border-border bg-surface px-4';
const row = 'flex min-h-[56px] flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-soft py-2.5 last:border-b-0';

/** A row that opens another screen: label on the left, value and a chevron on the right (44px or more high). */
function LinkRow({ to, label, value, aria }: { to: string; label: string; value?: ReactNode; aria?: string }) {
  return (
    <div className={row}>
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 min-w-0">
        <Link to={to} aria-label={aria} className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-ink no-underline hover:text-ink">
          {value}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </dd>
    </div>
  );
}

/**
 * Account settings (C14). The phone artboard (ChangeCountryPhone.dc) draws name, email and exam country; the rest is built
 * in the same card and row style without a design: edit the name (validated, with a "Saved." confirmation), language,
 * exam goal (opens Change goal), a My access summary, payment history, help, and Sign out. On desktop it is the same
 * layout in a centred column.
 */
export function AccountPage() {
  useDocumentTitle('Account');
  const { session, user } = useSession();
  if (!user || !session) return null;
  return <AccountView session={session} />;
}

function AccountView({ session }: { session: MeResponse }) {
  const { user, country } = session;
  const slug = country.code.toLowerCase();
  const signOut = useSignOut(countryPath(slug));
  const languages = useOfferedLanguages();
  const cats = useQuery({ queryKey: countriesKeys.categories(user.countryCode), queryFn: () => listCategories(user.countryCode), staleTime: 5 * 60_000 });
  const goal = goalName(user, cats.data);
  const access = accessSummaryView(session.access, country.name, (iso) => formatDate(iso, true));

  return (
    <div className="mx-auto w-full max-w-[480px] md:max-w-[560px]">
      <PhoneBackHeader to="/account" label="Back" title="Account" />
      <main id="main-content" tabIndex={-1} className="flex flex-col gap-3 p-4 outline-none md:py-8">
        <h1 className="m-0 hidden text-[28px] tracking-tight md:block">Account</h1>

        <dl className={card}>
          <NameRow name={user.name} />
          <div className={row}>
            <dt className="text-muted">Email</dt>
            <dd className="m-0 min-w-0 break-all text-right font-semibold">{user.email}</dd>
          </div>
          <LinkRow
            to="/account/country"
            label="Exam country"
            aria={`Exam country: ${country.name}. Change`}
            value={
              <>
                <span className="rounded border border-border bg-page px-1 text-[11px] text-muted">{country.code}</span>
                {country.name}
              </>
            }
          />
          <div className={row}>
            <dt className="text-muted" id="acc-language">
              Language
            </dt>
            <dd className="m-0">
              {languages.length > 1 ? <LanguageSwitcher variant="segmented" label="Language" /> : <span className="font-semibold">{languageList(languages)}</span>}
            </dd>
          </div>
          <LinkRow
            to="/account/goal"
            label="Exam goal"
            aria={goal ? `Exam goal: ${goal}. Change` : 'Exam goal: not chosen yet. Choose'}
            value={<span className={cx(!goal && 'text-muted')}>{goalRowLine(goal)}</span>}
          />
        </dl>

        <section aria-labelledby="acc-access" className={cx(card, 'flex flex-col gap-1 py-3.5')}>
          <div className="flex items-center justify-between gap-2">
            <h2 id="acc-access" className="m-0 text-[17px]">
              My access
            </h2>
            <span
              className={cx(
                'rounded-pill px-2.5 py-[3px] text-xs font-semibold',
                access.tone === 'active' ? 'bg-free-bg text-free' : access.tone === 'ending' ? 'bg-flagged-bg text-flagged-ink' : 'bg-soft text-ink-2',
              )}
            >
              {access.tone === 'none' ? 'Free' : access.tone === 'ending' ? 'Ending soon' : 'Active'}
            </span>
          </div>
          <p className="m-0 text-base font-semibold">{access.title}</p>
          <p className="m-0 text-[15px] leading-normal text-ink-2">{access.body}</p>
          <Link to={countryPath(slug, 'progress')} className="link self-start py-2.5 text-[15px] font-semibold">
            See My progress
          </Link>
        </section>

        <nav aria-label="More" className="rounded-[14px] border border-border bg-surface p-1">
          <MoreLink to="/account/payments" label="Payment history" />
          <MoreLink to="/help" label="Help and support" />
          <MoreLink to={LEGAL_URL.terms} label="Terms of use" />
          <MoreLink to={LEGAL_URL.privacy} label="Privacy policy" />
        </nav>

        <button
          type="button"
          onClick={() => void signOut.request()}
          disabled={signOut.busy}
          className="flex min-h-[48px] cursor-pointer items-center justify-center gap-2.5 rounded-[14px] border border-incorrect-line bg-surface text-base font-semibold text-incorrect"
        >
          <StrokeIcon name="signOut" />
          Sign out
        </button>
      </main>
      {signOut.dialog}
    </div>
  );
}

function MoreLink({ to, label }: { to: string; label: string }) {
  const cls = 'flex min-h-[48px] items-center justify-between rounded-[10px] px-3 text-[15px] font-semibold text-ink no-underline hover:bg-soft hover:text-ink md:min-h-[44px]';
  const body = (
    <>
      {label}
      <ChevronRight size={16} aria-hidden="true" className="text-muted" />
    </>
  );
  return to.startsWith('https://') ? (
    <a href={to} {...NEW_TAB} className={cls}>
      {body}
    </a>
  ) : (
    <Link to={to} className={cls}>
      {body}
    </Link>
  );
}

/** The name row: shows the name with an Edit button; editing swaps it for a field with Save and Cancel. */
function NameRow({ name }: { name: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const editBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const save = useMutation({
    mutationFn: (next: string) => patchMe({ name: next }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: meKeys.session });
      setEditing(false);
      setSaved(true);
      setTimeout(() => editBtn.current?.focus(), 0);
    },
    onError: (e) => setError(authErrorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateName(value);
    setError(problem);
    if (problem) return;
    const next = tidyName(value);
    if (next === name) {
      setEditing(false);
      return;
    }
    save.mutate(next);
  };
  const cancel = () => {
    setEditing(false);
    setError(null);
    setValue(name);
    setTimeout(() => editBtn.current?.focus(), 0);
  };

  if (editing) {
    return (
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-b border-soft py-3.5">
        <Field ref={input} label="Name" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="name" maxLength={80} error={error} />
        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="sm" loading={save.isPending}>
            Save
          </Button>
          <Button variant="neutral" size="sm" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }
  return (
    <div className={row}>
      <dt className="text-muted">Name</dt>
      <dd className="m-0 flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 break-words font-semibold">{name}</span>
        <button
          ref={editBtn}
          type="button"
          aria-label="Edit name"
          onClick={() => {
            setSaved(false);
            setValue(name);
            setEditing(true);
          }}
          className="min-h-[44px] cursor-pointer border-0 bg-transparent px-2 text-[15px] font-semibold text-brand"
        >
          Edit
        </button>
        <span role="status" className="text-[13px] font-semibold text-free">
          {saved ? 'Saved.' : ''}
        </span>
      </dd>
    </div>
  );
}
