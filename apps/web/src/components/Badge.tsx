import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

type Tone = 'free' | 'fullAccess' | 'brand' | 'neutral' | 'active';

const tones: Record<Tone, string> = {
  free: 'bg-free-bg text-free',
  fullAccess: 'bg-soft text-ink-2',
  brand: 'bg-brand-soft text-brand',
  neutral: 'bg-soft text-ink-2',
  active: 'bg-free-bg text-free',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex shrink-0 items-center whitespace-nowrap rounded-pill px-[9px] py-[3px] text-xs font-semibold', tones[tone], className)}>
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
