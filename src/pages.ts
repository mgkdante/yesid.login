import { legalLabels } from '../login/legal/labels.ts';
import { legalLocale, legalPage, renderLegal, escapeLegal } from '../login/legal/render.ts';

/** Baseline for every Worker response; pages and assets may supply their own CSP. */
export const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
};

export const PAGE_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store'
};

/** no-transform stops Cloudflare editing our HTML, such as injecting the zone's Web Analytics beacon. */
const HTML_CACHE = 'no-store, no-transform';
/** Login pages send cookieless Plausible pageviews to this origin's relay only, so plausible.io stays out of connect-src. */
export const LOGIN_HEADERS = { ...PAGE_HEADERS, 'Cache-Control': HTML_CACHE, 'Content-Security-Policy': PAGE_HEADERS['Content-Security-Policy'].replace("style-src 'self'", "img-src 'self' data:; style-src 'self' 'unsafe-inline'") };
const SUMMARY = 'Modifiez votre site. Edit your site. Edita tu sitio.';
const SHARE_IMAGE = 'https://login.yesid.dev/login/og.png';
/** One card for every address: it names no client, and a link preview cannot know the reader's language. */
const HEAD_BRAND = `<meta name="description" content="${SUMMARY}"><meta name="theme-color" content="#141414"><link rel="icon" href="/login/favicon-dark.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/login/apple-touch-icon.png">
<meta property="og:type" content="website"><meta property="og:site_name" content="yesid.dev"><meta property="og:title" content="login.yesid.dev"><meta property="og:description" content="${SUMMARY}"><meta property="og:image" content="${SHARE_IMAGE}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="yesid. login.yesid.dev"><meta name="twitter:card" content="summary_large_image">`;
interface Shell { title: string; index?: boolean; page?: string; lang?: string; content: string; startup?: boolean }
/** The first paint before the app mounts, and what stays on screen if its bundle cannot load. */
const loginShell = ({ title, index, page, lang = 'fr', content, startup }: Shell) => `<!doctype html>
<html lang="${lang}"${startup ? ' data-login-startup' : ''}${page ? ` data-page="${page}"` : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${index ? '' : '<meta name="robots" content="noindex">'}<title>${title}</title>
${HEAD_BRAND}
<script src="/login/boot.js"></script>
<link rel="stylesheet" href="/login/fonts.css">
<link rel="stylesheet" href="/login/build/app.css">
</head><body><div id="app">${content}</div>
<script type="module" src="/login/start.js"></script></body></html>`;
const missingCopy = {
  fr: { loading: 'Chargement de la page…', nojs: 'Cette page est introuvable. Vérifiez l’adresse ou revenez à la connexion.', failure: 'Impossible de charger cette page. Rechargez la page ou contactez Yesid.' },
  en: { loading: 'Loading this page…', nojs: 'This page could not be found. Check the address or return to sign-in.', failure: 'We could not load this page. Reload the page or contact Yesid.' },
  es: { loading: 'Cargando esta página…', nojs: 'No se encontró esta página. Revisa la dirección o vuelve al inicio de sesión.', failure: 'No pudimos cargar esta página. Recarga la página o contacta a Yesid.' }
};
const startupCopy = {
  fr: { heading: 'Connexion', loading: 'Chargement de la connexion…', nojs: 'Activez JavaScript pour vous connecter. Rechargez ensuite cette page.', failure: 'Impossible de charger la connexion. Rechargez la page ou contactez Yesid.', reload: 'Recharger', contact: 'Contactez Yesid', missing: 'Page introuvable', reason: 'Vérifiez l’adresse ou revenez à la connexion.' },
  en: { heading: 'Sign in', loading: 'Loading sign-in…', nojs: 'Enable JavaScript to sign in. Then reload this page.', failure: 'We could not load sign-in. Reload the page or contact Yesid.', reload: 'Reload', contact: 'Contact Yesid', missing: 'Page not found', reason: 'Check the address or return to sign-in.' },
  es: { heading: 'Iniciar sesión', loading: 'Cargando el inicio de sesión…', nojs: 'Activa JavaScript para iniciar sesión. Luego recarga esta página.', failure: 'No pudimos cargar el inicio de sesión. Recarga la página o contacta a Yesid.', reload: 'Recargar', contact: 'Contacta a Yesid', missing: 'Página no encontrada', reason: 'Revisa la dirección o vuelve al inicio de sesión.' }
};
/** The legal locale allowlist also governs the first paint, before browser preferences are available. */
export function homeHtml(query?: unknown, missing = false) {
  const lang = legalLocale(query), text = startupCopy[lang], labels = legalLabels[lang];
  const status = missing ? missingCopy[lang] : text;
  return loginShell({ title: `${missing ? text.missing : text.heading} | yesid.dev`, lang, startup: true,
    page: missing ? 'not-found' : undefined,
    content: `<main class="startup-state"><p class="label-station">yesid. | login</p><h1>${missing ? text.missing : text.heading}</h1>
${missing ? `<p>${text.reason}</p><a href="/?lang=${lang}">${labels.back}</a>` : ''}
<p class="startup-status" role="status" data-startup-failure="${status.failure}">${status.loading}</p>
<noscript><link rel="stylesheet" href="/login/nojs.css"><p>${status.nojs}</p></noscript>
<p><a href="">${text.reload}</a> <a href="mailto:contact@yesid.dev">${text.contact}</a></p>
<nav><a href="/legal/privacy?lang=${lang}">${labels.privacy}</a> <a href="/legal/terms?lang=${lang}">${labels.terms}</a></nav></main>` });
}
export const EDITOR_HEADERS = { ...PAGE_HEADERS, 'Cache-Control': HTML_CACHE, 'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self' blob: data: https://www.githubstatus.com https://generativelanguage.googleapis.com; media-src 'self' blob:; frame-src blob:; worker-src blob:; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" };
export const editorHtml = (slug: string) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Éditeur du site</title>
${HEAD_BRAND}<script src="/login/boot.js"></script><link rel="stylesheet" href="/editor/start.css"><link rel="stylesheet" href="/login/fonts.css">
<link rel="stylesheet" href="/editor/theme.css">
<link rel="cms-config-url" href="/${slug}/config.yml" type="application/yaml"></head>
<body><script src="/editor/boot.js"></script></body></html>`;

export const publicHtml = (kind: 'privacy' | 'terms' | 'not-found', query?: unknown) => {
  if (kind === 'not-found') return homeHtml(query, true);
  const lang = legalLocale(query), text = legalPage(kind, lang);
  return loginShell({ title: escapeLegal(text.title) + ' | yesid.dev', index: true,
    lang, content: `<div class="shell">${renderLegal(text, lang)}</div>` });
};
