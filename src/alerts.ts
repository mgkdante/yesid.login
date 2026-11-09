import type { Env } from './env.ts';
export type AlertKind = 'retention' | 'code-email' | 'welcome-email' | 'owner-notice' | 'old-address-notice' | 'github-rate';
const HOUR_MS = 3600 * 1000;
/** Used only when the database itself is down, which is when an alert matters most. */
const isolateSent = new Map<AlertKind, number>();

/**
 * One alert per kind per rolling hour. Concurrent failures share the claim, a database outage falls back to a
 * per-isolate limit instead of silencing the alert, and an alert Resend refuses gives its hour back.
 */
export async function alertFailure(env: Env, kind: AlertKind, status?: number): Promise<void> {
  if (!env.ALERT_EMAIL) return;
  let claimed: number | undefined;
  try {
    const claim = await env.DB.prepare(`INSERT INTO alert_throttle(kind,sent_at) VALUES (?,unixepoch())
   ON CONFLICT(kind) DO UPDATE SET sent_at=unixepoch() WHERE sent_at <= unixepoch()-3600 RETURNING sent_at`).bind(kind).first<{ sent_at: number }>();
    if (!claim) return;
    claimed = claim.sent_at;
  } catch {
    const last = isolateSent.get(kind);
    if (last !== undefined && Date.now() - last < HOUR_MS) return;
    isolateSent.set(kind, Date.now());
  }
  let sent = false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: env.ALERT_EMAIL, subject: 'Login service failure', text: `Failure: ${kind}${status === undefined ? '' : `; HTTP ${status}`}` }),
      signal: AbortSignal.timeout(10000)
    });
    sent = response.ok;
    if (!response.ok) console.error('Alert email refused', response.status);
  } catch { console.error('Alert email unavailable'); }
  if (sent || claimed === undefined) return;
  try { await env.DB.prepare('DELETE FROM alert_throttle WHERE kind = ? AND sent_at = ?').bind(kind, claimed).run(); }
  catch { console.error('Alert claim not released'); }
}
