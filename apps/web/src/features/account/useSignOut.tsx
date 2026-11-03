import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listInProgress } from '../../api/attempts';
import { signOut } from '../../api/auth';
import { meKeys } from '../../api/me';
import { Dialog } from '../../components/Dialog';
import { setNotice } from '../../lib/notice';
import { signOutPrompt } from './accountMenuModel';

/**
 * Sign out (AccountMenu.dc, NavPhone.dc). With a full mock test in progress it asks first, because the timer keeps
 * running; otherwise it signs out at once. Afterwards the user lands on the country home page with the notice
 * "You’re signed out. Sign in again".
 */
export function useSignOut(homePath: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<null | { title: string; clock: string }>(null);
  const [busy, setBusy] = useState(false);

  const perform = async () => {
    setBusy(true);
    try {
      await signOut();
    } catch {
      /* the cookie may already be gone: the result for the user is the same */
    }
    setConfirm(null);
    setBusy(false);
    qc.setQueryData(meKeys.session, null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'countries' && q.queryKey[0] !== 'me' });
    setNotice('signed_out');
    navigate(homePath, { replace: true });
  };

  const request = async () => {
    let attempts;
    try {
      attempts = await listInProgress();
    } catch {
      attempts = undefined;
    }
    const prompt = signOutPrompt(attempts);
    if (prompt) setConfirm(prompt);
    else await perform();
  };

  return {
    request,
    busy,
    dialog: <SignOutDialog open={!!confirm} prompt={confirm} busy={busy} onConfirm={() => void perform()} onClose={() => setConfirm(null)} />,
  };
}

export function SignOutDialog({
  open, prompt, busy, onConfirm, onClose,
}: { open: boolean; prompt: { title: string; clock: string } | null; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Sign out?"
      variant="responsive"
      titleClassName="m-0 text-[17px] font-semibold"
      desktopPanelClassName="md:max-w-[440px] md:rounded-[20px] md:p-[26px]"
      panelClassName="flex flex-col gap-3 !pt-[22px] !pb-6 md:gap-3.5"
    >
      <p className="m-0 hidden text-[15px] leading-[1.55] text-ink-2 md:block">
        You have a mock test in progress ({prompt?.title}, {prompt?.clock} left). Your answers are saved, but the timer keeps running while you are signed out.
      </p>
      <p className="m-0 text-[15px] leading-normal text-ink-2 md:hidden">
        You have a mock test in progress. Your answers are saved, but the timer keeps running.
      </p>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        aria-busy={busy || undefined}
        className="min-h-[48px] cursor-pointer rounded-[10px] border-0 bg-brand text-base font-semibold text-white disabled:opacity-60 md:min-h-[44px]"
      >
        Sign out
      </button>
      <button type="button" onClick={onClose} className="min-h-[44px] cursor-pointer border-0 bg-transparent text-[15px] font-semibold text-ink-2">
        Stay signed in
      </button>
    </Dialog>
  );
}
