import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import type { OtpRequestResponse } from '../../api/types';
import { Button } from '../../components/Button';
import { authErrorMessage } from '../../lib/errorCopy';
import { mmss } from '../../lib/format';
import { useCountdown } from '../../lib/useCountdown';
import { OTP_LENGTH, OtpInput } from './OtpInput';

interface Props {
  /** "+250 788 123 456" — shown in the heading text. */
  phoneLabel: string;
  /** Seconds before the first resend is allowed (the API's `cooldownSeconds` from the request just made). */
  initialCooldown: number;
  submitLabel?: string;
  /** Verify the code. Throw an ApiError to show its message and stay on this step. */
  onSubmit: (code: string) => Promise<void>;
  /** Ask for a new code. */
  onResend: () => Promise<OtpRequestResponse>;
  heading?: string;
}

/**
 * OTP entry with a resend countdown. The countdown starts from the API's `cooldownSeconds`;
 * if a resend is rejected with 429 the countdown restarts from `Retry-After` / `retryAfterSeconds`.
 */
export function OtpStep({ phoneLabel, initialCooldown, submitLabel = 'Verify', onSubmit, onResend, heading = 'Enter the code' }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const cooldown = useCountdown(initialCooldown);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    if (code.length !== OTP_LENGTH) {
      setError(`Enter all ${OTP_LENGTH} digits of the code.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit(code);
    } catch (err) {
      setError(authErrorMessage(err));
      if (err instanceof ApiError && (err.code === 'invalid_code' || err.code === 'too_many_attempts')) setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      const r = await onResend();
      cooldown.start(r.cooldownSeconds);
      setCode('');
      setNotice('We sent you a new code.');
    } catch (err) {
      setError(authErrorMessage(err));
      if (err instanceof ApiError && err.status === 429 && err.retryAfterSeconds) cooldown.start(err.retryAfterSeconds);
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-2xl font-bold tracking-tight md:text-[26px]">{heading}</h1>
        <p className="m-0 text-[15px] text-ink-2">Sent by SMS to {phoneLabel}.</p>
      </div>
      <OtpInput value={code} onChange={setCode} disabled={busy} invalid={!!error} describedBy={error ? 'otp-error' : undefined} />
      {error && (
        <p id="otp-error" role="alert" className="m-0 text-sm font-semibold text-incorrect">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="m-0 text-sm font-semibold text-free">
          {notice}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" loading={busy}>
        {submitLabel}
      </Button>
      <p className="m-0 text-sm text-ink-2">
        Didn’t get it?{' '}
        <button
          type="button"
          onClick={resend}
          disabled={!cooldown.done || resending}
          className="min-h-[44px] bg-transparent px-1 font-semibold text-brand disabled:cursor-not-allowed disabled:text-muted"
        >
          {cooldown.done ? 'Resend code' : `Resend in ${mmss(cooldown.remaining)}`}
        </button>
      </p>
    </form>
  );
}
