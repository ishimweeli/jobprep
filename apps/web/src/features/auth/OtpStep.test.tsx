import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { cleanOtp, OtpInput } from './OtpInput';
import { OtpStep } from './OtpStep';
import { useState } from 'react';

describe('OtpInput', () => {
  it('cleans input to 6 digits', () => {
    expect(cleanOtp('48 19-27x9')).toBe('481927');
  });

  it('fills every box on paste', () => {
    function H() {
      const [v, setV] = useState('');
      return <OtpInput value={v} onChange={setV} />;
    }
    render(<H />);
    const first = screen.getByLabelText('Digit 1');
    fireEvent.paste(first, { clipboardData: { getData: () => '481 927' } });
    expect((screen.getByLabelText('Digit 6') as HTMLInputElement).value).toBe('7');
    expect((screen.getByLabelText('Digit 3') as HTMLInputElement).value).toBe('1');
  });

  it('advances while typing', async () => {
    const user = userEvent.setup();
    function H() {
      const [v, setV] = useState('');
      return <OtpInput value={v} onChange={setV} />;
    }
    render(<H />);
    await user.click(screen.getByLabelText('Digit 1'));
    await user.keyboard('48');
    expect(screen.getByLabelText('Digit 3')).toHaveFocus();
  });
});

describe('OtpStep resend countdown', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('disables resend until the API cooldown elapses, then restarts it from cooldownSeconds', async () => {
    const onResend = vi.fn().mockResolvedValue({ cooldownSeconds: 45, expiresInSeconds: 300 });
    render(<OtpStep emailLabel="aline@example.test" initialCooldown={45} onSubmit={vi.fn()} onResend={onResend} />);
    const btn = screen.getByRole('button', { name: /Resend in 0:45/ });
    expect(btn).toBeDisabled();
    act(() => void vi.advanceTimersByTime(46_000));
    const ready = screen.getByRole('button', { name: 'Resend code' });
    expect(ready).toBeEnabled();
    await act(async () => {
      fireEvent.click(ready);
    });
    expect(onResend).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Resend in 0:4[45]/ })).toBeDisabled();
  });

  it('honours a 429 Retry-After on resend', async () => {
    const onResend = vi.fn().mockRejectedValue(new ApiError(429, 'otp_cooldown', {}, 31));
    render(<OtpStep emailLabel="aline@example.test" initialCooldown={0} onSubmit={vi.fn()} onResend={onResend} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/wait 0:31/);
    expect(screen.getByRole('button', { name: /Resend in 0:3[01]/ })).toBeDisabled();
  });

  it('shows friendly copy for a wrong code and clears the boxes', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, 'invalid_code'));
    render(<OtpStep emailLabel="aline@example.test" initialCooldown={0} onSubmit={onSubmit} onResend={vi.fn()} />);
    fireEvent.paste(screen.getByLabelText('Digit 1'), { clipboardData: { getData: () => '123456' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    });
    expect(onSubmit).toHaveBeenCalledWith('123456');
    expect(screen.getByRole('alert')).toHaveTextContent(/not right or has expired/);
    expect((screen.getByLabelText('Digit 1') as HTMLInputElement).value).toBe('');
  });

  it('requires all six digits before calling the API', async () => {
    const onSubmit = vi.fn();
    render(<OtpStep emailLabel="aline@example.test" initialCooldown={0} onSubmit={onSubmit} onResend={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter all 6 digits');
  });
});
