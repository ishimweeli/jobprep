import { Pill } from '../../components/ui';

/** The "Stuck" badge (A4): a pending payment older than the stuck-after setting. Words, not just the amber colour. */
export const STUCK_TONE = { bg: '#FDF1DD', ink: '#8A5300' } as const;

export function StuckBadge({ className }: { className?: string }) {
  return <Pill tone={STUCK_TONE} className={className ?? 'px-[9px] py-[3px]'}>Stuck</Pill>;
}
