import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { mapPawaPayStatus, PawaPayProvider } from '../../src/payments/pawapay';
import { createProviderRegistry } from '../../src/payments/registry';
import { InvalidCallbackError, ProviderError, type FetchLike } from '../../src/payments/types';
import { handleCallback } from '../../src/services/payments';
import type { Ctx } from '../../src/http/context';

type Call = { url: string; method?: string; headers?: Record<string, string>; body?: unknown };

/** A scripted fetch: each call is answered by the first matching route (method + URL), and recorded. */
function mockFetch(routes: [RegExp, { status?: number; json?: unknown }][]) {
  const calls: Call[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, method: init?.method, headers: init?.headers, body: init?.body ? JSON.parse(init.body) : undefined });
    const hit = routes.find(([re]) => re.test(`${init?.method ?? 'GET'} ${url}`));
    if (!hit) throw new Error(`unexpected request ${url}`);
    const status = hit[1].status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(hit[1].json ?? {}) };
  };
  return { fn, calls };
}

const TOKEN = 'tok-pawapay-test-token';
const SECRET = 's3cret-callback-secret-1234';
const cfg = { baseUrl: 'https://api.sandbox.pawapay.test', apiToken: TOKEN, callbackSecret: SECRET };
const input = {
  paymentId: 'pay_123', msisdn: '+250788123456', amountMinor: 2000, currencyCode: 'RWF', currencyExponent: 0,
  description: 'JobPrep Full Access', callbackUrl: `https://api.example/cb?token=${SECRET}`,
};
const predictOk: [RegExp, { status?: number; json?: unknown }] = [
  /^POST .*\/v2\/predict-provider$/, { json: { provider: 'MTN_MOMO_RWA', country: 'RWA', phoneNumber: '250788123456' } },
];

describe('pawaPay adapter: request to pay', () => {
  it('predicts the operator from the number, then creates the deposit with a UUID, major-unit string amount and no PIN', async () => {
    const m = mockFetch([predictOk, [/^POST .*\/v2\/deposits$/, { json: { status: 'ACCEPTED' } }]]);
    const { providerReference } = await new PawaPayProvider(cfg, m.fn).requestToPay(input);
    expect(providerReference).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    const [predict, deposit] = m.calls;
    expect(predict).toMatchObject({ url: 'https://api.sandbox.pawapay.test/v2/predict-provider', method: 'POST', body: { phoneNumber: '250788123456' } });
    expect(predict!.headers!.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(deposit!.url).toBe('https://api.sandbox.pawapay.test/v2/deposits');
    expect(deposit!.headers!.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(deposit!.body).toEqual({
      depositId: providerReference, amount: '2000', currency: 'RWF',
      payer: { type: 'MMO', accountDetails: { phoneNumber: '250788123456', provider: 'MTN_MOMO_RWA' } },
    });
    expect(JSON.stringify(deposit!.body)).not.toMatch(/pin/i);
  });

  it('formats minor units as a major-unit string for currencies with decimals', async () => {
    const m = mockFetch([predictOk, [/^POST .*\/v2\/deposits$/, { json: { status: 'ACCEPTED' } }]]);
    await new PawaPayProvider(cfg, m.fn).requestToPay({ ...input, amountMinor: 15050, currencyCode: 'KES', currencyExponent: 2 });
    expect((m.calls[1]!.body as { amount: string }).amount).toBe('150.5');
  });

  it('a rejected deposit is an error (nothing was sent to the payer) carrying the failure code', async () => {
    const m = mockFetch([predictOk, [/^POST .*\/v2\/deposits$/, { json: { status: 'REJECTED', failureReason: { failureCode: 'AMOUNT_OUT_OF_BOUNDS' } } }]]);
    const err = await new PawaPayProvider(cfg, m.fn).requestToPay(input).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toBe('deposit_rejected:AMOUNT_OUT_OF_BOUNDS');
  });

  it('a duplicate-ignored deposit is carried on with (the id already exists)', async () => {
    const m = mockFetch([predictOk, [/^POST .*\/v2\/deposits$/, { json: { status: 'DUPLICATE_IGNORED' } }]]);
    await expect(new PawaPayProvider(cfg, m.fn).requestToPay(input)).resolves.toHaveProperty('providerReference');
  });

  it('an unknown operator, or an HTTP error, stops before any deposit is created', async () => {
    const none = mockFetch([[/predict-provider/, { json: {} }]]);
    await expect(new PawaPayProvider(cfg, none.fn).requestToPay(input)).rejects.toThrow('provider_not_predicted');
    expect(none.calls).toHaveLength(1);
    const bad = mockFetch([[/predict-provider/, { status: 401 }]]);
    await expect(new PawaPayProvider(cfg, bad.fn).requestToPay(input)).rejects.toThrow('http_401');
  });

  it('never leaks the token or the callback secret into errors', async () => {
    const m = mockFetch([predictOk, [/^POST .*\/v2\/deposits$/, { json: { status: 'REJECTED', failureReason: { failureCode: 'OTHER' } } }]]);
    const err = await new PawaPayProvider(cfg, m.fn).requestToPay(input).catch((e) => e);
    expect(`${err.message} ${err.stack}`).not.toContain(TOKEN);
    expect(`${err.message} ${err.stack}`).not.toContain(SECRET);
    // the callback URL (with the secret) is never sent to pawaPay; it is configured in their dashboard
    expect(JSON.stringify(m.calls)).not.toContain(SECRET);
  });
});

describe('pawaPay adapter: status', () => {
  const lookup = (json: unknown, status = 200) =>
    new PawaPayProvider(cfg, mockFetch([[/^GET .*\/v2\/deposits\/abc$/, { status, json }]]).fn).getStatus('abc');

  it.each([
    ['COMPLETED', undefined, 'SUCCESSFUL'],
    ['ACCEPTED', undefined, 'PENDING'],
    ['PROCESSING', undefined, 'PENDING'],
    ['IN_RECONCILIATION', undefined, 'PENDING'],
    ['DUPLICATE_IGNORED', undefined, 'PENDING'],
    ['SOMETHING_NEW', undefined, 'PENDING'],
    ['FAILED', { failureCode: 'PAYMENT_NOT_APPROVED', failureMessage: 'The payer did not approve the payment' }, 'DECLINED'],
    ['FAILED', { failureCode: 'INSUFFICIENT_BALANCE' }, 'DECLINED'],
    ['FAILED', { failureCode: 'PAYMENT_NOT_APPROVED', failureMessage: 'The payment request timed out' }, 'EXPIRED'],
    ['FAILED', { failureCode: 'PAYER_TIMEOUT' }, 'EXPIRED'],
    ['FAILED', { failureCode: 'PAYER_NOT_FOUND' }, 'FAILED'],
    ['FAILED', { failureCode: 'UNSPECIFIED_FAILURE' }, 'FAILED'],
    ['FAILED', undefined, 'FAILED'],
  ] as const)('maps %s %j to %s', (status, failureReason, expected) => {
    expect(mapPawaPayStatus(status, failureReason)).toBe(expected);
  });

  it('reads the status, the failure code and pawaPay\'s transaction id from a lookup', async () => {
    expect(await lookup({ status: 'FOUND', data: { status: 'COMPLETED', providerTransactionId: 'MTN-77' } }))
      .toEqual({ status: 'SUCCESSFUL', reason: undefined, transactionId: 'MTN-77' });
    expect(await lookup({ status: 'FOUND', data: { status: 'FAILED', failureReason: { failureCode: 'INSUFFICIENT_BALANCE', failureMessage: 'x' } } }))
      .toMatchObject({ status: 'DECLINED', reason: 'INSUFFICIENT_BALANCE' });
  });

  it('a deposit pawaPay cannot find (404 or NOT_FOUND) keeps waiting', async () => {
    expect(await lookup({}, 404)).toMatchObject({ status: 'PENDING' });
    expect(await lookup({ status: 'NOT_FOUND' })).toMatchObject({ status: 'PENDING' });
  });

  it('a server error is thrown (the caller keeps the payment pending)', async () => {
    await expect(lookup({}, 500)).rejects.toThrow('http_500');
  });
});

describe('pawaPay adapter: callbacks', () => {
  const body = JSON.stringify({ depositId: 'dep-1', status: 'COMPLETED', providerTransactionId: 'MTN-9', amount: '2000' });
  const p = new PawaPayProvider(cfg, mockFetch([]).fn);
  const parse = (query: Record<string, string | undefined>, rawBody = body, provider = p) => provider.parseCallback({ rawBody, headers: {}, query });

  it('rejects a missing or wrong token (fail closed)', () => {
    expect(() => parse({})).toThrow(InvalidCallbackError);
    expect(() => parse({ token: 'wrong' })).toThrow(InvalidCallbackError);
    expect(() => parse({ token: SECRET.slice(0, -1) })).toThrow(InvalidCallbackError);
  });

  it('rejects everything when no secret is configured, even an empty token', () => {
    const open = new PawaPayProvider({ ...cfg, callbackSecret: '' }, mockFetch([]).fn);
    expect(() => parse({}, body, open)).toThrow(/callback_secret_not_configured/);
    expect(() => parse({ token: '' }, body, open)).toThrow(InvalidCallbackError);
  });

  it('accepts the right token and matches by deposit id', () => {
    expect(parse({ token: SECRET })).toMatchObject({ providerReference: 'dep-1', status: 'SUCCESSFUL', transactionId: 'MTN-9' });
    const failed = JSON.stringify({ depositId: 'dep-2', status: 'FAILED', failureReason: { failureCode: 'PAYMENT_NOT_APPROVED', failureMessage: 'no' } });
    expect(parse({ token: SECRET }, failed)).toMatchObject({ providerReference: 'dep-2', status: 'DECLINED', reason: 'PAYMENT_NOT_APPROVED' });
  });

  it('an identical retry has the same event id; a different outcome does not', () => {
    const a = parse({ token: SECRET });
    expect(parse({ token: SECRET }).eventId).toBe(a.eventId);
    expect(parse({ token: SECRET }, body.replace('COMPLETED', 'FAILED')).eventId).not.toBe(a.eventId);
    expect(a.eventId).not.toContain(SECRET);
  });

  it('an authenticated body without a deposit id is a bad request, not a settlement', () => {
    expect(() => parse({ token: SECRET }, JSON.stringify({ status: 'COMPLETED' }))).toThrow(SyntaxError);
    expect(() => parse({ token: SECRET }, 'not json')).toThrow(SyntaxError);
  });

  it('the error for a bad token never contains the secret or the token', () => {
    const err = (() => { try { parse({ token: 'guess-guess-guess' }); } catch (e) { return e as Error; } })()!;
    expect(err.message).not.toContain(SECRET);
    expect(err.message).not.toContain('guess');
  });
});

describe('handleCallback with pawaPay (success is confirmed before settling)', () => {
  const callback = (status: string) => ({
    rawBody: JSON.stringify({ depositId: 'dep-1', status }), headers: {}, query: { token: SECRET },
  });
  // Only payment.findFirst is reached on the paths tested here; applySignal (the database transaction) is not.
  const ctxWith = (payment: unknown) => ({ prisma: { payment: { findFirst: async () => payment } } }) as unknown as Ctx;
  const pending = { id: 'p1', provider: 'MTN_MOMO', status: 'PENDING', providerReference: 'dep-1' };

  it('does not settle a callback success that pawaPay does not confirm', async () => {
    const m = mockFetch([[/^GET .*\/v2\/deposits\/dep-1$/, { json: { status: 'FOUND', data: { status: 'PROCESSING' } } }]]);
    const out = await handleCallback(ctxWith(pending), new PawaPayProvider(cfg, m.fn), callback('COMPLETED'));
    expect(out).toEqual({ matched: true, changed: false, status: 'PENDING' });
    expect(m.calls).toHaveLength(1); // it did ask
  });

  it('does not settle a forged success for an unknown deposit', async () => {
    const m = mockFetch([]);
    const out = await handleCallback(ctxWith(null), new PawaPayProvider(cfg, m.fn), callback('COMPLETED'));
    expect(out).toEqual({ matched: false });
    expect(m.calls).toHaveLength(0);
  });

  it('lets a failed status-check surface so pawaPay retries the callback', async () => {
    const m = mockFetch([[/deposits\/dep-1/, { status: 503 }]]);
    await expect(handleCallback(ctxWith(pending), new PawaPayProvider(cfg, m.fn), callback('COMPLETED'))).rejects.toThrow('http_503');
  });

  it('rejects a bad token before touching the database or pawaPay', async () => {
    const m = mockFetch([]);
    await expect(handleCallback(ctxWith(pending), new PawaPayProvider(cfg, m.fn), { ...callback('COMPLETED'), query: {} })).rejects.toThrow(InvalidCallbackError);
    expect(m.calls).toHaveLength(0);
  });
});

describe('registry and config with pawaPay', () => {
  const env = { DATABASE_URL: 'postgresql://x', SESSION_SECRET: 'x'.repeat(20), PUBLIC_API_URL: 'https://api.jobprep.test' };

  it('with a token, every method is served by pawaPay and only its webhook exists; the URL carries the secret', () => {
    const r = createProviderRegistry(loadConfig({ ...env, PAYMENT_PROVIDER_MODE: 'live', PAWAPAY_API_TOKEN: 't', PAWAPAY_CALLBACK_SECRET: 'abc 123' }));
    expect(r.get('MTN_MOMO').code).toBe('PAWAPAY');
    expect(r.get('MPESA')).toBe(r.get('AIRTEL_MONEY'));
    expect(r.fromSlug('pawapay')?.code).toBe('PAWAPAY');
    expect(r.fromSlug('mtn-momo')).toBeNull();
    expect(r.fromSlug('fake')).toBeNull();
    expect(r.callbackUrl('MPESA')).toBe('https://api.jobprep.test/api/payments/webhooks/pawapay?token=abc%20123');
    expect(() => r.get('FAKE')).toThrow();
  });

  it('without a token the direct adapters are used and pawaPay is not reachable', () => {
    const r = createProviderRegistry(loadConfig({ ...env, PAYMENT_PROVIDER_MODE: 'sandbox' }));
    expect(r.fromSlug('pawapay')).toBeNull();
    expect(r.get('MTN_MOMO').code).toBe('MTN_MOMO');
  });

  it('defaults', () => {
    const c = loadConfig({ ...env });
    expect(c).toMatchObject({ PAWAPAY_API_TOKEN: '', PAWAPAY_BASE_URL: 'https://api.pawapay.io', PAWAPAY_CALLBACK_SECRET: '' });
  });

  // Other production checks (SMS/email provider etc.) are not this file's business: only the payment lines are asserted.
  const prod = {
    ...env, NODE_ENV: 'production', SESSION_SECRET: 'r4nd0m-'.repeat(6), PAYMENT_PROVIDER_MODE: 'live', WEB_ORIGIN: 'https://jobprep.test',
    PAWAPAY_API_TOKEN: 'tok', PAWAPAY_CALLBACK_SECRET: 'p'.repeat(16),
  };
  const refusal = (over: Record<string, string>) => {
    try { loadConfig({ ...prod, ...over }); return ''; } catch (e) { return (e as Error).message; }
  };
  it('production requires the pawaPay token and a 16+ character callback secret, and no longer the old operator secrets', () => {
    const base = refusal({}); // no MTN / Airtel / M-Pesa secrets are set
    expect(base).not.toMatch(/PAWAPAY|MTN_MOMO|AIRTEL|MPESA/);
    expect(refusal({ PAWAPAY_API_TOKEN: '' })).toMatch(/PAWAPAY_API_TOKEN must be set/);
    expect(refusal({ PAWAPAY_CALLBACK_SECRET: '' })).toMatch(/PAWAPAY_CALLBACK_SECRET/);
    expect(refusal({ PAWAPAY_CALLBACK_SECRET: 'p'.repeat(15) })).toMatch(/PAWAPAY_CALLBACK_SECRET/);
    expect(refusal({ PAWAPAY_CALLBACK_SECRET: 'p'.repeat(16) })).not.toMatch(/PAWAPAY_CALLBACK_SECRET/);
  });
});
