/** National part of a mobile number: digits only, no leading 0 or country code. */
export function nationalDigits(input: string, dialCode: string): string {
  const dial = dialCode.replace(/\D/g, '');
  let d = input.replace(/\D/g, '');
  if (input.trim().startsWith('+') || input.trim().startsWith('00')) {
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith(dial)) d = d.slice(dial.length);
  }
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

/** Mobile numbers in RW/KE/UG/TZ have 9 national digits (same rule as the API). */
export function isValidNational(national: string): boolean {
  return /^\d{9}$/.test(national);
}

/** "+250" + "788123456" -> "+250788123456" (what we send to the API). */
export function toE164(national: string, dialCode: string): string {
  return `${dialCode}${national}`;
}

/** "+250788123456" -> "+250 788 123 456" for display. */
export function formatPhone(e164: string, dialCode?: string): string {
  const dial = dialCode ?? e164.slice(0, 4);
  const rest = e164.slice(dial.length).replace(/\D/g, '');
  const groups = rest.match(/.{1,3}/g)?.join(' ') ?? rest;
  return `${dial} ${groups}`;
}

/** Display grouping of national digits while typing: "788123456" -> "788 123 456". */
export function groupNational(national: string): string {
  return national.match(/.{1,3}/g)?.join(' ') ?? '';
}
