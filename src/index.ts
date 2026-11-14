import { sessionSite } from './session-site.ts';
import { scheduled } from './retention.ts';
import { SECURITY_HEADERS, publicHtml } from './pages.ts';
import { createAuth, codeDelivery, AUTH_BASE_PATH } from './auth.ts';
import { account, ACCOUNT_PATHS } from './account.ts';
import { confirmInvitations, retryNotices } from './invitations.ts';
import type { Editor } from './github.ts';
import type { Env } from './env.ts';
import { findSite, isMember, sitesFor, validSlug } from './sites.ts';
import { handleRest, handleGraphql } from './relay.ts';
import { siteConfig } from './config.ts';
import { POPUP_HTML, LOGIN_HEADERS, HOME_HTML, editorHtml, EDITOR_HEADERS } from './pages.ts';
import { confirmSignOut, page, denied, json, sameCodeFailure } from './responses.ts';
import { canManage, people } from './people.ts';
import { atLeast, claimCode } from './code-requests.ts';
import { ANALYTICS_ENDPOINT, relayAnalytics } from './analytics.ts';

type SessionLookup = (request: Request, env: Env, ctx: ExecutionContext) => Promise<(Editor & { sessionId?: string; siteSlug?: string | null }) | undefined>;
const authFor = (request: Request, env: Env, ctx: ExecutionContext) => createAuth({
  database: env.DB, origin: new URL(request.url).origin, secret: env.BETTER_AUTH_SECRET,
  sendCode: codeDelivery(request, env, ctx)
});
const currentEditor: SessionLookup = async (request, env, ctx) => {
  const token = request.headers.get('Authorization')?.match(/^(?:token|Bearer) ([^\s,]+)$/)?.[1];
  if (!token) return undefined;
  const session = await authFor(request, env, ctx).api.getSession({ headers: new Headers({ Authorization: `Bearer ${token}` }) });
  if (!session) return undefined;
  const binding = await sessionSite(env.DB, session.session.id);
  return binding ? { id: session.user.id, name: session.user.name, email: session.user.email, sessionId: session.session.id, siteSlug: binding.site_slug } : undefined;
};

/** Sessions travel only as bearer tokens: a leftover cookie must never stand in for a cleared token. */
async function withoutCookie(request: Request): Promise<Request> {
  if (!request.headers.has('Cookie')) return request;
  const headers = new Headers(request.headers);
  headers.delete('Cookie');
  // Rebuilt rather than copied: some runtimes keep the original headers when the replacement set is empty.
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
  return new Request(request.url, { method: request.method, headers, body });
}
function withoutSetCookie(response: Response): Response {
  if (!response.headers.has('Set-Cookie')) return response;
  const headers = new Headers(response.headers);
  headers.delete('Set-Cookie');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function authRoute(request: Request, env: Env, ctx: ExecutionContext, lookup: SessionLookup): Promise<Response | undefined> {
  const path = new URL(request.url).pathname;
  // Only auth requests are rebuilt: reading any other request's body here would leave it empty for its own route.
  if (!path.startsWith(`${AUTH_BASE_PATH}/`)) return undefined;
  request = await withoutCookie(request);
  if (request.headers.has('Authorization') && !['/get-session','/sign-out'].includes(path.slice(AUTH_BASE_PATH.length))) {
    const editor = await lookup(request, env, ctx);
    if (!editor) return denied('Sign in required', 401);
    if (!editor.siteSlug) return denied('Not allowed', 403);
  }
  if (path === `${AUTH_BASE_PATH}/get-session` && request.headers.has('Authorization') && !await lookup(request, env, ctx)) return denied('Sign in required', 401);
  if (path === `${AUTH_BASE_PATH}/sign-out`) {
    const response = await authFor(request, env, ctx).handler(request.clone() as Request);
    return confirmSignOut(response, !!await lookup(request, env, ctx));
  }
  if (ACCOUNT_PATHS.includes(path.slice(AUTH_BASE_PATH.length)) && path.startsWith(AUTH_BASE_PATH)) return account(request, env, ctx, authFor(request, env, ctx));
  if (path === `${AUTH_BASE_PATH}/email-otp/send-verification-otp`) {
    let body;
    try { body = await request.clone().json() as { type?: string; email?: unknown } | null; } catch { return denied('Invalid request', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return denied('Invalid request', 400);
    if (body.type === 'email-verification') return account(request, env, ctx, authFor(request, env, ctx));
    if (body.type !== 'sign-in') return denied('Not allowed', 403);
    // Same reply, same minimum time and same budget for every address, known or not.
    const started = Date.now();
    const claim = typeof body.email === 'string' ? await claimCode(env.DB, env.BETTER_AUTH_SECRET, body.email) : undefined;
    if (typeof body.email === 'string' && !claim) return atLeast(started, json({ success: true }));
    const response = await authFor(request, env, ctx).handler(request);
    // Refusals by the IP limit or validation give the claim back, so they cost the address nothing.
    if (claim && !response.ok) await claim.release();
    return atLeast(started, response);
  }
  if (path.startsWith(`${AUTH_BASE_PATH}/`) && !['/get-session', '/email-otp/send-verification-otp', '/sign-in/email-otp'].includes(path.slice(AUTH_BASE_PATH.length))) return denied('Not allowed', 403);
  if (path === `${AUTH_BASE_PATH}/sign-in/email-otp`) {
    const started = Date.now();
    const response = await authFor(request, env, ctx).handler(request);
    if (response.ok) {
      const token = response.headers.get('set-auth-token');
      if (token) {
        const session = await authFor(request, env, ctx).api.getSession({ headers: new Headers({ Authorization: `Bearer ${token}` }) });
        if (session) ctx.waitUntil(confirmInvitations(env, session.user.id));
      }
    }
    return atLeast(started, sameCodeFailure(response));
  }
  if (path.startsWith(`${AUTH_BASE_PATH}/`)) return authFor(request, env, ctx).handler(request);
  return undefined;
}
async function route(request: Request, env: Env, ctx: ExecutionContext, lookup: SessionLookup): Promise<Response> {
  const authResponse = await authRoute(request,env,ctx,lookup);
  if (authResponse) return withoutSetCookie(authResponse);
  const url = new URL(request.url), path = url.pathname;
  if (path === '/legal/privacy' || path === '/legal/terms') return page(publicHtml(path === '/legal/privacy' ? 'privacy' : 'terms', url.searchParams.get('lang')), 'text/html; charset=utf-8', LOGIN_HEADERS);
  if (path === ANALYTICS_ENDPOINT) return relayAnalytics(request);
  // The first published addresses, in case they were shared.
  if (path === '/privacy' || path === '/terms') return Response.redirect(`${url.origin}/legal${path}${url.search}`, 301);
  if (path === '/auth/popup') return page(POPUP_HTML, 'text/html; charset=utf-8', LOGIN_HEADERS);
  if (path === '/account') {
    // The browser must load a public shell to supply its localStorage bearer.
    if (!request.headers.has('Authorization')) return page(HOME_HTML, 'text/html; charset=utf-8', LOGIN_HEADERS);
    const editor = await lookup(request, env, ctx);
    if (!editor) return denied('Sign in required', 401);
    return editor.siteSlug ? page(HOME_HTML, 'text/html; charset=utf-8', LOGIN_HEADERS) : denied('Not allowed', 403);
  }
  if (path === '/') return page(HOME_HTML, 'text/html; charset=utf-8', LOGIN_HEADERS);
  if (path === '/admin' || path === '/admin/') return Response.redirect(`${url.origin}/`, 302);
  if (path.startsWith('/editor/') || path.startsWith('/login/')) return env.ASSETS.fetch(request);
  // Icon services read only the root /favicon.ico; nothing else at the root comes from assets.
  if (path === '/favicon.ico') return env.ASSETS.fetch(request);
  if (path === '/auth/bind') {
    const editor = await lookup(request, env, ctx);
    if (!editor) return denied('Sign in required', 401);
    if (request.method !== 'POST') return denied('Not allowed', 405);
    let slug;
    try { slug = (await request.json() as { slug?: unknown })?.slug; } catch { return denied('Invalid request', 400); }
    if (typeof slug !== 'string' || !validSlug(slug) || !await isMember(env.DB, slug, editor.id)) return denied('Not allowed', 403);
    if (!editor.sessionId) return denied('Not allowed', 403);
    await env.DB.prepare('UPDATE session SET site_slug = ? WHERE id = ? AND site_slug IS NULL').bind(slug, editor.sessionId).run();
    const bound = await sessionSite(env.DB, editor.sessionId);
    return bound?.site_slug === slug ? json({ success: true }) : denied('Not allowed', 403);
  }
  if (path === '/auth/sites') {
    if (request.method !== 'GET') return denied('Not allowed', 405);
    const editor = await lookup(request, env, ctx);
    return editor ? json((await sitesFor(env.DB, editor.id)).filter(site => !editor.siteSlug || site.slug === editor.siteSlug)) : denied('Sign in required', 401);
  }
  const [, slug, ...parts] = path.split('/');
  if (!validSlug(slug)) return notFound(request);
  const site = await findSite(env.DB, slug);
  if (!site) return notFound(request);
  const suffix = '/' + parts.join('/');
  if (parts.length === 0) return Response.redirect(`${url.origin}/${slug}/`, 302);
  if (suffix === '/') return page(editorHtml(slug), 'text/html; charset=utf-8', EDITOR_HEADERS);
  if (suffix === '/people') return page(HOME_HTML, 'text/html; charset=utf-8', LOGIN_HEADERS);
  if (suffix.startsWith('/people/')) {
    const editor = await lookup(request, env, ctx);
    if (!editor) return denied('Sign in required', 401);
    if (editor.siteSlug !== slug) return denied('Not allowed', 403);
    if (!await canManage(env.DB, slug, editor.id)) return denied('Not allowed', 403);
    if (request.method === 'GET') ctx.waitUntil(retryNotices(env, slug));
    return people(request, env, site, editor.id, suffix, ctx);
  }
  if (suffix !== '/config.yml' && suffix !== '/api/graphql' && !suffix.startsWith('/api/v3/')) return notFound(request);
  const editor = await lookup(request, env, ctx);
  if (!editor) return denied('Sign in required', 401);
  if (editor.siteSlug !== slug) return denied('Not allowed', 403);
  if (!await isMember(env.DB, slug, editor.id)) return denied('Not a member', 403);
  if (suffix === '/config.yml') {
    return request.method === 'GET' ? siteConfig(request, env, site, await caches.open('site-config')) : denied('Not allowed', 405);
  }
  if (suffix === '/api/graphql') return handleGraphql(request, env, ctx, editor, site);
  const scoped = new URL(url); scoped.pathname = suffix;
  return handleRest(request, scoped, env, ctx, editor, site);
}
/** True only when the client lists text/html with a quality above zero. */
const acceptsHtml = (accept: string | null) => (accept ?? '').split(',').some(range => {
  const [type, ...params] = range.split(';').map(part => part.trim().toLowerCase());
  const quality = params.find(param => param.startsWith('q='))?.slice(2);
  return type === 'text/html' && (quality === undefined || Number(quality) > 0);
});
function notFound(request: Request): Response {
  const path = new URL(request.url).pathname;
  const api = /\/(?:api|auth)(?:\/|$)|\/people\/|\/config\.yml$/.test(path);
  if (api || !acceptsHtml(request.headers.get('Accept'))) return denied('Not found', 404);
  return new Response(publicHtml('not-found'), { status: 404, headers: { ...LOGIN_HEADERS, 'Content-Type': 'text/html; charset=utf-8' } });
}
const PRODUCTION_HOST = 'login.yesid.dev';
/** Decided by the address, not a setting: staging and local copies ask crawlers to keep out. */
function indexing(request: Request, response: Response): Response {
  if (new URL(request.url).hostname === PRODUCTION_HOST) return response;
  const copy = new Response(response.body, response);
  copy.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return copy;
}
/** Dependency injection for session resolution, with no environment-controlled bypass. */
export const createHandler = (lookup: SessionLookup = currentEditor) => async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
  let response: Response;
  try {
    const url = new URL(request.url);
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      url.protocol = 'https:';
      response = request.method === 'GET' || request.method === 'HEAD'
        ? Response.redirect(url.href, 301) : denied('HTTPS required', 403);
    } else response = await route(request, env, ctx, lookup);
  }
  catch (error) {
    // Only the error's kind: a message can carry an address or a path.
    console.error('Request failed', error instanceof Error ? error.name : 'unknown');
    response = denied('Service temporarily unavailable', 502);
  }
  const copy = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (name === 'Strict-Transport-Security' || name === 'Permissions-Policy' || !copy.headers.has(name)) copy.headers.set(name, value);
  }
  return indexing(request, copy);
};
export default { fetch: createHandler(), scheduled } satisfies ExportedHandler<Env>;
