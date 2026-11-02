import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(45),
  OTP_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),
  PAYMENT_PROVIDER_MODE: z.enum(['fake', 'sandbox', 'live']).default('fake'),
  SMS_PROVIDER: z.enum(['console', 'live']).default('console'),
  ENABLE_TEST_ENDPOINTS: bool,
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
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production') {
    // Test-only endpoints must never exist in production, whatever the env file says.
    cfg.ENABLE_TEST_ENDPOINTS = false;
    if (cfg.PAYMENT_PROVIDER_MODE === 'fake') throw new Error('PAYMENT_PROVIDER_MODE=fake is not allowed in production');
    if (cfg.SMS_PROVIDER === 'console') throw new Error('SMS_PROVIDER=console is not allowed in production');
  }
  return cfg;
}
