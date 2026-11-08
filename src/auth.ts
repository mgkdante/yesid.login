import { alertFailure } from './alerts.ts';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { bearer, emailOTP } from 'better-auth/plugins';
import { emailLanguage, emailTheme, passcodeEmail, type EmailTheme, type EmailLanguage } from './email.ts';
import type { Env } from './env.ts';
import { hasSite } from './sites.ts';

export const AUTH_BASE_PATH = '/auth/api';

const SESSION_SECONDS = 8 * 60 * 60;
const CODE_SECONDS = 5 * 60;
const TEN_MINUTES = 10 * 60;

type SendCode = (email: string, code: string, type: string) => void;

interface AuthInput {
  database: BetterAuthOptions['database'];
  origin: string;
  secret: string;
  sendCode: SendCode;
}

/**
 * Only people already in the database can sign in, by a short-lived hashed code. These settings
 * are not Better Auth's defaults: by default it stores codes in plain text and signs up strangers.
 */
export const authOptions = ({ database, origin, secret, sendCode }: AuthInput): BetterAuthOptions => ({
  database,
  secret,
  baseURL: origin,
  basePath: AUTH_BASE_PATH,
  trustedOrigins: [origin],
  emailAndPassword: { enabled: false },
  session: { expiresIn: SESSION_SECONDS, updateAge: SESSION_SECONDS },
  // The schema comes from our own migrations, so the library need not inspect the database on every request.
  advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] }, database: { validateSchema: false } },
  // The library's own logs can carry an error's message, and with it an address. Only kinds reach ours.
  logger: { log: level => console.error('Auth library message', level) },
  // Unexpected errors go to our handler, which logs only their kind; expected ones still become replies.
  onAPIError: { throw: true },
  rateLimit: {
    enabled: true,
    storage: 'database',
    customRules: {
      '/email-otp/request-email-change': { window: TEN_MINUTES, max: 5 },
      '/email-otp/change-email': { window: TEN_MINUTES, max: 10 },
      '/email-otp/send-verification-otp': { window: TEN_MINUTES, max: 5 },
      '/sign-in/email-otp': { window: TEN_MINUTES, max: 10 },
      '/email-otp/check-verification-otp': { window: TEN_MINUTES, max: 10 },
      '/email-otp/verify-email': { window: TEN_MINUTES, max: 10 }
    }
  },
  databaseHooks: { session: { create: { before: async session => ({ data: { ...session, ipAddress: '', userAgent: '' } }) } } },
  plugins: [
    // Signed tokens only, so reading the session table is not enough to sign in.
    bearer({ requireSignature: true }),
    emailOTP({
      disableSignUp: true,
      storeOTP: 'hashed',
      expiresIn: CODE_SECONDS,
      allowedAttempts: 3,
      changeEmail: { enabled: true, verifyCurrentEmail: true },
      async sendVerificationOTP({ email, otp, type }) {
        sendCode(email, otp, type);
      }
    })
  ]
});

/** Unexpected library errors still become a plain 500, as before, but only their kind reaches the logs. */
export const createAuth = (input: AuthInput) => {
  const auth = betterAuth(authOptions(input));
  const handler = auth.handler;
  auth.handler = async (request: Request) => {
    try { return await handler(request); }
    catch (error) {
      console.error('Auth library error', error instanceof Error ? error.name : 'unknown');
      return new Response(null, { status: 500 });
    }
  };
  return auth;
};

/** Sends a code only to someone with a site. The caller sees the same reply either way. */
export async function deliverCode(env: Env, email: string, code: string, language: EmailLanguage, theme: EmailTheme = 'dark'): Promise<void> {
  if (await hasSite(env.DB, email)) await sendCodeByEmail(env.RESEND_API_KEY, env.EMAIL_FROM, email, code, language, theme, env);
}

/** Sends the code through Resend. Failures reach the Worker's log, never the person signing in. */
export async function sendCodeByEmail(apiKey: string, from: string, email: string, code: string, language: EmailLanguage = 'fr', theme: EmailTheme = 'dark', alertEnv?: Env): Promise<void> {
  try {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: email, ...passcodeEmail(code, language, theme) }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) { console.error('Resend refused the email', response.status); if (alertEnv) await alertFailure(alertEnv, 'code-email', response.status); }
  } catch { console.error('Resend email unavailable'); if (alertEnv) await alertFailure(alertEnv, 'code-email'); }
}

export function codeDelivery(request: Request, env: Env, ctx: ExecutionContext): SendCode {
  const language = emailLanguage(request.headers.get('X-Login-Language'));
  const theme = emailTheme(request.headers.get('X-Login-Theme'));
  return (email, code, type) => ctx.waitUntil(type === 'change-email' || type === 'email-verification'
    ? sendCodeByEmail(env.RESEND_API_KEY, env.EMAIL_FROM, email, code, language, theme, env)
    : deliverCode(env, email, code, language, theme));
}
