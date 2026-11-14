import { language, type Locale } from './copy.ts';

export function resolveLocale(query: unknown, stored: unknown, browserLanguages: readonly string[]): Locale {
  return language(query) ?? language(stored)
    ?? browserLanguages.map(value => language(value.split('-')[0])).find(Boolean) ?? 'fr';
}

export function initialLocale(): Locale {
  const query = language(new URLSearchParams(location.search).get('lang'));
  let stored;
  try { stored = language(localStorage.getItem('login.language')); } catch { /* Browser fallback. */ }
  return resolveLocale(query, stored, navigator.languages);
}

export function savePreferences(locale: Locale, theme: string): void {
  try {
    localStorage.setItem('login.language', locale);
    const stored: unknown = JSON.parse(localStorage.getItem('sveltia-cms.prefs') || '{}');
    const prefs = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    localStorage.setItem('sveltia-cms.prefs', JSON.stringify({
      ...prefs, locale: { fr: 'fr', en: 'en-CA', es: 'es-CO' }[locale], theme
    }));
  } catch { /* Sign-in remains available when preference storage is blocked. */ }
}

export function localeHref(locale: string, hash = location.hash): string {
  const url = new URL(location.href);
  url.searchParams.set('lang', locale);
  return url.pathname + url.search + (location.pathname.startsWith('/legal/') ? hash : '');
}
