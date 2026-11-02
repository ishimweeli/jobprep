import { ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PhoneBackHeader } from '../../components/layout/Header';
import { formatPhone } from '../../lib/phone';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { useSession } from '../auth/session';
import { ChangeCountrySheet } from './ChangeCountrySheet';

/**
 * Account settings (ChangeCountryPhone.dc): name, phone, exam country. Only the phone artboard exists; on desktop
 * the same layout sits in a centred column (the account menu links here). No profile editing is drawn.
 * Tapping the exam country row opens the country picker; choosing a live country opens "Switch to X?" here.
 */
export function AccountPage() {
  useDocumentTitle('Account');
  const { session, user } = useSession();
  const [params, setParams] = useSearchParams();
  const switchTo = params.get('switch');
  if (!user || !session) return null;

  const row = 'flex justify-between border-b border-soft py-3.5';
  return (
    <div className="mx-auto w-full max-w-[480px]">
      <PhoneBackHeader to="/account" label="Back" title="Account" />
      <main id="main-content" tabIndex={-1} className="flex flex-col gap-2.5 p-4 md:py-8">
        <dl className="m-0 rounded-[14px] border border-border bg-surface px-4 py-1">
          <div className={row}>
            <dt className="text-muted">Name</dt>
            <dd className="m-0 font-bold">{user.name}</dd>
          </div>
          <div className={row}>
            <dt className="text-muted">Phone</dt>
            <dd className="m-0 font-bold tabular">{formatPhone(user.phone)}</dd>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <dt className="text-muted">Exam country</dt>
            <dd className="m-0">
              <Link
                to="/choose-country"
                aria-label={`Exam country: ${session.country.name}. Change`}
                className="inline-flex min-h-[44px] items-center gap-1.5 font-bold text-ink no-underline hover:text-ink"
              >
                <span className="rounded bg-ink px-1 text-[11px] text-white">{session.country.code}</span>
                {session.country.name}
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            </dd>
          </div>
        </dl>
      </main>
      {switchTo && <ChangeCountrySheet open onClose={() => setParams({})} to={switchTo} />}
    </div>
  );
}
