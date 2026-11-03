import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { setNotice, useNotice } from '../../lib/notice';

/** "You’re signed out. Sign in again" (AccountMenu.dc, "Signed out"): a status toast at the top of the page. */
export function SignedOutNotice() {
  const notice = useNotice();
  useEffect(() => {
    if (notice !== 'signed_out') return;
    const id = setTimeout(() => setNotice(null), 12_000);
    return () => clearTimeout(id);
  }, [notice]);
  if (notice !== 'signed_out') return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 top-[90px] z-[70] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3.5 rounded-[10px] bg-ink px-[18px] py-3.5 text-[15px] text-white shadow-[0_12px_32px_rgba(0,0,0,0.2)]"
    >
      <span>
        You’re signed out.{' '}
        <Link to="/sign-in" onClick={() => setNotice(null)} className="font-semibold text-[#8DBBF3] underline hover:text-[#8DBBF3]">
          Sign in again
        </Link>
      </span>
    </div>
  );
}
