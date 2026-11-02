/**
 * Normalise a locally typed number ("078 812 3456", "0788123456", "+250 788 123 456") to E.164
 * using the country's dial code. Returns null when it can't be a valid mobile number.
 */
export function normalizePhone(input: string, dialCode: string): string | null {
  const dial = dialCode.replace(/\D/g, '');
  let digits = input.replace(/[\s().-]/g, '');

  if (digits.startsWith('+')) {
    digits = digits.slice(1);
    if (!digits.startsWith(dial)) return null; // wrong country for this account
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
    if (!digits.startsWith(dial)) return null;
  } else if (digits.startsWith('0')) {
    digits = dial + digits.slice(1);
  } else if (!digits.startsWith(dial)) {
    digits = dial + digits;
  }

  if (!/^\d+$/.test(digits)) return null;
  const national = digits.slice(dial.length);
  // Mobile numbers in RW/KE/UG/TZ are 9 national digits.
  if (national.length !== 9) return null;
  return `+${digits}`;
}
