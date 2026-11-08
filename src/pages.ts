export const PAGE_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store'
};

/** no-transform stops Cloudflare editing our HTML, such as injecting the zone's Web Analytics beacon. */
const HTML_CACHE = 'no-store, no-transform';
/** Login pages also send cookieless Plausible pageviews; the editor does not. */
export const LOGIN_HEADERS = { ...PAGE_HEADERS, 'Cache-Control': HTML_CACHE, 'Content-Security-Policy': PAGE_HEADERS['Content-Security-Policy'].replace("style-src 'self'", "img-src 'self' data:; style-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' https://plausible.io") };
const SUMMARY = 'Modifiez votre site. Edit your site. Edita tu sitio.';
const SHARE_IMAGE = 'https://login.yesid.dev/login/og.png';
/** One card for every address: it names no client, and a link preview cannot know the reader's language. */
const HEAD_BRAND = `<meta name="description" content="${SUMMARY}"><meta name="theme-color" content="#141414"><link rel="icon" href="/login/favicon-dark.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/login/apple-touch-icon.png">
<meta property="og:type" content="website"><meta property="og:site_name" content="yesid.dev"><meta property="og:title" content="login.yesid.dev"><meta property="og:description" content="${SUMMARY}"><meta property="og:image" content="${SHARE_IMAGE}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="yesid. login.yesid.dev"><meta name="twitter:card" content="summary_large_image">`;
interface Shell { title: string; heading: string; noscript: string; index?: boolean; page?: string }
/** The first paint before the app mounts, and what stays on screen if its bundle cannot load. */
const loginShell = ({ title, heading, noscript, index, page }: Shell) => `<!doctype html>
<html lang="fr"${page ? ` data-page="${page}"` : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${index ? '' : '<meta name="robots" content="noindex">'}<title>${title}</title>
${HEAD_BRAND}
<script src="/login/boot.js"></script>
<link rel="stylesheet" href="/login/fonts.css">
<link rel="stylesheet" href="/login/build/app.css">
</head><body><div id="app"><main class="startup-state"><p class="label-station">yesid. | login</p><h1>${heading}</h1><p role="status">…</p><nav><a href="/legal/privacy">Confidentialité · Privacy · Privacidad</a> <a href="/legal/terms">Conditions · Terms · Condiciones</a></nav></main></div>
<noscript>${noscript}</noscript>
<script type="module" src="/login/build/app.js"></script></body></html>`;
export const HOME_HTML = loginShell({ title: 'Connexion | yesid.dev', heading: 'Connexion · Sign in · Iniciar sesión', noscript: 'Activez JavaScript pour vous connecter. Enable JavaScript to sign in. Activa JavaScript para iniciar sesión.' });
const READ = 'Activez JavaScript pour lire cette page, ou écrivez à contact@yesid.dev. Enable JavaScript to read this page, or write to contact@yesid.dev. Activa JavaScript para leer esta página, o escribe a contact@yesid.dev.';
const PUBLIC_PAGES = {
  privacy: { title: 'Politique de confidentialité | yesid.dev', heading: 'Confidentialité · Privacy · Privacidad', noscript: READ, index: true },
  terms: { title: 'Conditions d’utilisation | yesid.dev', heading: 'Conditions · Terms · Condiciones', noscript: READ, index: true },
  'not-found': { title: 'Page introuvable | yesid.dev', heading: 'Page introuvable · Page not found · Página no encontrada', noscript: 'Cette page n’existe pas. This page does not exist. Esta página no existe.', page: 'not-found' }
};
export const POPUP_HTML = HOME_HTML;
export const EDITOR_HEADERS = { ...PAGE_HEADERS, 'Cache-Control': HTML_CACHE, 'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self' blob: data: https://www.githubstatus.com https://generativelanguage.googleapis.com; media-src 'self' blob:; frame-src blob:; worker-src blob:; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" };
export const editorHtml = (slug: string) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Éditeur du site</title>
${HEAD_BRAND}<script src="/login/boot.js"></script><link rel="stylesheet" href="/editor/start.css"><link rel="stylesheet" href="/login/fonts.css">
<link rel="stylesheet" href="/editor/theme.css">
<link rel="cms-config-url" href="/${slug}/config.yml" type="application/yaml"></head>
<body><script src="/editor/boot.js"></script></body></html>`;

export const publicHtml = (kind: keyof typeof PUBLIC_PAGES) => loginShell(PUBLIC_PAGES[kind]);
