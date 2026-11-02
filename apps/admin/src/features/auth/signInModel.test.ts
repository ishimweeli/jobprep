import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import {
  codeErrorBox, expiresMinutes, initialSignInState, phoneRequestError, resendLabel, signInReducer, type SignInState,
} from './signInModel';

describe('sign-in error mapping (numbers come from the API, not the artboard)', () => {
  it('a wrong code says how many tries are left, from triesLeft', () => {
    const box = codeErrorBox(new ApiError(400, 'invalid_code', { triesLeft: 3 }), 300);
    expect(box).toMatchObject({ title: 'That code is not right', body: 'Check the SMS and try again. 3 tries left.', tone: 'red', clearCode: true, invalidBoxes: true, locksVerify: false });
    expect(codeErrorBox(new ApiError(400, 'invalid_code', { triesLeft: 1 }), 300).body).toBe('Check the SMS and try again. 1 try left.');
  });
  it('a wrong code without triesLeft does not invent a number', () => {
    expect(codeErrorBox(new ApiError(400, 'invalid_code'), 300).body).toBe('Check the SMS and try again.');
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

describe('sign-in phone step', () => {
  it('an invalid number is an inline message that names the country', () => {
    expect(phoneRequestError(new ApiError(400, 'invalid_phone'), 'Rwanda')).toEqual({ kind: 'phone', message: 'Enter a 9-digit Rwanda number, like 788 123 456.' });
  });
  it('a rate limit on the phone step is the amber box', () => {
    const f = phoneRequestError(new ApiError(429, 'otp_cooldown', {}, 20), 'Rwanda');
    expect(f.kind).toBe('box');
  });
});

describe('resend button label and the code lifetime', () => {
  it('counts down from the API cooldown, then offers a resend', () => {
    expect(resendLabel(45, false)).toBe('Resend code in 0:45');
    expect(resendLabel(0, false)).toBe('Resend code');
  });
  it('a dead or expired code offers "Send a new code" once the wait is over', () => {
    expect(resendLabel(12, true)).toBe('Resend code in 0:12');
    expect(resendLabel(0, true)).toBe('Send a new code');
  });
  it('minutes from expiresInSeconds', () => {
    expect(expiresMinutes(300)).toBe(5);
    expect(expiresMinutes(30)).toBe(1);
  });
});

describe('sign-in reducer', () => {
  const step2: SignInState = signInReducer(initialSignInState, { type: 'codeSent', response: { cooldownSeconds: 45, expiresInSeconds: 300 } });
  it('moves to the code step and keeps the API code lifetime', () => {
    expect(step2).toMatchObject({ step: 'code', expiresInSeconds: 300, locked: false, box: null });
  });
  it('a wrong code shows the box; typing again clears it', () => {
    const wrong = signInReducer(step2, { type: 'verifyFailed', box: codeErrorBox(new ApiError(400, 'invalid_code', { triesLeft: 4 }), 300) });
    expect(wrong.box?.title).toBe('That code is not right');
    expect(signInReducer(wrong, { type: 'typing' }).box).toBeNull();
  });
  it('a dead code locks Verify and stays locked while typing, until a new code is sent', () => {
    const dead = signInReducer(step2, { type: 'verifyFailed', box: codeErrorBox(new ApiError(400, 'too_many_attempts'), 300) });
    expect(dead).toMatchObject({ locked: true, needsNewCode: true });
    expect(signInReducer(dead, { type: 'typing' }).locked).toBe(true);
    const fresh = signInReducer(dead, { type: 'codeSent', response: { cooldownSeconds: 45, expiresInSeconds: 300 } });
    expect(fresh).toMatchObject({ locked: false, needsNewCode: false, box: null, step: 'code' });
  });
  it('an expired code needs a new one but does not lock Verify', () => {
    const exp = signInReducer(step2, { type: 'verifyFailed', box: codeErrorBox(new ApiError(400, 'code_expired'), 300) });
    expect(exp).toMatchObject({ locked: false, needsNewCode: true });
  });
  it('a failed request stays on the phone step', () => {
    const s = signInReducer(initialSignInState, { type: 'requestFailed', error: phoneRequestError(new ApiError(400, 'invalid_phone'), 'Rwanda') });
    expect(s).toMatchObject({ step: 'phone', phoneError: 'Enter a 9-digit Rwanda number, like 788 123 456.' });
  });
  it('"Use a different number" goes back to the phone step and clears everything', () => {
    const dead = signInReducer(step2, { type: 'verifyFailed', box: codeErrorBox(new ApiError(400, 'too_many_attempts'), 300) });
    expect(signInReducer(dead, { type: 'useDifferentNumber' })).toMatchObject({ step: 'phone', locked: false, box: null, needsNewCode: false });
  });
});
