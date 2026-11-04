import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { AdminDialog } from '../components/AdminDialog';
import { Btn } from '../components/ui';

/**
 * Unsaved-changes warning for the editors (A18). While `dirty`, leaving the page through a link, the browser's back
 * button or a closing tab asks first. Render `dialog` anywhere in the editor. After a save that navigates on its own
 * (a new question opens at its own address), wrap that navigation in `bypass(() => navigate(...))` so it is not asked.
 * Needs a data router (the app has one).
 */
export function useUnsavedChanges(dirty: boolean) {
  const skip = useRef(false);
  const blocker = useBlocker(() => dirty && !skip.current);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const bypass = useCallback((go: () => void) => {
    skip.current = true;
    go();
    // the navigation has been decided by the next tick; ask again for anything after it
    setTimeout(() => void (skip.current = false), 0);
  }, []);

  const dialog = (
    <AdminDialog open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title="Leave without saving?">
      <p className="m-0 mb-4 text-[15px] text-ink-2">You have changes that are not saved. If you leave now they are lost.</p>
      <div className="flex flex-col-reverse gap-2 min-[520px]:flex-row min-[520px]:justify-end">
        <Btn kind="danger" onClick={() => blocker.proceed?.()}>Leave without saving</Btn>
        <Btn kind="primary" onClick={() => blocker.reset?.()}>Keep editing</Btn>
      </div>
    </AdminDialog>
  );

  return { dialog, bypass };
}
