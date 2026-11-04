import { describe, expect, it } from 'vitest';
import { requestBody, requestDone, validateRequest } from './requestExamModel';

describe('request this exam', () => {
  it('needs a job or exam of at least 2 characters; the email is optional but must be valid when typed', () => {
    expect(validateRequest({ query: ' ', email: '' }).query).toBe('Enter the job or exam you are looking for.');
    expect(validateRequest({ query: 'Veterinary officer', email: '' })).toEqual({});
    expect(validateRequest({ query: 'Veterinary officer', email: 'nope' }).email).toBe('Enter a valid email address, like name@example.com.');
    expect(validateRequest({ query: 'x'.repeat(121), email: '' }).query).toMatch(/under 120/);
  });
  it('sends a tidy body and leaves the email out when empty', () => {
    expect(requestBody({ query: '  Veterinary   officer ', email: '' })).toEqual({ query: 'Veterinary officer' });
    expect(requestBody({ query: 'Vet', email: ' A@B.Com ' })).toEqual({ query: 'Vet', email: 'a@b.com' });
  });
  it('success wording: new request with or without an address, and a repeat', () => {
    expect(requestDone({ alreadyRequested: false }, true).body).toBe('Thank you. We will email you when this test is added.');
    expect(requestDone({ alreadyRequested: false }, false).title).toBe('Request sent');
    expect(requestDone({ alreadyRequested: true }, true).title).toBe('You already asked for this');
  });
});
