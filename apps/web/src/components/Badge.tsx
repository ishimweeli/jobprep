import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

type Tone = 'free' | 'fullAccess' | 'brand' | 'neutral' | 'active';

/**
 * Bordered tag, not a solid-fill pill — a status pastel bubble reads as consumer/marketing; a thin border
 * with a quieter fill and a sharp-ish corner reads closer to an official stamp (the "serious" pass).
 */
const tones: Record<Tone, string> = {
  free: 'border-free/40 bg-free-bg text-free',
  fullAccess: 'border-border-strong bg-surface text-ink-2',
  brand: 'border-brand/30 bg-brand-soft text-brand',
  neutral: 'border-border-strong bg-surface text-ink-2',
  active: 'border-free/40 bg-free-bg text-free',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-[4px] border px-[7px] py-[2px] text-[11px] font-bold uppercase tracking-[0.04em]',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Free / Full Access tag used on result cards and details. Text, never colour alone. */
export function AccessBadge({ isFree, className }: { isFree: boolean; className?: string }) {
  return isFree ? (
    <Badge tone="free" className={className}>
      Free
    </Badge>
  ) : (
    <Badge tone="fullAccess" className={className}>
      Full Access
    </Badge>
  );
}
