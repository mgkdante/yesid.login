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
      const root = { dataset: {} as Record<string, string> };
      runInNewContext(source, {
        document: { documentElement: root, querySelector: () => null }, localStorage: { getItem: () => stored },
        matchMedia: () => ({ matches: systemDark })
      });
      expect(root.dataset.theme).toBe(stored === 'dark' || stored === 'light' ? stored : systemDark ? 'dark' : 'light');
    }
  }
});
