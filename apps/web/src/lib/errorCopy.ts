import { ApiError } from '../api/client';
import { errorMessage } from './errorCatalogue';

/**
 * Friendly copy for API error codes. Never expose raw codes to the user.
 * The wording lives in the error catalogue (`lib/errorCatalogue.ts`, C28); this name stays for the many screens that import it.
 */
export function authErrorMessage(e: unknown): string {
  return errorMessage(e instanceof ApiError ? e : new ApiError(0, 'network_error'));
}
