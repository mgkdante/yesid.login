import { eligible } from './sites.ts';

/**
 * Read binding from D1, never from client claims or a cached auth payload. A bound session lives only while its
 * person is still an eligible member of that site; an unbound one, only for its first ten minutes.
 */
export async function sessionSite(db: D1Database, id: string): Promise<{ site_slug: string | null } | null> {
  return db.prepare(`SELECT site_slug FROM session WHERE id = ? AND (
      (site_slug IS NOT NULL AND EXISTS (SELECT 1 FROM membership m WHERE m.site_slug = session.site_slug AND m.user_id = session.userId AND ${eligible}))
      OR (site_slug IS NULL AND julianday(createdAt) >= julianday('now', '-10 minutes')))`).bind(id).first<{ site_slug: string | null }>();
}
