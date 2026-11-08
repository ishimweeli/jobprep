import { inflateSync } from 'node:zlib';

/**
 * Reads the public list of open job advertisements from the MIFOTRA e-recruitment portal
 * (https://recruitment.mifotra.gov.rw). The portal's API answers `{ _data_: { "0": 120, "1": 156, … } }`: the bytes of a
 * zlib-compressed JSON array, one byte per numbered key.
 */

export const OPEN_ADVERTS_URL = 'https://recruitment.mifotra.gov.rw/api/recruitment/open-advertisements';

export interface Advert {
  requisitionId: string;
  positionName: string;
  entityAcronym: string;
  entityName: string;
  openingDate: string;
  closingDate: string;
  numberOfPosts: number;
  level: string;
  employeeGroup: string;
  reportsTo: string;
  exams: { psychometric: boolean; written: boolean; oral: boolean };
  jobDescription: string;
}

export function decodePayload(body: unknown): unknown {
  const data = (body as { _data_?: Record<string, number> } | null)?._data_;
  if (!data || typeof data !== 'object') throw new Error('Unexpected MIFOTRA response: no _data_ field');
  const bytes = Buffer.from(Object.keys(data).sort((a, b) => Number(a) - Number(b)).map((k) => data[k]!));
  return JSON.parse(inflateSync(bytes).toString('utf8'));
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

export function toAdverts(raw: unknown): Advert[] {
  if (!Array.isArray(raw)) throw new Error('Unexpected MIFOTRA response: not a list of advertisements');
  return raw.map((r: Record<string, unknown>) => ({
    requisitionId: String(r.requisitionId ?? r.id ?? ''),
    positionName: str(r.positionName),
    entityAcronym: str(r.entityAcronym),
    entityName: str(r.entityName),
    openingDate: str(r.openingDate),
    closingDate: str(r.closingDate),
    numberOfPosts: Number(r.numberOfPosts ?? 1),
    level: [str(r.levelName), str(r.scaleName)].filter(Boolean).join('.'),
    employeeGroup: str(r.employeeGroupName),
    reportsTo: str(r.reportsTo),
    exams: { psychometric: r.willHavePsychometricTest === true, written: r.willHaveWrittenExam === true, oral: r.willHaveOralExam === true },
    jobDescription: typeof r.jobDescriptions === 'string' ? r.jobDescriptions.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim() : '',
  }));
}

export async function fetchOpenAdverts(fetchImpl: typeof fetch = fetch): Promise<Advert[]> {
  const res = await fetchImpl(OPEN_ADVERTS_URL, { headers: { 'user-agent': 'JobPrep job monitor', accept: 'application/json' } });
  if (!res.ok) throw new Error(`MIFOTRA open-advertisements answered ${res.status}`);
  return toAdverts(decodePayload(await res.json()));
}

/** "ministry of interior" / "  Legal affairs specialist " → comparable keys. */
export const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
