import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../lib/cx';

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  pressed: boolean;
  compact?: boolean;
}

/**
 * Category toggle. Was a full pill (rounded-pill) — a sharper, tab-like corner reads less like a consumer
 * filter chip and more like an official category tab (the "serious" pass). `aria-pressed` carries the state;
 * the filled style is not the only cue.
 */
export function Chip({ pressed, compact, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cx(
        'shrink-0 rounded-control border font-semibold transition-colors',
        compact ? 'min-h-[44px] px-3.5 text-sm' : 'min-h-touch px-4 text-[15px]',
        pressed ? 'border-brand bg-brand text-white' : 'border-border-strong bg-surface text-ink hover:bg-soft',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
