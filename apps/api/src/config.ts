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
  /** Who is emailed when the app breaks for a user (5xx, a failing background job, a crash). Production default: the
   * owner (the same address as the uptime monitor). `off` turns it off. Empty outside production = off. */
  ERROR_ALERT_TO: z.string().default(''),
  /** Nobody can start a full exam without an account, and a guest's old finished attempt shows its marks and review only after they sign up. */
  REQUIRE_ACCOUNT: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  ENABLE_TEST_ENDPOINTS: bool,
  /** Per-IP rate limits. Default: on in production, off elsewhere (the e2e suites make many sign-ups from one IP). */
  RATE_LIMIT_ENABLED: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  /** Public URL operators call back to (webhooks). */
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  FAKE_WEBHOOK_SECRET: z.string().default('fake-webhook-secret-dev-only'),
  /** M-Pesa is the only direct (non-pawaPay) adapter left — MTN MoMo and Airtel Money's direct adapters were retired
   * once pawaPay became the sole live provider (see registry.ts and the production check below). */
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
  /** AI interview preparation. Off until switched on: the nav item, routes and the interview plan stay hidden. */
  INTERVIEW_PREP_ENABLED: bool,
  /** The interviewer (Claude through OpenRouter's Anthropic-compatible API). Empty key = the scripted fake (dev/test). */
  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api'),
  INTERVIEW_MODEL: z.string().min(1).default('anthropic/claude-haiku-5.5'),
  /** Speech to text (Groq Whisper). Empty key = the fake transcriber (dev/test). */
  GROQ_API_KEY: z.string().default(''),
  GROQ_BASE_URL: z.string().url().default('https://api.groq.com/openai/v1'),
  GROQ_STT_MODEL: z.string().min(1).default('whisper-large-v3'),
  /** 32 random bytes, base64: encrypts interview transcripts, job descriptions and reports at rest. */
  DATA_ENCRYPTION_KEY: z.string().default(''),
  /** Free interview minutes every account gets once. */
  INTERVIEW_TRIAL_MINUTES: z.coerce.number().int().nonnegative().default(5),
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
  if (!cfg.ERROR_ALERT_TO && cfg.NODE_ENV === 'production') cfg.ERROR_ALERT_TO = 'ishimweeliab0@gmail.com';
  if (cfg.ERROR_ALERT_TO === 'off') cfg.ERROR_ALERT_TO = '';
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
    // an empty secret would reject every real payment. (M-Pesa's direct adapter is not required here; MTN MoMo and
    // Airtel Money no longer have direct adapters at all — pawaPay is the only path to those operators now.)
    if (cfg.PAWAPAY_CALLBACK_SECRET.length < 16) problems.push('PAWAPAY_CALLBACK_SECRET must be set (at least 16 characters)');
    // Google sign-in is optional, but half a configuration is a mistake that would fail at the first click.
    if (!!cfg.GOOGLE_CLIENT_ID !== !!cfg.GOOGLE_CLIENT_SECRET) problems.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together (or both left empty)');
    if (cfg.PAWAPAY_API_TOKEN.length === 0) problems.push('PAWAPAY_API_TOKEN must be set');
    if (cfg.INTERVIEW_PREP_ENABLED) {
      // The fakes would answer every candidate with scripted text and never charge real usage.
      if (!cfg.OPENROUTER_API_KEY) problems.push('OPENROUTER_API_KEY must be set when INTERVIEW_PREP_ENABLED=true');
      if (!cfg.GROQ_API_KEY) problems.push('GROQ_API_KEY must be set when INTERVIEW_PREP_ENABLED=true');
      if (Buffer.from(cfg.DATA_ENCRYPTION_KEY, 'base64').length !== 32) problems.push('DATA_ENCRYPTION_KEY must be 32 random bytes, base64 (openssl rand -base64 32)');
    }
    if (problems.length > 0) throw new Error(`Unsafe production configuration: ${problems.join('; ')}`);
  }
  return cfg;
}
