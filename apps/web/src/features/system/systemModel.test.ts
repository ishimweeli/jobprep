import { describe, expect, it } from 'vitest';
import { isMaintenanceResponse } from '../../lib/systemState';
import { formatReference, isServerError, SYSTEM_COPY } from './systemModel';

describe('system pages', () => {
  it('the error page shows the API request id as the Reference (JP-XXXX-XXXX)', () => {
    expect(formatReference('7f3a21c9')).toBe('JP-7F3A-21C9');
    expect(formatReference('528894AD')).toBe('JP-5288-94AD');
    expect(formatReference(null)).toBeNull();
    expect(formatReference('')).toBeNull();
  });
  it('copy follows the artboards, minus the maintenance time that nobody has set', () => {
    expect(SYSTEM_COPY.not_found).toMatchObject({ code: 'Error 404', title: 'We can’t find that page', cta: 'Find mock tests', alt: 'Go to the home page' });
    expect(SYSTEM_COPY.error).toMatchObject({ title: 'Something went wrong on our side', note: 'If you were taking a test, your answers are saved.', cta: 'Try again' });
    expect(SYSTEM_COPY.session_expired).toMatchObject({ title: 'Please sign in again', cta: 'Sign in' });
    expect(SYSTEM_COPY.no_access).toMatchObject({ title: 'You don’t have access to the admin area', cta: 'Go to the home page' });
    expect(SYSTEM_COPY.maintenance.title).toBe('JobPrep is being updated');
    for (const c of Object.values(SYSTEM_COPY)) expect(c.body).not.toContain('[');
  });
  it('only 5xx answers get the "something went wrong" page', () => {
    expect(isServerError(500)).toBe(true);
    expect(isServerError(502)).toBe(true);
    expect(isServerError(404)).toBe(false);
    expect(isServerError(0)).toBe(false);
  });
  it('maintenance is a 503 or a bare gateway error, never an API error or a dropped connection', () => {
    expect(isMaintenanceResponse(503, true)).toBe(true);
    expect(isMaintenanceResponse(502, false)).toBe(true);
    expect(isMaintenanceResponse(504, false)).toBe(true);
    expect(isMaintenanceResponse(502, true)).toBe(false); // provider_unavailable has its own screen
    expect(isMaintenanceResponse(500, false)).toBe(false);
    expect(isMaintenanceResponse(0, false)).toBe(false);
  });
});
