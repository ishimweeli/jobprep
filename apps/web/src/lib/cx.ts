/** Tiny class-name joiner (keeps the bundle free of a classnames dependency). */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
