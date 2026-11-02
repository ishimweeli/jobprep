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
