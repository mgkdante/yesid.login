import type { Site } from './guard.ts';

export const CONTENT_FILES = [/^src\/lib\/content\/[\w.-]+\.json$/, /^src\/lib\/content\/[a-z][a-z0-9-]*\/[\w.~-]+\.md$/, /^static\/images\/uploads\/[\w~-]+\.(webp|png|jpe?g|avif)$/];
const RESERVED = new Set(['auth', 'api', 'admin', 'login', 'editor', 'account', 'privacy', 'terms', 'legal', 'relay']);
export const validSlug = (slug: string): boolean => /^[a-z0-9][a-z0-9.-]{0,62}$/.test(slug) && !RESERVED.has(slug);
export interface ClientSite extends Site {
  slug: string;
  label: string;
  installation_id: string;
}
export function findSite(db: D1Database, slug: string): Promise<ClientSite | null> {
  if (!validSlug(slug)) return Promise.resolve(null);
  return db.prepare('SELECT slug, owner, repo, branch, label, installation_id FROM site WHERE slug = ?')
    .bind(slug).first<Omit<ClientSite, 'contentFiles'>>().then(row => row ? { ...row, contentFiles: CONTENT_FILES } : null);
}
export const eligible = "(m.role IN ('owner','it') OR m.confirmed_at IS NOT NULL OR m.invited_at > datetime('now','-7 days'))";
export const isMember = async (db: D1Database, slug: string, userId: string): Promise<boolean> =>
  !!await db.prepare(`SELECT role FROM membership m WHERE site_slug = ? AND user_id = ? AND ${eligible}`).bind(slug, userId).first();
/** Whether this address belongs to anyone with a site. Someone removed from their last site gets no codes. */
export const hasSite = async (db: D1Database, email: string): Promise<boolean> =>
  !!await db.prepare(`SELECT 1 FROM membership m JOIN user u ON u.id = m.user_id WHERE u.email = ? AND ${eligible} LIMIT 1`).bind(email.toLowerCase()).first();
export async function sitesFor(db: D1Database, userId: string) {
  const { results } = await db.prepare(`SELECT s.slug, s.label, m.role FROM site s
    JOIN membership m ON m.site_slug = s.slug WHERE m.user_id = ? AND ${eligible} ORDER BY s.label, s.slug`).bind(userId).all();
  return results;
}
