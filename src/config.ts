import type { Env } from './env.ts';
import type { ClientSite } from './sites.ts';
import { forward } from './github.ts';
import { githubToken } from './relay.ts';
import { denied } from './responses.ts';

/** The shared copy stays inside this Worker. What leaves it is for one signed-in member only. */
const forMember = (stored: Response): Response => new Response(stored.body, {
  headers: { 'Content-Type': 'application/yaml; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

export async function siteConfig(request: Request, env: Env, site: ClientSite, cache: Cache): Promise<Response> {
  // Include the current repository and branch so a reassigned slug cannot reuse an old file.
  const key = new Request(new URL(`/__config/${site.slug}/${encodeURIComponent(site.owner)}/${encodeURIComponent(site.repo)}/${encodeURIComponent(site.branch)}/${site.installation_id}`, request.url));
  const cached = await cache.match(key);
  if (cached) return forMember(cached);
  try {
    const path = `/repos/${site.owner}/${site.repo}/contents/cms/config.yml?ref=${encodeURIComponent(site.branch)}`;
    const response = await forward(path, { headers: { Accept: 'application/vnd.github.raw+json' } }, await githubToken(env, site));
    if (!response.ok) {
      console.error('GitHub refused a site configuration', site.slug, response.status);
      return denied('Configuration indisponible depuis GitHub. Réessayez dans un instant.', 502);
    }
    const stored = new Response(await response.arrayBuffer(), { headers: { 'Cache-Control': 'public, max-age=60' } });
    await cache.put(key, stored.clone());
    return forMember(stored);
  } catch (error) {
    console.error('Site configuration failed', site.slug, error instanceof Error ? error.name : 'unknown');
    return denied('Configuration indisponible depuis GitHub. Réessayez dans un instant.', 502);
  }
}
