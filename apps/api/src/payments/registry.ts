import type { Config } from '../config';
import { AirtelMoneyProvider } from './airtel';
import { FakeProvider } from './fake';
import { MpesaProvider } from './mpesa';
import { MtnMomoProvider } from './mtn';
import type { FetchLike, PaymentProvider, ProviderCode } from './types';

/** URL segment each operator's webhook uses: POST /api/payments/webhooks/:slug */
export const WEBHOOK_SLUGS: Record<ProviderCode, string> = {
  MTN_MOMO: 'mtn-momo',
  AIRTEL_MONEY: 'airtel-money',
  MPESA: 'mpesa',
  FAKE: 'fake',
};

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

  const real: Record<Exclude<ProviderCode, 'FAKE'>, PaymentProvider> = {
    MTN_MOMO: new MtnMomoProvider({
      baseUrl: config.MTN_MOMO_BASE_URL, subscriptionKey: config.MTN_MOMO_SUBSCRIPTION_KEY, apiUser: config.MTN_MOMO_API_USER,
      apiKey: config.MTN_MOMO_API_KEY, targetEnvironment: config.MTN_MOMO_TARGET_ENV, callbackSecret: config.MTN_MOMO_CALLBACK_SECRET,
    }, fetchFn),
    AIRTEL_MONEY: new AirtelMoneyProvider({
      baseUrl: config.AIRTEL_BASE_URL, clientId: config.AIRTEL_CLIENT_ID, clientSecret: config.AIRTEL_CLIENT_SECRET,
      callbackSecret: config.AIRTEL_CALLBACK_SECRET,
    }, fetchFn),
    MPESA: new MpesaProvider({
      baseUrl: config.MPESA_BASE_URL, consumerKey: config.MPESA_CONSUMER_KEY, consumerSecret: config.MPESA_CONSUMER_SECRET,
      shortcode: config.MPESA_SHORTCODE, passkey: config.MPESA_PASSKEY, callbackSecret: config.MPESA_CALLBACK_SECRET,
    }, fetchFn),
  };
  const secrets: Record<Exclude<ProviderCode, 'FAKE'>, string> = {
    MTN_MOMO: config.MTN_MOMO_CALLBACK_SECRET, AIRTEL_MONEY: config.AIRTEL_CALLBACK_SECRET, MPESA: config.MPESA_CALLBACK_SECRET,
  };
  return {
    get: (code) => {
      if (code === 'FAKE') throw new Error('fake provider is not enabled in this mode');
      return real[code];
    },
    fromSlug: (slug) => {
      const entry = (Object.entries(WEBHOOK_SLUGS) as [ProviderCode, string][]).find(([, s]) => s === slug);
      return entry && entry[0] !== 'FAKE' ? real[entry[0]] : null;
    },
    fake: null,
    callbackUrl: (code) =>
      code === 'FAKE' ? '' : `${base}/api/payments/webhooks/${WEBHOOK_SLUGS[code]}?token=${encodeURIComponent(secrets[code])}`,
  };
}
