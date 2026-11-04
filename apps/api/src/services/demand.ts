/** Requests for the same search group on this: case and spacing are ignored. */
export const normalizeQuery = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');
