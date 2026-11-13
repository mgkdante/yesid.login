import { alertFailure } from './alerts.ts';
import { z } from 'zod';
import type { Env } from './env.ts';
import type { ClientSite } from './sites.ts';
import { eligible } from './sites.ts';
import { denied, json } from './responses.ts';
import { emailLanguage, welcomeEmail } from './email.ts';

export const canManage = async (db: D1Database, slug: string, id: string) => {
  const row = await db.prepare(`SELECT role FROM membership m WHERE site_slug = ? AND user_id = ? AND ${eligible}`).bind(slug, id).first<{ role: string }>();
  return row?.role === 'owner' || row?.role === 'it';
};
/** The same rule the sign-in service applies, so nobody is invited with an address that can't sign in. */
const address = (value: string): boolean => value.length <= 254 && value.split('@')[0].length <= 64 && z.email().safeParse(value).success;

async function welcome(request: Request, env: Env, site: ClientSite, email: string, ctx?: ExecutionContext) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: email, ...welcomeEmail(site.label, site.slug, emailLanguage(request.headers.get('X-Login-Language'))) }),
      signal: AbortSignal.timeout(10000)
    });
    if (response.ok) return true;
    console.error('Welcome email refused', response.status);
    ctx?.waitUntil(alertFailure(env, 'welcome-email', response.status));
  } catch { console.error('Welcome email unavailable'); ctx?.waitUntil(alertFailure(env, 'welcome-email')); }
  return false;
}
async function add(request: Request, env: Env, site: ClientSite, actor: string, ctx?: ExecutionContext) {
  let body: { email?: unknown };
  try { body = await request.json(); } catch { return denied('Invalid email', 400); }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!address(email)) return denied('Invalid email', 400);
  const db = env.DB;
  try {
    const result = await db.batch<{ status: 'pending' | 'active' | 'expired' }>([
      // D1 batches are transactions: classify the pre-change membership in the same snapshot.
      db.prepare(`SELECT CASE WHEN m.role <> 'employee' OR m.confirmed_at IS NOT NULL THEN 'active'
        WHEN m.invited_at > datetime('now','-7 days') THEN 'pending' ELSE 'expired' END AS status
        FROM membership m JOIN user u ON u.id = m.user_id WHERE m.site_slug = ? AND u.email = ?`).bind(site.slug, email),
      db.prepare(`INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt)
        VALUES (?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')) ON CONFLICT(email) DO NOTHING`).bind(crypto.randomUUID(), site.label, email),
      db.prepare(`INSERT INTO membership (site_slug,user_id,role,invited_at) SELECT ?, id, 'employee', datetime('now') FROM user WHERE email = ?
        ON CONFLICT(site_slug,user_id) DO UPDATE SET invited_at = datetime('now')
        WHERE membership.role = 'employee' AND membership.confirmed_at IS NULL AND membership.invited_at <= datetime('now','-7 days')`).bind(site.slug, email),
      db.prepare(`INSERT INTO people_log (site_slug,actor_id,action,target_id)
        SELECT ?, ?, 'add', id FROM user WHERE email = ? AND changes() > 0`).bind(site.slug, actor, email)
    ]);
    const changed = result[3].meta.changes > 0;
    const outcome = !changed ? 'unchanged' : result[0].results.length ? 'renewed' : 'added';
    return json({ success: true, outcome, ...(outcome === 'unchanged' ? { status: result[0].results[0].status } : {}), emailSent: changed ? await welcome(request, env, site, email, ctx) : false });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('people_capacity')) return denied('Site full', 409);
    if (message.includes('people_rate')) return denied('Try later', 429);
    console.error('People addition failed');
    return denied('Service unavailable', 502);
  }
}
async function remove(env: Env, site: ClientSite, actor: string, id: string) {
  const db = env.DB;
  const target = await db.prepare('SELECT role FROM membership WHERE site_slug = ? AND user_id = ?').bind(site.slug, id).first<{ role: string }>();
  if (!target) return denied('Not found', 404);
  if (target.role !== 'employee') return denied('Only Employees can be removed', 403);
  await db.batch([
    db.prepare("DELETE FROM membership WHERE site_slug = ? AND user_id = ? AND role = 'employee'").bind(site.slug, id),
    db.prepare(`INSERT INTO people_log (site_slug,actor_id,action,target_id) SELECT ?, ?, 'remove', ? WHERE changes() > 0`).bind(site.slug, actor, id),
    db.prepare('DELETE FROM session WHERE userId = ? AND site_slug = ?').bind(id, site.slug),
    db.prepare('DELETE FROM session WHERE userId = ? AND NOT EXISTS (SELECT 1 FROM membership WHERE user_id = ?)').bind(id, id)
  ]);
  return json({ success: true });
}
export async function people(request: Request, env: Env, site: ClientSite, actor: string, suffix: string, ctx?: ExecutionContext) {
  if (suffix === '/people/members') {
    if (request.method === 'POST') return add(request, env, site, actor, ctx);
    if (request.method === 'GET') {
      const rows = await env.DB.prepare(`SELECT u.id,u.email,m.role,
        CASE WHEN m.role <> 'employee' OR m.confirmed_at IS NOT NULL THEN 'active'
          WHEN m.invited_at > datetime('now','-7 days') THEN 'pending' ELSE 'expired' END AS status,
        (SELECT max(e.created_at) FROM edit_log e WHERE e.site_slug = m.site_slug AND e.editor_id = u.id) AS lastEdit FROM membership m JOIN user u ON u.id = m.user_id
        WHERE m.site_slug = ? ORDER BY u.email`).bind(site.slug).all();
      return json(rows.results);
    }
  }
  const id = suffix.match(/^\/people\/members\/([^/]+)$/)?.[1];
  if (id && request.method === 'DELETE') return remove(env, site, actor, id);
  return denied('Not allowed', 405);
}
