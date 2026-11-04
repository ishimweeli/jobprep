import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Folder of the built web app (apps/web/dist). Set in the container image; unset in dev, where Vite serves it. */
  WEB_DIST_DIR: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  /** The emailed verification code (new accounts only). */
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(45),
  OTP_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),
  /** Password sign-in: this many wrong passwords in a row lock the account for SIGN_IN_LOCK_MINUTES. */
  SIGN_IN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  SIGN_IN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  /** Password-reset links are valid for this long. */
  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  /** "Continue with Google" (optional). Both must be set to enable it; the redirect URI is ${PUBLIC_API_URL}/api/auth/google/callback. */
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  PAYMENT_PROVIDER_MODE: z.enum(['fake', 'sandbox', 'live']).default('fake'),
  /** Where verification codes, password-reset links and receipts go. `console` only prints (dev/test); production needs `smtp` and the MAIL_* settings. */
  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  MAIL_HOST: z.string().default(''),
  MAIL_PORT: z.coerce.number().int().positive().default(465),
  MAIL_USERNAME: z.string().default(''),
  MAIL_PASSWORD: z.string().default(''),
  MAIL_STARTTLS: bool,
  MAIL_FROM_ADDRESS: z.string().default(''),
  MAIL_FROM_NAME: z.string().default('JobPrep'),
  ENABLE_TEST_ENDPOINTS: bool,
  /** Per-IP rate limits. Default: on in production, off elsewhere (the e2e suites make many sign-ups from one IP). */
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  /** Public URL operators call back to (webhooks). */
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  FAKE_WEBHOOK_SECRET: z.string().default('fake-webhook-secret-dev-only'),
  MTN_MOMO_BASE_URL: z.string().default('https://sandbox.momodeveloper.mtn.com'),
  MTN_MOMO_SUBSCRIPTION_KEY: z.string().default(''),
  MTN_MOMO_API_USER: z.string().default(''),
  MTN_MOMO_API_KEY: z.string().default(''),
  MTN_MOMO_TARGET_ENV: z.string().default('sandbox'),
  MTN_MOMO_CALLBACK_SECRET: z.string().default(''),
  AIRTEL_BASE_URL: z.string().default('https://openapiuat.airtel.africa'),
  AIRTEL_CLIENT_ID: z.string().default(''),
  AIRTEL_CLIENT_SECRET: z.string().default(''),
  AIRTEL_CALLBACK_SECRET: z.string().default(''),
  MPESA_BASE_URL: z.string().default('https://sandbox.safaricom.co.ke'),
  MPESA_CONSUMER_KEY: z.string().default(''),
  MPESA_CONSUMER_SECRET: z.string().default(''),
  MPESA_SHORTCODE: z.string().default(''),
  MPESA_PASSKEY: z.string().default(''),
  MPESA_CALLBACK_SECRET: z.string().default(''),
  /** pawaPay (the live mobile-money aggregator). Sandbox base URL: https://api.sandbox.pawapay.io */
  PAWAPAY_API_TOKEN: z.string().default(''),
  PAWAPAY_BASE_URL: z.string().default('https://api.pawapay.io'),
  PAWAPAY_CALLBACK_SECRET: z.string().default(''),
  /** Fallback support contact shown on the Help page when an admin has not set one for the country. Optional. */
  SUPPORT_PHONE: z.string().default(''),
  SUPPORT_WHATSAPP: z.string().default(''),
  SUPPORT_EMAIL: z.string().default(''),
  SUPPORT_HOURS: z.string().default(''),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const cfg = parsed.data;
  cfg.RATE_LIMIT_ENABLED ??= cfg.NODE_ENV === 'production';
  if (cfg.NODE_ENV === 'production') {
    // Test-only endpoints must never exist in production, whatever the env file says.
    cfg.ENABLE_TEST_ENDPOINTS = false;
    const problems: string[] = [];
    if (cfg.PAYMENT_PROVIDER_MODE === 'fake') problems.push('PAYMENT_PROVIDER_MODE=fake is not allowed in production');
    if (cfg.EMAIL_PROVIDER === 'console') problems.push('EMAIL_PROVIDER=console is not allowed in production');
    if (cfg.EMAIL_PROVIDER === 'smtp') {
      for (const k of ['MAIL_HOST', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_FROM_ADDRESS'] as const) {
        if (!cfg[k]) problems.push(k + ' must be set when EMAIL_PROVIDER=smtp');
      }
    }
    if (cfg.SESSION_SECRET.length < 32 || /change-?me/i.test(cfg.SESSION_SECRET)) problems.push('SESSION_SECRET must be a random string of at least 32 characters');
    if (!cfg.PUBLIC_API_URL.startsWith('https://')) problems.push('PUBLIC_API_URL must be https in production');
    if (!cfg.WEB_ORIGIN.startsWith('https://')) problems.push('WEB_ORIGIN must be https in production');
    // pawaPay is the live provider. It cannot sign callbacks, so the secret in the callback URL is the only authentication;
    // an empty secret would reject every real payment. (The direct MTN/Airtel/M-Pesa adapters are not required here.)
    if (cfg.PAWAPAY_CALLBACK_SECRET.length < 16) problems.push('PAWAPAY_CALLBACK_SECRET must be set (at least 16 characters)');
    // Google sign-in is optional, but half a configuration is a mistake that would fail at the first click.
    if (!!cfg.GOOGLE_CLIENT_ID !== !!cfg.GOOGLE_CLIENT_SECRET) problems.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together (or both left empty)');
    if (cfg.PAWAPAY_API_TOKEN.length === 0) problems.push('PAWAPAY_API_TOKEN must be set');
    if (problems.length > 0) throw new Error(`Unsafe production configuration: ${problems.join('; ')}`);
  }
  return cfg;
}
