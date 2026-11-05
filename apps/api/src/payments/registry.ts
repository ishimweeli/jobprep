import type { Config } from '../config';
import { FakeProvider } from './fake';
import { MpesaProvider } from './mpesa';
import { PawaPayProvider } from './pawapay';
import type { FetchLike, PaymentProvider, ProviderCode } from './types';

/** URL segment each operator's webhook uses: POST /api/payments/webhooks/:slug */
export const WEBHOOK_SLUGS: Record<ProviderCode, string> = {
  MTN_MOMO: 'mtn-momo',
  AIRTEL_MONEY: 'airtel-money',
  MPESA: 'mpesa',
  FAKE: 'fake',
};
/** pawaPay's webhook: POST /api/payments/webhooks/pawapay?token=<PAWAPAY_CALLBACK_SECRET> (set this URL in the pawaPay dashboard). */
export const PAWAPAY_SLUG = 'pawapay';

export interface ProviderRegistry {
  /** The adapter that handles a payment method. In fake mode every method is served by the fake provider. */
  get(code: ProviderCode): PaymentProvider;
  /** Resolve a webhook URL segment to its adapter, or null if that route is not live in this mode. */
  fromSlug(slug: string): PaymentProvider | null;
  /** Only present in fake mode: lets tests settle payments. */
  fake: FakeProvider | null;
  callbackUrl(code: ProviderCode): string;
}

export function createProviderRegistry(config: Config, fetchFn?: FetchLike): ProviderRegistry {
  const base = config.PUBLIC_API_URL.replace(/\/$/, '');

  if (config.PAYMENT_PROVIDER_MODE === 'fake') {
    const fake = new FakeProvider(config.FAKE_WEBHOOK_SECRET);
    return {
      get: () => fake,
      fromSlug: (slug) => (slug === 'fake' ? fake : null),
      fake,
      callbackUrl: () => `${base}/api/payments/webhooks/fake`,
    };
  }

  // pawaPay is the live provider: when its token is set it serves every payment method (the operator is picked by phone
  // number) and the direct adapters below are not reachable. Leave PAWAPAY_API_TOKEN empty to select the direct adapters.
  if (config.PAWAPAY_API_TOKEN) {
    const pawapay = new PawaPayProvider({
      baseUrl: config.PAWAPAY_BASE_URL, apiToken: config.PAWAPAY_API_TOKEN, callbackSecret: config.PAWAPAY_CALLBACK_SECRET,
    }, fetchFn);
    return {
      get: (code) => {
        if (code === 'FAKE') throw new Error('fake provider is not enabled in this mode');
        return pawapay;
      },
      fromSlug: (slug) => (slug === PAWAPAY_SLUG ? pawapay : null),
      fake: null,
      callbackUrl: (code) =>
        code === 'FAKE' ? '' : `${base}/api/payments/webhooks/${PAWAPAY_SLUG}?token=${encodeURIComponent(config.PAWAPAY_CALLBACK_SECRET)}`,
    };
  }

  // Without a pawaPay token, M-Pesa is the only adapter left that still talks to its operator directly (MTN MoMo and
  // Airtel Money's direct adapters were retired once pawaPay became the sole live path — see config.ts's production
  // check, which no longer requires their secrets). This branch exists for M-Pesa sandbox testing only.
  const mpesa = new MpesaProvider({
    baseUrl: config.MPESA_BASE_URL, consumerKey: config.MPESA_CONSUMER_KEY, consumerSecret: config.MPESA_CONSUMER_SECRET,
    shortcode: config.MPESA_SHORTCODE, passkey: config.MPESA_PASSKEY, callbackSecret: config.MPESA_CALLBACK_SECRET,
  }, fetchFn);
  return {
    get: (code) => {
      if (code !== 'MPESA') throw new Error(`${code} has no direct adapter (pawaPay is not configured): set PAWAPAY_API_TOKEN`);
      return mpesa;
    },
    fromSlug: (slug) => (slug === WEBHOOK_SLUGS.MPESA ? mpesa : null),
    fake: null,
    callbackUrl: (code) =>
      code === 'MPESA' ? `${base}/api/payments/webhooks/${WEBHOOK_SLUGS.MPESA}?token=${encodeURIComponent(config.MPESA_CALLBACK_SECRET)}` : '',
  };
}
