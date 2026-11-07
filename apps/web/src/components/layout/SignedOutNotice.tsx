import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ACCOUNT_EXISTS_NOTICE } from '../../features/auth/authModel';
import { setNotice, useNotice } from '../../lib/notice';

const toast =
  'fixed left-1/2 top-[90px] z-[70] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3.5 rounded-[10px] bg-ink px-[18px] py-3.5 text-[15px] text-white shadow-[0_12px_32px_rgba(0,0,0,0.2)]';

/**
 * One-shot status toasts at the top of the page: "You’re signed out. Sign in again" (AccountMenu.dc, "Signed out"),
 * and "You already had a JobPrep account…" after Create an account → Google signed in to an existing account.
 */
export function SignedOutNotice() {
  const notice = useNotice();
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 12_000);
    return () => clearTimeout(id);
  }, [notice]);
  if (notice === 'account_exists') {
    return (
      <div role="status" className={toast}>
        <span>{ACCOUNT_EXISTS_NOTICE}</span>
        <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="cursor-pointer border-0 bg-transparent p-1 text-lg leading-none text-white">
          ×
        </button>
      </div>
    );
  }
  if (notice !== 'signed_out') return null;
  return (
    <div role="status" className={toast}>
      <span>
        You’re signed out.{' '}
        <Link to="/sign-in" onClick={() => setNotice(null)} className="font-semibold text-[#8DBBF3] underline hover:text-[#8DBBF3]">
          Sign in again
        </Link>
      </span>
    </div>
  );
}
