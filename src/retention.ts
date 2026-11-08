import { alertFailure } from './alerts.ts';
import type { Env } from './env.ts';

/**
 * The hourly run deletes rate-limit rows, which hold IP addresses, once they are 23 hours old. With one run an hour,
 * no row outlives 24 hours, as the privacy policy says. The daily run does everything else.
 */
export const IP_CRON = '47 * * * *';
const ipStatement = (db: D1Database, now: string) =>
  // Better Auth stores lastRequest as Unix milliseconds. All rate windows are at most ten minutes.
  db.prepare("DELETE FROM rateLimit WHERE lastRequest < unixepoch(?, '-23 hours') * 1000").bind(now);

/** UTC instants are normalized before comparing mixed SQLite and ISO timestamps. */
export function retentionStatements(db: D1Database, now: string) {
  return [
    db.prepare("DELETE FROM edit_log WHERE julianday(created_at) < julianday(?, '-12 months')").bind(now),
    db.prepare("DELETE FROM people_log WHERE julianday(created_at) < julianday(?, '-12 months')").bind(now),
    db.prepare('DELETE FROM session WHERE julianday(expiresAt) <= julianday(?)').bind(now),
    db.prepare('DELETE FROM verification WHERE julianday(expiresAt) <= julianday(?)').bind(now),
    db.prepare("DELETE FROM email_change_budget WHERE started_at < unixepoch(?, '-1 day')").bind(now),
    db.prepare("DELETE FROM code_budget WHERE started_at < unixepoch(?, '-1 day')").bind(now),
    ipStatement(db, now),
    db.prepare(`DELETE FROM user WHERE NOT EXISTS (SELECT 1 FROM membership WHERE user_id = user.id)
      AND NOT EXISTS (SELECT 1 FROM edit_log WHERE editor_id = user.id)
      AND NOT EXISTS (SELECT 1 FROM people_log WHERE actor_id = user.id OR target_id = user.id)
      AND NOT EXISTS (SELECT 1 FROM invitation_notice WHERE user_id = user.id)`)
  ];
}

/** One atomic batch, including account and budget cascades. No addresses enter logs. */
export async function retain(db: D1Database, now = new Date().toISOString()): Promise<number[]> {
  const results = await db.batch(retentionStatements(db, now));
  return results.map(result => result.meta.changes);
}
export async function retainIps(db: D1Database, now = new Date().toISOString()): Promise<number> {
  return (await ipStatement(db, now).run()).meta.changes;
}
export const scheduled: ExportedHandlerScheduledHandler<Env> = async (event, env, ctx) => {
  try {
    if (event.cron === IP_CRON) console.error('IP retention count', await retainIps(env.DB));
    else console.error('Retention counts', await retain(env.DB));
  } catch { console.error('Retention failed'); if (env.ALERT_EMAIL) ctx.waitUntil(alertFailure(env, 'retention')); }
};
