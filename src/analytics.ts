import { relayAnalyticsEvent } from '@yesid/analytics/relay';

/** Must match login/analytics.ts; a test keeps them equal. */
export const ANALYTICS_DOMAIN = 'login.yesid.dev';
export const ANALYTICS_ENDPOINT = '/relay/e';

/** Forwards one Plausible pageview from the login pages once, with the visitor's IP and User-Agent. */
export async function relayAnalytics(request: Request, send?: typeof fetch): Promise<Response> {
  const clientAddress = request.headers.get('CF-Connecting-IP');
  // Cloudflare always sets it; without it every visitor would look the same, so nothing is sent.
  if (!clientAddress) return new Response(null, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  return relayAnalyticsEvent(request, { domain: ANALYTICS_DOMAIN, clientAddress, ...(send && { fetch: send }) });
}
