import type { AdminSettings, SettingsPatch } from '../../api/types';

/** The "mark a payment as stuck after (minutes)" box: a whole number from 1 to 240 (what the API accepts). */
export const STUCK_MIN = 1;
export const STUCK_MAX = 240;

export function parseStuckMinutes(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= STUCK_MIN && n <= STUCK_MAX ? n : null;
}

/** Only what changed is sent (`PUT /settings` takes any subset and writes one audit row per change). */
export function settingsPatch(current: AdminSettings, next: Partial<AdminSettings>): SettingsPatch {
  const patch: SettingsPatch = {};
  if (next.stuckAfterMinutes !== undefined && next.stuckAfterMinutes !== current.stuckAfterMinutes) patch.stuckAfterMinutes = next.stuckAfterMinutes;
  if (next.showExplanationsOnFreeResults !== undefined && next.showExplanationsOnFreeResults !== current.showExplanationsOnFreeResults) {
    patch.showExplanationsOnFreeResults = next.showExplanationsOnFreeResults;
  }
  if (next.showPassMarks !== undefined && next.showPassMarks !== current.showPassMarks) patch.showPassMarks = next.showPassMarks;
  return patch;
}
