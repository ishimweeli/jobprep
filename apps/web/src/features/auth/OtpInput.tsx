import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cx } from '../../lib/cx';

export const OTP_LENGTH = 6;

/** Keep digits only and clamp to the code length. Exported for tests. */
export function cleanOtp(input: string): string {
  return input.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * Six single-digit boxes (as in the design). Typing advances, Backspace steps back, arrow keys move,
 * and pasting a full code fills every box. Each box is labelled "Digit n"; the first offers one-time-code autofill.
 */
export function OtpInput({ value, onChange, disabled, invalid, describedBy }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '');

  const focus = (i: number) => refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))]?.focus();

  const setAt = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join('').replace(/\s/g, ''));
  };

  const onInput = (i: number, raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      setAt(i, '');
      return;
    }
    if (clean.length > 1) {
      // Autofill or fast typing delivered several digits at once.
      const merged = cleanOtp(value.slice(0, i) + clean);
      onChange(merged);
      focus(Math.min(merged.length, OTP_LENGTH - 1));
      return;
    }
    const next = value.slice(0, i).padEnd(i, ' ') + clean + value.slice(i + 1);
    onChange(next.replace(/ /g, '').slice(0, OTP_LENGTH));
    if (i < OTP_LENGTH - 1) focus(i + 1);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      setAt(i - 1, '');
      focus(i - 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focus(i + 1);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = cleanOtp(e.clipboardData.getData('text'));
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    focus(Math.min(pasted.length, OTP_LENGTH - 1));
  };

  return (
    <div role="group" aria-label="6-digit code" className="grid grid-cols-6 gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={i === 0 ? OTP_LENGTH : 1}
          value={d}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.currentTarget.select()}
          className={cx(
            'h-[58px] min-w-0 rounded-control border bg-surface text-center text-2xl font-bold text-ink',
            invalid ? 'border-2 border-incorrect' : 'border-input-border',
          )}
        />
      ))}
    </div>
  );
}
