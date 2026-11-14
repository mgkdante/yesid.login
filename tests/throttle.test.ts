import { test, expect } from 'bun:test';
import { throttleMessage, type Locale } from '../login/copy.ts';
import { retryMinutes } from '../login/controller.ts';
const messages: Record<Locale, string[]> = {
  en: ['Too many requests. Try again later.', 'Too many requests. Try again in 1 minute.', 'Too many requests. Try again in 2 minutes.'],
  fr: ['Trop de demandes. Réessayez plus tard.', 'Trop de demandes. Réessayez dans 1 minute.', 'Trop de demandes. Réessayez dans 2 minutes.'],
  es: ['Demasiadas solicitudes. Inténtalo más tarde.', 'Demasiadas solicitudes. Inténtalo en 1 minuto.', 'Demasiadas solicitudes. Inténtalo en 2 minutos.']
};
for (const locale of ['en', 'fr', 'es'] as const) {
  test(`S-12: sign-in and Account format authoritative waits in ${locale}`, () => {
    for (const [index, header] of [undefined, '60', '61'].entries()) {
      const response = new Response(null, { headers: header === undefined ? {} : { 'X-Retry-After': header } });
      expect(throttleMessage(locale, retryMinutes(response))).toBe(messages[locale][index]);
    }
  });
}
