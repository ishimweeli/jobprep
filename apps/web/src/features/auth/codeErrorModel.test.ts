import { ApiError } from '../../api/client';
import { codeErrorBox, expiresMinutes, resendLabel } from './codeErrorModel';

describe('verify-email error mapping (numbers come from the API, not the artboard)', () => {
  it('a wrong code says how many tries are left, from triesLeft', () => {
    const box = codeErrorBox(new ApiError(400, 'invalid_code', { triesLeft: 3 }), 300);
    expect(box).toMatchObject({ title: 'That code is not right', body: 'Check your email and try again. 3 tries left.', tone: 'red', clearCode: true, invalidBoxes: true, locksVerify: false });
    expect(codeErrorBox(new ApiError(400, 'invalid_code', { triesLeft: 1 }), 300).body).toBe('Check your email and try again. 1 try left.');
  });
  it('a wrong code without triesLeft does not invent a number', () => {
    expect(codeErrorBox(new ApiError(400, 'invalid_code'), 300).body).toBe('Check your email and try again.');
  });
  it('the last wrong try (triesLeft 0) kills the code, like too_many_attempts', () => {
    const last = codeErrorBox(new ApiError(400, 'invalid_code', { triesLeft: 0 }), 300);
    const dead = codeErrorBox(new ApiError(400, 'too_many_attempts', { triesLeft: 0 }), 300);
    for (const b of [last, dead]) {
      expect(b).toMatchObject({ title: 'Too many tries', body: 'Request a new code.', tone: 'red', locksVerify: true, needsNewCode: true });
    }
    expect(dead.body).not.toMatch(/15 minutes|wait/); // no timed lockout in the backend
  });
  it('code_expired is its own message and uses the real code lifetime', () => {
    const box = codeErrorBox(new ApiError(400, 'code_expired'), 300);
    expect(box).toMatchObject({ title: 'This code has expired', body: 'Codes work for 5 minutes. Send a new one below.', tone: 'amber', needsNewCode: true, locksVerify: false });
    expect(codeErrorBox(new ApiError(400, 'code_expired'), 600).body).toBe('Codes work for 10 minutes. Send a new one below.');
  });
  it('otp_cooldown (429) gives a friendly wait with the API seconds', () => {
    const box = codeErrorBox(new ApiError(429, 'otp_cooldown', {}, 31), 300);
    expect(box).toMatchObject({ title: 'Please wait a moment', body: 'You can ask for another code in 0:31.', tone: 'amber', waitSeconds: 31 });
  });
  it('otp_hourly_limit (429) says to try later, with minutes when the API gives them', () => {
    expect(codeErrorBox(new ApiError(429, 'otp_hourly_limit', {}, 1800), 300).body).toBe('You have asked for too many codes. Try again in about 30 minutes.');
    expect(codeErrorBox(new ApiError(429, 'otp_hourly_limit'), 300).body).toBe('You have asked for too many codes. Try again later.');
  });
  it('offline and suspended and unknown failures', () => {
    expect(codeErrorBox(new ApiError(0, 'network_error'), 300)).toMatchObject({ title: 'You seem to be offline', body: 'Check your connection, then tap Verify again.', tone: 'amber' });
    expect(codeErrorBox(new ApiError(403, 'account_suspended'), 300).title).toBe('This account is suspended');
    expect(codeErrorBox(new ApiError(500, 'internal_error'), 300).title).toBe('Something went wrong');
    expect(codeErrorBox(new Error('x'), 300).title).toBe('Something went wrong');
  });
  it('never says whether an account exists', () => {
    const all = ['invalid_code', 'code_expired', 'too_many_attempts', 'otp_cooldown'].map((c) => codeErrorBox(new ApiError(400, c), 300));
    for (const b of all) expect(`${b.title} ${b.body}`).not.toMatch(/no account|not registered|does not exist|doesn.t have/i);
  });
});

describe('resend button label', () => {
  it('counts down from the API cooldown, then offers a new code', () => {
    expect(resendLabel(45)).toBe('Send a new code in 0:45');
    expect(resendLabel(0)).toBe('Send a new code');
  });
  it('the code lifetime in minutes comes from expiresInSeconds', () => {
    expect(expiresMinutes(600)).toBe(10);
    expect(expiresMinutes(300)).toBe(5);
    expect(expiresMinutes(20)).toBe(1);
  });
});
