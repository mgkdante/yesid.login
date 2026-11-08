import { createAnalytics } from '@yesid/analytics/client';
import { defineAnalyticsPreset } from '@yesid/analytics/config';

/** The Plausible site for these pages only. Never yesid.dev: each subdomain is its own site. */
export const ANALYTICS_DOMAIN = 'login.yesid.dev';
/** Same-origin route the Worker forwards to Plausible; browsers that block plausible.io allow it. */
export const ANALYTICS_ENDPOINT = '/relay/e';
const PRESET = defineAnalyticsPreset({ events: [] });
const KNOWN_PATHS = new Set(['/', '/account', '/auth/popup', '/legal/privacy', '/legal/terms']);

/** Reduces a page path to one of a few fixed paths, so no client name or typed address leaves the browser. */
export function analyticsPath(pathname: string, notFound: boolean): string {
  if (notFound) return '/404';
  if (KNOWN_PATHS.has(pathname)) return pathname;
  return /^\/[^/]+\/people$/.test(pathname) ? '/site/people' : '/404';
}

let started = false;

/** Counts this page once with cookieless Plausible, through the Worker's relay, only on the production host. */
export function startAnalytics(): void {
  if (started) return;
  started = true;
  const notFound = document.documentElement.dataset.page === 'not-found';
  try {
    createAnalytics(PRESET, { domain: ANALYTICS_DOMAIN, endpoint: ANALYTICS_ENDPOINT, reducePath: path => analyticsPath(path, notFound) });
  } catch {}
}
