import { init, type PlausibleRequestPayload } from '@plausible-analytics/tracker';

export const ANALYTICS_DOMAIN = 'login.yesid.dev';
const KNOWN_PATHS = new Set(['/', '/account', '/auth/popup', '/legal/privacy', '/legal/terms']);

/** Reduces a page address to one of a few fixed paths, so no client name, query or typed address leaves the browser. */
export function analyticsPath(pathname: string, notFound: boolean): string {
  if (notFound) return '/404';
  if (KNOWN_PATHS.has(pathname)) return pathname;
  return /^\/[^/]+\/people$/.test(pathname) ? '/site/people' : '/404';
}

/** Keeps only pageviews, with a reduced address and the referrer's origin. */
export function reducePageview(payload: PlausibleRequestPayload, notFound: boolean): PlausibleRequestPayload | null {
  if (payload.n !== 'pageview') return null;
  try {
    const url = new URL(payload.u);
    let referrer: string | null = null;
    try {
      const from = new URL(payload.r ?? '');
      if (from.protocol === 'https:' || from.protocol === 'http:') referrer = `${from.origin}/`;
    } catch {}
    const { p: _props, $: _revenue, ...rest } = payload;
    return { ...rest, u: `${url.origin}${analyticsPath(url.pathname, notFound)}`, r: referrer };
  } catch {
    return null;
  }
}

/** Counts the page with cookieless Plausible, only on the production host. */
export function startAnalytics(): void {
  if (location.hostname !== ANALYTICS_DOMAIN) return;
  const notFound = document.documentElement.dataset.page === 'not-found';
  try {
    init({ domain: ANALYTICS_DOMAIN, logging: false, bindToWindow: false, transformRequest: payload => reducePageview(payload, notFound) });
  } catch {}
}
