/** An error with an HTTP status and a stable machine-readable code the web app can switch on. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export const badRequest = (code: string, extra?: Record<string, unknown>) => new HttpError(400, code, extra);
export const unauthorized = (code = 'unauthorized') => new HttpError(401, code);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const notFound = (code = 'not_found') => new HttpError(404, code);
export const conflict = (code: string) => new HttpError(409, code);
export const tooMany = (code: string, retryAfterSeconds: number) =>
  new HttpError(429, code, { retryAfterSeconds });
