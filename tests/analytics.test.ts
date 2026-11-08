import { test, expect, afterEach } from 'bun:test';
import * as client from '../login/analytics.ts';
import { ANALYTICS_DOMAIN, ANALYTICS_ENDPOINT, relayAnalytics } from '../src/analytics.ts';
import { createHandler } from '../src/index.ts';
import { validSlug } from '../src/sites.ts';
import { EDITOR_HEADERS, LOGIN_HEADERS, PAGE_HEADERS } from '../src/pages.ts';
import type { Env } from '../src/env.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const pageview = (u = 'https://login.yesid.dev/site/people', d = 'login.yesid.dev') => JSON.stringify({ n: 'pageview', v: 37, u, d, r: null });
const post = (body: string, headers: Record<string, string> = { 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'Test browser' }, url = 'https://login.yesid.dev/relay/e') =>
  new Request(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain', Cookie: 'private=1', ...headers } });
const upstream = () => {
  const sent: { url: string; init: RequestInit }[] = [];
  const send = (async (url: string, init: RequestInit) => { sent.push({ url, init }); return new Response('ok', { status: 202 }); }) as unknown as typeof fetch;
  return { sent, send };
};

test('the page and the Worker agree on the one site and the relay path', () => {
  expect(client.ANALYTICS_DOMAIN).toBe(ANALYTICS_DOMAIN);
  expect(client.ANALYTICS_ENDPOINT).toBe(ANALYTICS_ENDPOINT);
  expect(ANALYTICS_DOMAIN).toBe('login.yesid.dev');
  expect(ANALYTICS_ENDPOINT).toBe('/relay/e');
  expect(validSlug('relay')).toBe(false);
});

test('only fixed paths reach Plausible, never a client name or a typed address', () => {
  for (const path of ['/', '/account', '/auth/popup', '/legal/privacy', '/legal/terms']) expect(client.analyticsPath(path, false)).toBe(path);
  expect(client.analyticsPath('/vitreva/people', false)).toBe('/site/people');
  expect(client.analyticsPath('/someone%40example.com', false)).toBe('/404');
  expect(client.analyticsPath('/vitreva/', false)).toBe('/404');
  expect(client.analyticsPath('/legal/privacy', true)).toBe('/404');
});

test('the relay forwards one pageview once, with the IP and User-Agent and nothing else', async () => {
  const { sent, send } = upstream();
  const response = await relayAnalytics(post(pageview()), send);
  expect(response.status).toBe(202);
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe('https://plausible.io/api/event');
  const headers = new Headers(sent[0].init.headers);
  expect(headers.get('X-Forwarded-For')).toBe('203.0.113.7');
  expect(headers.get('User-Agent')).toBe('Test browser');
  expect(headers.has('Cookie')).toBe(false);
  expect(sent[0].init.body).toBe(pageview());
});

test('the relay refuses other sites, other hosts, other methods and missing addresses without sending', async () => {
  const { sent, send } = upstream();
  expect((await relayAnalytics(post(pageview('https://login.yesid.dev/', 'yesid.dev')), send)).status).toBe(400);
  expect((await relayAnalytics(post(pageview('https://yesid-login.workers.dev/'), undefined, 'https://yesid-login.workers.dev/relay/e'), send)).status).toBe(400);
  expect((await relayAnalytics(new Request('https://login.yesid.dev/relay/e', { headers: { 'CF-Connecting-IP': '203.0.113.7' } }), send)).status).toBe(405);
  expect((await relayAnalytics(post(pageview(), { 'User-Agent': 'Test browser' }), send)).status).toBe(400);
  expect((await relayAnalytics(post('x'.repeat(5000)), send)).status).toBe(413);
  expect(sent).toHaveLength(0);
});

test('a failed upstream is reported, not retried', async () => {
  let calls = 0;
  const send = (async () => { calls++; return new Response('', { status: 500 }); }) as unknown as typeof fetch;
  expect((await relayAnalytics(post(pageview()), send)).status).toBe(502);
  expect(calls).toBe(1);
});

test('the Worker routes /relay/e to the relay before any site lookup', async () => {
  const { sent, send } = upstream();
  globalThis.fetch = send;
  const env = { DB: { prepare: () => { throw Error('no database for analytics'); } } } as unknown as Env;
  const response = await createHandler(async () => undefined)(post(pageview()), env, { waitUntil() {} } as unknown as ExecutionContext);
  expect(response.status).toBe(202);
  expect(sent).toHaveLength(1);
});

test('no page may talk to plausible.io directly', () => {
  for (const headers of [LOGIN_HEADERS, PAGE_HEADERS, EDITOR_HEADERS]) expect(headers['Content-Security-Policy']).not.toContain('plausible');
  expect(LOGIN_HEADERS['Content-Security-Policy']).toContain("connect-src 'self';");
});

test('the privacy notice names Plausible and the relay in every language, with no blocking opt-out', async () => {
  const { privacy } = await import('../login/legal/copy.ts');
  for (const language of ['fr', 'en', 'es'] as const) {
    const text = JSON.stringify(privacy[language]);
    expect(text.split('Plausible Insights OÜ')).toHaveLength(2);
    expect(text).toContain('login.yesid.dev, ');
    expect(text).not.toContain('plausible.io');
  }
  const source = await Bun.file('login/legal/copy.ts').text();
  for (const promise of ['no analytics', 'aucun outil d’analyse', 'sin herramientas de analítica']) expect(source).not.toContain(promise);
});
