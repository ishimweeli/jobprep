import { describe, expect, it } from 'vitest';
import type { AdminSettings } from '../../api/types';
import { parseStuckMinutes, settingsPatch } from './settingsModel';

const cur: AdminSettings = { stuckAfterMinutes: 10, showExplanationsOnFreeResults: true, showPassMarks: true, freeSamplesOpenWithoutAccount: true };

describe('settings', () => {
  it('the stuck-minutes box takes whole numbers from 1 to 240', () => {
    expect(parseStuckMinutes('10')).toBe(10);
    expect(parseStuckMinutes(' 240 ')).toBe(240);
    for (const bad of ['0', '241', '', '1.5', 'abc', '-3']) expect(parseStuckMinutes(bad)).toBeNull();
  });
  it('sends only what changed', () => {
    expect(settingsPatch(cur, { stuckAfterMinutes: 5 })).toEqual({ stuckAfterMinutes: 5 });
    expect(settingsPatch(cur, { showPassMarks: false })).toEqual({ showPassMarks: false });
    expect(settingsPatch(cur, { showExplanationsOnFreeResults: true })).toEqual({});
  });
  it('the free-samples product rule is never sent', () => {
    expect(settingsPatch(cur, { freeSamplesOpenWithoutAccount: false })).toEqual({});
  });
});
