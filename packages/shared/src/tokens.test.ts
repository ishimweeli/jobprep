import { describe, expect, it } from 'vitest';
import { colors, radii } from './tokens';
import { jobprepPreset } from './tailwind-preset';

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('palette (the Mwalimu Tools artboards)', () => {
  it('uses the designed hexes', () => {
    expect(colors.brand.DEFAULT).toBe('#164A7A');
    expect(colors.link.DEFAULT).toBe('#2D62CF');
    expect(colors.link.hover).toBe('#1E4BA8');
    expect(colors.ink).toBe('#3A3F4A');
    expect(colors.muted).toBe('#5E6573');
    expect(colors.page).toBe('#EFF3F8');
    expect(colors.border).toBe('#E2E7EF');
    expect(colors['input-border']).toBe('#CDD4DE');
    expect(colors.brand.soft).toBe('#E8EFFB');
    expect(colors.brand.ring).toBe('#6AA6EE');
    expect([colors.correct.DEFAULT, colors.correct.bg]).toEqual(['#1E6B3C', '#E3F4E8']);
    expect([colors.incorrect.DEFAULT, colors.incorrect.bg]).toEqual(['#A1281B', '#FBE7E4']);
    expect([colors.flagged.DEFAULT, colors.flagged.bg]).toEqual(['#8A5300', '#FDF1DD']);
  });

  it('has no purple or violet anywhere, and "Partly correct" stays orange', () => {
    const all = JSON.stringify(colors).toUpperCase();
    for (const old of ['#6D28D9', '#5B21B6', '#EDE9FE', '#F5F3FF', '#A78BFA', '#DDD6FE']) expect(all).not.toContain(old);
    expect(colors.partial.DEFAULT).toBe('#9A3412');
    expect(colors.partial.bg).toBe('#FFEDD5');
  });

  it('uses the smaller corner radii: cards 16px, controls 10px', () => {
    expect(radii.card).toBe('16px');
    expect(radii['card-lg']).toBe('16px');
    expect(radii.control).toBe('10px');
    expect(colors.dark).toBe(colors.brand.DEFAULT);
  });

  it('gives the focus ring the designed blue', () => {
    expect(jobprepPreset.theme.extend.ringColor.DEFAULT).toBe('#6AA6EE');
  });

  it.each([
    ['ink', colors.ink, colors.surface],
    ['ink on page', colors.ink, colors.page],
    ['muted', colors.muted, colors.surface],
    ['muted on page', colors.muted, colors.page],
    ['muted on soft', colors.muted, colors.soft],
    ['brand', colors.brand.DEFAULT, colors.surface],
    ['white on brand', colors.surface, colors.brand.DEFAULT],
    ['white on button hover', colors.surface, colors.brand.hover],
    ['white on dark', colors.surface, colors.dark],
    ['brand on soft', colors.brand.DEFAULT, colors.brand.soft],
    ['link', colors.link.DEFAULT, colors.surface],
    ['link on page', colors.link.DEFAULT, colors.page],
    ['link on soft blue', colors.link.DEFAULT, colors.brand.soft],
    ['correct', colors.correct.DEFAULT, colors.correct.bg],
    ['incorrect', colors.incorrect.DEFAULT, colors.incorrect.bg],
    ['flagged', colors.flagged.DEFAULT, colors.flagged.bg],
    ['partial', colors.partial.DEFAULT, colors.partial.bg],
    ['on dark', colors['on-dark'], colors.dark],
  ])('text pair %s meets WCAG AA (4.5:1)', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
