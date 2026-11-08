import { alertFailure } from './alerts.ts';
import type { Env } from './env.ts';
import { ownerNoticeEmail } from './email.ts';

const NOTICES = 'SELECT site_slug, user_id FROM invitation_notice';

/** A notice stays until the mail service accepts it. The stable key stops concurrent or repeated sends arriving twice. */
export async function confirmInvitations(env: Env, id: string): Promise<void> {
  await sendNotices(env, `${NOTICES} WHERE user_id = ?`, id);
}

/** Tries again whatever an earlier send couldn't deliver, when an Owner next opens their People page. */
export async function retryNotices(env: Env, slug: string): Promise<void> {
  await sendNotices(env, `${NOTICES} WHERE site_slug = ?`, slug);
}

async function sendNotices(env: Env, query: string, value: string): Promise<void> {
  try {
    const notices = await env.DB.prepare(query).bind(value).all<{ site_slug: string; user_id: string }>();
    for (const { site_slug: slug, user_id: id } of notices.results) {
      if (await notifyOwners(env, slug, id)) {
        await env.DB.prepare('DELETE FROM invitation_notice WHERE site_slug = ? AND user_id = ?').bind(slug, id).run();
      }
    }
  } catch { console.error('Invitation notification unavailable'); }
}

async function notifyOwners(env: Env, slug: string, id: string): Promise<boolean> {
  const rows = await env.DB.prepare(`SELECT o.id AS owner, o.email AS recipient, u.email, s.label FROM membership m
    JOIN user o ON o.id = m.user_id JOIN site s ON s.slug = m.site_slug JOIN user u ON u.id = ?
    WHERE m.site_slug = ? AND m.role = 'owner'`).bind(id, slug).all<{ owner: string; recipient: string; email: string; label: string }>();
  let accepted = true;
  for (const row of rows.results) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `invite-${slug}-${id}-${row.owner}` },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: row.recipient, ...ownerNoticeEmail(row.email, row.label, slug) }),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) { accepted = false; console.error('Invitation notification refused', response.status); await alertFailure(env, 'owner-notice', response.status); }
    } catch { accepted = false; console.error('Invitation notification unavailable'); await alertFailure(env, 'owner-notice'); }
  }
  return accepted;
}
