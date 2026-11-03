import { z } from 'zod';

/** An email address as the account identity: trimmed and lower-cased so "A@x.com" and "a@x.com" are one person. */
export const emailInput = z.string().trim().toLowerCase().max(254).email();

export const normalizeEmail = (s: string) => s.trim().toLowerCase();
