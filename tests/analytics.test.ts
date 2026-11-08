import { test, expect } from 'bun:test';
import { analyticsPath, reducePageview } from '../login/analytics.ts';
import { EDITOR_HEADERS, LOGIN_HEADERS, PAGE_HEADERS } from '../src/pages.ts';

test('only fixed paths reach Plausible, never a client name or a typed address', () => {
  for (const path of ['/', '/account', '/auth/popup', '/legal/privacy', '/legal/terms']) expect(analyticsPath(path, false)).toBe(path);
  expect(analyticsPath('/vitreva/people', false)).toBe('/site/people');
  expect(analyticsPath('/someone@example.com', false)).toBe('/404');
  expect(analyticsPath('/vitreva/', false)).toBe('/404');
  expect(analyticsPath('/legal/privacy', true)).toBe('/404');
});

test('pageviews lose the query, hash, client name and referrer path; other events are dropped', () => {
  const sent = reducePageview({ n: 'pageview', d: 'login.yesid.dev', u: 'https://login.yesid.dev/vitreva/people?lang=en&utm_source=x#invite', r: 'https://mail.example.com/inbox/123', p: { email: 'a@b.c' }, v: 37 }, false);
  expect(sent).toEqual({ n: 'pageview', d: 'login.yesid.dev', u: 'https://login.yesid.dev/site/people', r: 'https://mail.example.com/', v: 37 });
  expect(reducePageview({ n: 'pageview', d: 'login.yesid.dev', u: 'https://login.yesid.dev/', r: 'javascript:alert(1)' }, false)?.r).toBeNull();
  expect(reducePageview({ n: 'Outbound Link: Click', d: 'login.yesid.dev', u: 'https://login.yesid.dev/' }, false)).toBeNull();
  expect(reducePageview({ n: 'pageview', d: 'login.yesid.dev', u: 'not a url' }, false)).toBeNull();
});

test('only login pages may reach Plausible', () => {
  expect(LOGIN_HEADERS['Content-Security-Policy']).toContain("connect-src 'self' https://plausible.io;");
  expect(PAGE_HEADERS['Content-Security-Policy']).not.toContain('plausible');
  expect(EDITOR_HEADERS['Content-Security-Policy']).not.toContain('plausible');
});

test('the privacy notice names Plausible in every language and drops the no-analytics promise', async () => {
  const { privacy } = await import('../login/legal/copy.ts');
  for (const language of ['fr', 'en', 'es'] as const) {
    const text = JSON.stringify(privacy[language]);
    expect(text.split('Plausible Insights OÜ')).toHaveLength(2);
    expect(text).toContain('plausible.io');
  }
  const source = await Bun.file('login/legal/copy.ts').text();
  for (const promise of ['no analytics', 'aucun outil d’analyse', 'sin herramientas de analítica']) expect(source).not.toContain(promise);
});
