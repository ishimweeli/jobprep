import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type ProviderCode = 'MTN_MOMO' | 'AIRTEL_MONEY' | 'MPESA' | 'FAKE';
/**
 * What an adapter calls itself. PAWAPAY is an aggregator: it serves the payment methods above (the stored
 * `Payment.provider` stays MTN_MOMO / AIRTEL_MONEY / MPESA, so no database enum change), picking the operator by phone number.
 */
export type AdapterCode = ProviderCode | 'PAWAPAY';

/** What a provider reports. EXPIRED = the payer never approved in time. */
export type ProviderStatus = 'PENDING' | 'SUCCESSFUL' | 'DECLINED' | 'FAILED' | 'EXPIRED';

export interface RequestToPayInput {
  paymentId: string;
  msisdn: string; // E.164, e.g. +250788123456
  amountMinor: number;
  currencyCode: string;
  currencyExponent: number;
  description: string;
  callbackUrl: string;
}

export interface StatusResult {
  status: ProviderStatus;
  reason?: string;
  /** The provider's own transaction id, when it reports one (shown on the receipt). */
  transactionId?: string;
}

export interface CallbackRequest {
  rawBody: string;
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
}

export interface ParsedCallback extends StatusResult {
  /** Match the payment by the provider's reference and/or by our own payment id. */
  providerReference?: string;
  paymentId?: string;
  /** Stable per delivery: an identical retry has the same id, so duplicates are no-ops. */
  eventId: string;
}

/**
 * One adapter per mobile-money operator. Money rules for every adapter:
 *  - we only ever send the payer's phone number — never a PIN; the payer approves on their own phone
 *  - callbacks must be authenticated; if no secret is configured, every callback is rejected (fail closed)
 */
export interface PaymentProvider {
  readonly code: AdapterCode;
  /** Serves every payment method, so a callback is matched by the provider reference alone (not by `Payment.provider`). */
  readonly aggregator?: boolean;
  /**
   * The callback is only authenticated by a shared secret, so before settling a SUCCESS from one, ask the provider
   * (`getStatus`) and settle only if it agrees. A callback can then at worst prompt a check; it can never grant access.
   */
  readonly confirmSuccessByStatus?: boolean;
  /** Ask the operator to prompt the payer. Returns the reference used to poll and to match callbacks. */
  requestToPay(input: RequestToPayInput): Promise<{ providerReference: string }>;
  getStatus(providerReference: string): Promise<StatusResult>;
  /** Verify the callback is genuine and decode it. Throws InvalidCallbackError otherwise. */
  parseCallback(req: CallbackRequest): ParsedCallback;
}

export class InvalidCallbackError extends Error {
  constructor(message = 'invalid_callback') {
    super(message);
  }
}

export class ProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const hmacHex = (secret: string, body: string) => createHmac('sha256', secret).update(body).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Shared-secret check for operators that cannot sign callbacks: the secret rides in the callback URL. */
export function requireTokenSecret(secret: string, query: Record<string, string | undefined>) {
  if (!secret) throw new InvalidCallbackError('callback_secret_not_configured');
  const token = query.token;
  if (!token || !safeEqual(token, secret)) throw new InvalidCallbackError('bad_callback_token');
}

export const toMajor = (amountMinor: number, exponent: number) => amountMinor / 10 ** exponent;

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export async function jsonCall<T>(fetchFn: FetchLike, url: string, init: Parameters<FetchLike>[1]): Promise<{ status: number; data: T }> {
  let res;
  try {
    res = await fetchFn(url, init);
  } catch (e) {
    throw new ProviderError(`network_error: ${(e as Error).message}`);
  }
  const text = await res.text();
  let data = {} as T;
  try { data = text ? (JSON.parse(text) as T) : data; } catch { /* non-JSON error body */ }
  if (!res.ok && res.status !== 404) throw new ProviderError(`http_${res.status}`, res.status);
  return { status: res.status, data };
}
