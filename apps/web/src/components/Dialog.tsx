import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Number of open dialogs: the app root is made inert while at least one is open. */
let openCount = 0;

function setBackgroundInert(inert: boolean) {
  const root = document.getElementById('root');
  if (!root) return;
  if (inert) root.setAttribute('inert', '');
  else root.removeAttribute('inert');
}

export function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
  );
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Visible heading; wired to aria-labelledby. */
  title: ReactNode;
  /** `sheet` = bottom sheet, `modal` = centred card, `responsive` = sheet below 768px, modal above. */
  variant?: 'sheet' | 'modal' | 'responsive';
  children: ReactNode;
  /** Element to focus when opened (defaults to the first focusable control). */
  initialFocusRef?: RefObject<HTMLElement>;
  hideTitle?: boolean;
  /** Extra classes for the panel (e.g. max width). */
  panelClassName?: string;
  /** Right-aligned content in the title row (e.g. a "Reset" button). */
  headerAction?: ReactNode;
  titleAs?: 'h1' | 'h2';
}

/**
 * Accessible modal / bottom sheet.
 * - role=dialog, aria-modal, labelled by its title
 * - focus moves in on open, is trapped on Tab / Shift+Tab, and returns to the opener on close
 * - Esc and a click on the backdrop close it; the background app is `inert` while open
 * - the key handler lives on the dialog itself: no document-level key traps
 */
export function Dialog({
  open,
  onClose,
  title,
  variant = 'responsive',
  children,
  initialFocusRef,
  hideTitle,
  panelClassName,
  headerAction,
  titleAs: Title = 'h2',
}: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openCount += 1;
    setBackgroundInert(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const target = initialFocusRef?.current ?? (panel ? focusableIn(panel)[0] : null) ?? panel;
    target?.focus();

    return () => {
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) setBackgroundInert(false);
      document.body.style.overflow = prevOverflow;
      const el = returnFocusRef.current;
      if (el && document.contains(el)) el.focus();
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = focusableIn(panel);
    if (items.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (!panel.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  const overlay = cx(
    'fixed inset-0 z-50 flex flex-col bg-ink/50',
    variant === 'sheet' && 'justify-end',
    variant === 'modal' && 'items-center justify-start px-4 pt-6 md:pt-[72px]',
    variant === 'responsive' && 'justify-end md:items-center md:justify-start md:px-4 md:pt-[72px]',
  );
  const panel = cx(
    'w-full overflow-y-auto bg-surface shadow-modal outline-none',
    variant === 'sheet' && 'max-h-[92dvh] rounded-t-sheet px-4 pb-6 pt-[18px]',
    variant === 'modal' && 'max-h-[90dvh] max-w-[640px] rounded-[22px] p-7',
    variant === 'responsive' &&
      'max-h-[92dvh] rounded-t-sheet px-4 pb-6 pt-[18px] md:max-h-[90dvh] md:max-w-[640px] md:rounded-[22px] md:p-7',
    panelClassName,
  );

  return createPortal(
    <div className={overlay} onKeyDown={onKeyDown} onMouseDown={(e) => e.target === e.currentTarget && onClose()} data-testid="dialog-overlay">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={panel}>
        <div className={cx('flex items-center justify-between gap-3', hideTitle ? 'sr-only' : 'mb-3')}>
          <Title id={titleId} className="m-0 text-[21px] font-bold tracking-tight md:text-[26px]">
            {title}
          </Title>
          {headerAction}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
