import { describe, expect, it } from 'vitest';
import { anchorId, isLegalSlug, lastUpdatedLine, supportRows, supportState, tocFor } from './legalModel';

describe('legal and help pages (C25 / C36)', () => {
  it('knows the four legal slugs', () => {
    expect(isLegalSlug('terms')).toBe(true);
    expect(isLegalSlug('cookies')).toBe(true);
    expect(isLegalSlug('help')).toBe(false);
    expect(isLegalSlug(undefined)).toBe(false);
  });
  it('last updated line only with a date', () => {
    expect(lastUpdatedLine('2026-11-05', (i) => i)).toBe('Last updated 2026-11-05');
    expect(lastUpdatedLine(null, (i) => i)).toBeNull();
  });
  it('table of contents anchors are safe ids', () => {
    expect(anchorId('Your Account!', 1)).toBe('s-your-account-');
    expect(anchorId('', 2)).toBe('s-3');
    expect(tocFor([{ id: 'about', heading: 'About JobPrep' }])).toEqual([{ id: 's-about', heading: 'About JobPrep' }]);
  });
  it('support rows: only what the country has, with tappable links', () => {
    const rows = supportRows({ phone: '+250 788 000 000', whatsapp: '+250 788 000 001', email: 'help@jobprep.test' });
    expect(rows.map((r) => r.href)).toEqual(['tel:+250788000000', 'https://wa.me/250788000001', 'mailto:help@jobprep.test']);
    expect(supportRows({ phone: null, whatsapp: null, email: 'a@b.c' }).map((r) => r.kind)).toEqual(['email']);
    expect(supportRows(null)).toEqual([]);
    const named = supportRows({ phone: null, whatsapp: null, email: 'a@b.c', people: [{ name: 'Abel', phone: '+250 785 969 446' }, { name: 'Pacifique', phone: '+250 783 137 606' }] });
    expect(named.map((r) => [r.label, r.href])).toEqual([['Abel', 'tel:+250785969446'], ['Pacifique', 'tel:+250783137606'], ['Email', 'mailto:a@b.c']]);
  });
  it('support state: ready, placeholder, or missing', () => {
    const base = { phone: '+250788000000', whatsapp: null, email: null, hours: null, configured: true, placeholder: false };
    expect(supportState(base)).toBe('ready');
    expect(supportState({ ...base, placeholder: true })).toBe('placeholder');
    expect(supportState({ ...base, configured: false })).toBe('missing');
    expect(supportState({ ...base, phone: null })).toBe('missing');
    expect(supportState(undefined)).toBe('missing');
  });
});
