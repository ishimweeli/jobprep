import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

/**
 * "Time is up" (TimeUp.dc, phone). The desktop version is not designed (MISSING_DESIGNS C7): the same phone
 * layout is centred in a single column instead of inventing a new one.
 */
export function TimeUpScreen({ answered, total, resultsTo }: { answered: number; total: number; resultsTo: string }) {
  useDocumentTitle('Time is up');
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface md:bg-page">
      <main id="main-content" tabIndex={-1} className="flex w-full max-w-[390px] flex-col items-center gap-[18px] bg-surface px-6 py-8 text-center">
        <span className="inline-flex h-[88px] w-[88px] items-center justify-center rounded-full bg-soft text-ink">
          <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="#18181B" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2.5 M9 2h6" />
          </svg>
        </span>
        <h1 className="m-0 text-[28px] tracking-tight">Time is up</h1>
        <p className="m-0 text-[17px] leading-[1.55] text-ink-2">
          Your exam was submitted automatically with{' '}
          <strong className="text-ink">
            {answered} of {total}
          </strong>{' '}
          questions answered. Nothing you answered was lost.
        </p>
        <Link
          to={resultsTo}
          replace
          className="mt-2 w-full rounded-[14px] bg-brand p-4 text-center text-[17px] font-bold text-white no-underline hover:bg-brand-hover hover:text-white"
        >
          See my results
        </Link>
      </main>
    </div>
  );
}
