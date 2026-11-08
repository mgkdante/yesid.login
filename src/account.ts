import { sessionSite } from './session-site.ts';
import { alertFailure } from './alerts.ts';
import { z } from 'zod';
import type { createAuth } from './auth.ts';
import type { Env } from './env.ts';
import { emailChangedEmail, emailLanguage } from './email.ts';
import { denied, json, sameCodeFailure } from './responses.ts';

export const ACCOUNT_PATHS = ['/email-otp/request-email-change', '/email-otp/change-email'];
/** Better Auth owns verification and binds the code to the signed-in user and destination. */
export async function account(request: Request, env: Env, ctx: ExecutionContext, auth: ReturnType<typeof createAuth>): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return denied('Sign in required', 401);
  const binding = await sessionSite(env.DB, session.session.id);
  if (!binding) return denied('Sign in required', 401);
  if (!binding.site_slug) return denied('Not allowed', 403);
  if (request.method !== 'POST') return denied('Not allowed', 405);
  let body;
  try { body = await request.clone().json() as unknown; }
  catch { return denied('Invalid email', 400); }
  const current = new URL(request.url).pathname.endsWith('/send-verification-otp');
  if (!current && !z.object({ newEmail: z.email() }).safeParse(body).success) return denied('Invalid email', 400);
  if (current || new URL(request.url).pathname.endsWith('/request-email-change')) {
    const budget = await env.DB.prepare(`INSERT INTO email_change_budget (user_id,started_at)
      SELECT ?,unixepoch() WHERE (SELECT count(*) FROM email_change_budget
        WHERE user_id = ? AND started_at > unixepoch()-3600) < 5 RETURNING id`)
      .bind(session.user.id,session.user.id).first();
    if (!budget) return denied('Try later', 429);
  }
  if (current) {
    const headers = new Headers(request.headers);
    request = new Request(request.url, { method: 'POST', headers, body: JSON.stringify({ email: session.user.email, type: 'email-verification' }) });
  }
  const response = await auth.handler(request);
  if (current) return response.ok ? json({ success: true }) : sameCodeFailure(response);
  if (new URL(request.url).pathname.endsWith('/request-email-change')) {
    if (response.ok) return json({ success: true });
    return sameCodeFailure(response);
  }
  if (!response.ok) return sameCodeFailure(response);
  ctx.waitUntil(notifyOldAddress(env, session.user.email, emailLanguage(request.headers.get('X-Login-Language'))));
  return response;
}
async function notifyOldAddress(env: Env, email: string, language: ReturnType<typeof emailLanguage>): Promise<void> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: email, ...emailChangedEmail(language) }), signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) { console.error('Email change notification refused', response.status); await alertFailure(env, 'old-address-notice', response.status); }
  } catch { console.error('Email change notification unavailable'); await alertFailure(env, 'old-address-notice'); }
}
