import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { badRequest } from '../http/errors';

/** Job descriptions: pasted text, or an uploaded PDF / Word (.docx) / text file. Read in memory, never stored as a file. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_JD_CHARS = 30_000;
export const MIN_JD_CHARS = 80;

export type DocKind = 'pdf' | 'docx' | 'text';

/** Decide by the file's own bytes, not its name or the declared type. */
export function sniff(buf: Buffer): DocKind | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'docx';
  // Plain text: valid UTF-8 with no NUL bytes in the first 4 KB.
  const head = buf.subarray(0, 4096);
  if (head.includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, Math.max(0, head.length - 4)));
    return 'text';
  } catch {
    return null;
  }
}

export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The text of a job description, cleaned and capped. Throws 400 jd_unreadable / jd_too_short. */
export async function readDocument(buf: Buffer): Promise<{ kind: DocKind; text: string }> {
  const kind = sniff(buf);
  if (!kind) throw badRequest('jd_unreadable');
  let raw: string;
  try {
    if (kind === 'pdf') raw = (await extractText(new Uint8Array(buf), { mergePages: true })).text;
    else if (kind === 'docx') raw = (await mammoth.extractRawText({ buffer: buf })).value;
    else raw = buf.toString('utf8');
  } catch {
    throw badRequest('jd_unreadable');
  }
  return { kind, text: normalizeJobText(raw) };
}

export function normalizeJobText(raw: string): string {
  const text = cleanText(raw).slice(0, MAX_JD_CHARS);
  if (text.length < MIN_JD_CHARS) throw badRequest('jd_too_short');
  return text;
}
