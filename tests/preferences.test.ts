import { test, expect } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { resolveLocale } from '../login/preferences.ts';

test('language priority is query, storage, supported browser language, French', () => {
  expect(resolveLocale('es', 'en', ['fr-CA'])).toBe('es');
  expect(resolveLocale('invalid', 'en', ['fr-CA'])).toBe('en');
  expect(resolveLocale(null, null, ['de-DE', 'es-CO'])).toBe('es');
  expect(resolveLocale(null, null, ['de-DE'])).toBe('fr');
});

test('external boot uses system theme only when there is no valid explicit choice', async () => {
  const source = await Bun.file('public/login/boot.js').text();
  for (const systemDark of [true, false]) {
    for (const stored of [null, 'dark', 'light', 'invalid']) {
      const root = { dataset: {} as Record<string, string>, hasAttribute: () => false };
      runInNewContext(source, {
        window: { addEventListener: () => {} }, document: { documentElement: root, querySelector: () => null }, localStorage: { getItem: () => stored },
        matchMedia: () => ({ matches: systemDark })
      });
      expect(root.dataset.theme).toBe(stored === 'dark' || stored === 'light' ? stored : systemDark ? 'dark' : 'light');
    }
  }
});

test('theme boot adds no startup state or listeners to pages without a fallback', async () => {
  const root = { dataset: {} as Record<string, string>, hasAttribute: () => false };
  const listeners: string[] = [];
  runInNewContext(await Bun.file('public/login/boot.js').text(), {
    window: { addEventListener: (name: string) => listeners.push(name) },
    document: { documentElement: root, querySelector: () => null },
    localStorage: { getItem: () => null }, matchMedia: () => ({ matches: false })
  });
  expect(root.dataset.startup).toBeUndefined();
  expect(listeners).toEqual([]);
});

test('startup handles only its module loader and removes listeners on mount', async () => {
  const listeners = new Map<string, (event?: unknown) => void>();
  const root = { dataset: {} as Record<string, string>, lang: 'fr', hasAttribute: () => true };
  const status = { dataset: { startupFailure: 'localized failure' }, textContent: 'loading' };
  class Script { src = 'https://login.test/login/start.js'; }
  const window = {
    addEventListener: (name: string, callback: () => void) => listeners.set(name, callback),
    removeEventListener: (name: string) => listeners.delete(name)
  };
  runInNewContext(await Bun.file('public/login/boot.js').text(), {
    window, URL, HTMLScriptElement: Script,
    document: { documentElement: root, querySelector: (selector: string) => selector === '[data-startup-failure]' ? status : null },
    localStorage: { getItem: () => null }, matchMedia: () => ({ matches: false })
  });
  expect(listeners.has('unhandledrejection')).toBe(false);
  listeners.get('error')!({ target: { href: 'https://login.test/login/fonts.css' } });
  expect(status.textContent).toBe('loading');
  listeners.get('login-startup-mounted')!();
  expect(root.dataset.startup).toBe('mounted');
  expect(listeners.size).toBe(0);
});
