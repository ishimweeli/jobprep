import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Dialog } from '../../components/Dialog';
import { cx } from '../lib/cx';

/**
 * The admin's modal: the web app's `Dialog` (role=dialog, labelled by its title, focus trapped and returned, Esc and a
 * click outside close it, the page behind is inert) with the admin's sizes. A bottom sheet below 768px, a centred
 * card from there up. Not designed (A18): built from the candidate app's dialog.
 */
export function AdminDialog({
  open, onClose, title, children, wide, initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** 720px instead of 520px (previews, tables). */
  wide?: boolean;
  initialFocusRef?: RefObject<HTMLElement>;
}) {
  // Esc must work even after the focused button was disabled (a busy submit drops focus to the page): the dialog's own key
  // handler only hears keys while focus is inside it, so a document listener covers the rest. It does not hear what the
  // dialog already handled (that handler stops the event).
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      initialFocusRef={initialFocusRef}
      titleClassName="m-0 text-[19px] font-semibold tracking-tight text-ink"
      desktopPanelClassName={cx('md:rounded-[16px] md:p-6', wide ? 'md:max-w-[720px]' : 'md:max-w-[520px]')}
    >
      {children}
    </Dialog>
  );
}
