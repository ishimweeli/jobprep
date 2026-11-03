import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Tone } from '../lib/badges';
import { cx } from '../lib/cx';

/* The artboards' small parts, with their exact sizes and colours. Colours that come from data go in `style`. */

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="flex-none">
      <rect width="32" height="32" rx="9" fill="#164A7A" />
      <path d="M9 16.5l4.5 4.5L23 11" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The status pill (Paid, Free, Live ...): 12px semibold, pill radius, colours from the tone. */
export function Pill({ tone, className, children }: { tone: Pick<Tone, 'bg' | 'ink'>; className?: string; children: ReactNode }) {
  return (
    <span className={cx('inline-block whitespace-nowrap rounded-full text-xs font-semibold', className ?? 'px-[9px] py-[3px]')} style={{ background: tone.bg, color: tone.ink }}>
      {children}
    </span>
  );
}

export function Avatar({ text, size = 34, className }: { text: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-flex flex-none items-center justify-center rounded-full bg-brand-soft font-semibold text-brand', className)}
      style={{ width: size, height: size, fontSize: size >= 48 ? (size >= 56 ? 18 : 16) : size >= 40 ? 14 : 13 }}
    >
      {text}
    </span>
  );
}

type Kind = 'primary' | 'secondary' | 'danger' | 'outline-brand';
const KIND: Record<Kind, string> = {
  primary: 'border-0 bg-brand text-white',
  secondary: 'border border-input-border bg-white text-ink',
  danger: 'border border-incorrect-line bg-white text-incorrect',
  'outline-brand': 'border border-brand bg-white text-brand',
};

export function buttonClass(kind: Kind, sizeClass: string, extra?: string) {
  return cx('inline-flex items-center justify-center text-center font-[inherit]', KIND[kind], sizeClass, extra);
}

/**
 * A button drawn in the artboard whose follow-up has no design yet (a dialog, a form ...). It looks as drawn
 * and does nothing: no handler, announced as unavailable.
 */
export function InertButton({ kind, sizeClass, className, children, ...rest }: { kind: Kind; sizeClass: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-disabled="true" onClick={(e) => e.preventDefault()} className={cx(buttonClass(kind, sizeClass), 'cursor-default', className)} {...rest}>
      {children}
    </button>
  );
}

/** The filter chips (All, Full Access ...): one pressed at a time. */
export function FilterChips({ label, items, value, onPick, className, scroll }: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onPick: (v: string) => void;
  className?: string;
  /** Phone: one scrolling row. */
  scroll?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={cx(scroll ? '-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5' : 'flex flex-wrap gap-1.5', className)}>
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(it.value)}
            className={cx(
              'min-h-10 rounded-full border px-3.5 text-sm font-semibold',
              scroll && 'flex-none',
              on ? 'border-link bg-brand-soft text-brand' : 'border-border-strong bg-white text-ink',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export const INPUT = 'h-11 rounded-[10px] border border-input-border bg-white px-3 text-[15px] text-ink';

/** Visually hidden label (the artboards' `position:absolute; width:1px; clip` pattern). */
export const SR = 'sr-only';

/** Previous / next, for the lists the artboards draw as "Page 1 of 528" (no controls are drawn there). */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const cls = 'min-h-10 rounded-[10px] border border-input-border bg-white px-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={cls} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <button type="button" className={cls} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
