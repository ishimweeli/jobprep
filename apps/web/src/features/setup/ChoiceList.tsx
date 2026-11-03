import { useRef, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { cx } from '../../lib/cx';

export interface Choice {
  id: string;
  /** The two-letter badge ("RW", "TE"). */
  code: string;
  name: string;
  meta: string;
  /** Green second line (the suggested or current row). */
  metaGood?: boolean;
  /** "Coming soon": drawn at 55% and cannot be picked. */
  disabled?: boolean;
}

/**
 * The radio list of the setup screens and Change exam country (OnboardCountry.dc, OnboardCategory.dc, ChangeCountry.dc):
 * one white rounded box of rows, each a code badge, a name with a grey second line and a tick when chosen.
 * Arrow keys move between the rows that can be chosen.
 */
export function ChoiceList({ label, items, value, onChange }: { label: string; items: Choice[]; value: string | null; onChange: (id: string) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items.map((c, i) => (c.disabled ? -1 : i)).filter((i) => i >= 0);
  const checked = items.findIndex((c) => c.id === value);
  // Roving tab stop: the chosen row, or the first choosable one.
  const stop = checked >= 0 ? checked : enabled[0];

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir || enabled.length === 0) return;
    e.preventDefault();
    const at = enabled.indexOf(i);
    const target = enabled[(at + dir + enabled.length) % enabled.length]!;
    const item = items[target]!;
    onChange(item.id);
    refs.current[target]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="overflow-hidden rounded-[14px] border border-border bg-surface">
      {items.map((c, i) => {
        const on = c.id === value;
        return (
          <button
            key={c.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={c.disabled || undefined}
            tabIndex={i === stop ? 0 : -1}
            onClick={() => !c.disabled && onChange(c.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              'flex min-h-[56px] w-full items-center gap-3 border-0 px-4 py-3.5 text-left font-[inherit] text-ink',
              i > 0 && 'border-t border-t-soft',
              on ? 'bg-brand-softer' : 'bg-surface',
              c.disabled ? 'cursor-default opacity-[0.55]' : 'cursor-pointer',
            )}
          >
            <span className="flex h-[26px] w-[34px] flex-none items-center justify-center rounded-md border border-border bg-page text-[11px] font-bold text-muted">{c.code}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base font-semibold">{c.name}</span>
              <span className={cx('text-[13px]', c.metaGood ? 'text-free' : 'text-muted')}>{c.meta}</span>
            </span>
            <Check size={18} strokeWidth={2.4} aria-hidden="true" className={cx('flex-none text-brand', on ? 'opacity-100' : 'opacity-0')} />
          </button>
        );
      })}
    </div>
  );
}
