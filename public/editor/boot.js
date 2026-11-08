{
  let language = 'fr';
  try { language = localStorage.getItem('login.language') || 'fr'; } catch { /* Default language. */ }
  const words = { fr: ['Ouverture de votre éditeur', 'Éditeur indisponible. Rechargez la page.', 'Recharger', 'Confidentialité', 'Conditions'], en: ['Opening your editor', 'Editor unavailable. Reload the page.', 'Reload', 'Privacy', 'Terms'], es: ['Abriendo tu editor', 'Editor no disponible. Recarga la página.', 'Recargar', 'Privacidad', 'Condiciones'] }[language] || ['Opening your editor', 'Editor unavailable. Reload the page.', 'Reload', 'Privacy', 'Terms'];
  document.documentElement.lang = ['fr', 'en', 'es'].includes(language) ? language : 'fr';
  function showState(failed = false) {
    document.getElementById('editor-start')?.remove();
    const panel = document.createElement('main'); panel.id = 'editor-start';
    const brand = document.createElement('p'); brand.className = 'editor-station'; brand.textContent = 'yesid. | login';
    const title = document.createElement('h1'); title.textContent = words[failed ? 1 : 0];
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = failed ? '!' : '…';
    panel.append(brand, title, status);
    if (failed) { const retry = document.createElement('button'); retry.textContent = words[2]; retry.onclick = () => location.reload(); panel.append(retry); }
    const footer = document.createElement('footer');
    for (const [index, path] of ['privacy', 'terms'].entries()) { const link = document.createElement('a'); link.href = '/legal/' + path + '?lang=' + document.documentElement.lang; link.textContent = words[index + 3]; footer.append(link); }
    panel.append(footer); document.body.append(panel);
  }
  showState();
  const slug = location.pathname.split('/')[1];
  const KEY = 'login.session.' + slug;
  const legacy = 'sveltia-cms.user';
  const storage = globalThis.localStorage;
  storage.removeItem(legacy);
  // Pinned UE's async methods call these synchronous Storage methods at execution time.
  const scoped = new Proxy(storage, { get(target, property) {
    if (['getItem', 'setItem', 'removeItem'].includes(property)) return (key, ...args) => target[property](key === legacy ? KEY : key, ...args);
    if (property === 'clear') return () => target.removeItem(KEY);
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: scoped });
  const listen = window.addEventListener.bind(window);
  // Sveltia sees same-site events under its fixed key; foreign session events never reach it.
  window.addEventListener = (type, callback, options) => listen(type, type !== 'storage' ? callback : event => {
    if (event.key === legacy || (event.key?.startsWith('login.session.') && event.key !== KEY)) return;
    const mapped = event.key === KEY ? new Proxy(event, { get(target, property) {
      if (property === 'key') return legacy;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } }) : event;
    if (typeof callback === 'function') callback.call(window, mapped);
    else callback.handleEvent(mapped);
  }, options);
  const signIn = '/?site=' + encodeURIComponent(slug);
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  };
  const token = read()?.token;
  const leave = () => { localStorage.removeItem(KEY); location.replace(signIn); };
  const headers = { Authorization: 'Bearer ' + token };
  const nativeFetch = window.fetch.bind(window);
  async function validate() {
    try {
      const response = await nativeFetch('/auth/api/get-session', { headers });
      if (!response.ok) {
        if (response.status === 401) leave();
        else throw Error('Connexion indisponible. Rechargez la page.');
        return;
      }
      if (!(await response.json())?.session) { leave(); return; }
      const sites = await nativeFetch('/auth/sites', { headers });
      if (sites.status === 401) { leave(); return; }
      if (!sites.ok) throw Error('Sites indisponibles. Rechargez la page.');
      const site = (await sites.json()).find(site => site.slug === slug);
      if (!site) { location.replace('/'); return; }
      if (site.role === 'owner' || site.role === 'it') {
        const link = document.createElement('a');
        link.href = '/' + slug + '/people';
        link.className = 'login-people';
        const language = localStorage.getItem('login.language');
        link.textContent = language === 'en' ? 'People' : language === 'es' ? 'Personas' : 'Personnes';
        link.title = link.textContent; // The name that remains when the phone layout shows only the icon.
        // Over an open entry it would cover the form, and at the end of a page no scrolling moves it clear.
        const place = () => { link.hidden = /^#\/collections\/[^/]+\/(?:entries|new)(?:\/|$)/.test(location.hash); };
        window.addEventListener('hashchange', place);
        place();
        document.body.append(link);
      }
      const change = document.createElement('a');
      change.href = '/?site=' + encodeURIComponent(slug) + '&switch=1';
      change.textContent = language === 'fr' ? 'Changer de site' : language === 'es' ? 'Cambiar de sitio' : 'Switch sites';
      change.className = 'login-switch';
      const placeSwitch = () => { change.hidden = /^#\/collections\/[^/]+\/(?:entries|new)(?:\/|$)/.test(location.hash); };
      window.addEventListener('hashchange', placeSwitch); placeSwitch(); document.body.append(change);
      return true;
    } catch (error) { showState(true); return; }
  }
  let leaving = false;
  let nextAttempt = 0;
  async function signOut() {
    if (leaving || Date.now() < nextAttempt || read()?.token) return;
    leaving = true;
    try {
      const response = await nativeFetch('/auth/api/sign-out', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw Error('Déconnexion impossible. Nouvelle tentative en cours.');
      location.replace('/');
    } catch (error) {
      leaving = false;
      nextAttempt = Date.now() + 5000;
      showState(true);
    }
  }
  async function start() {
    if (!token) { leave(); return; }
    if (!await validate()) return;
    // Storage events cover other tabs; polling also observes Sveltia's same-tab writes and clear().
    setInterval(signOut, 500);
    window.addEventListener('storage', signOut);
    const config = '/' + slug + '/config.yml';
    window.fetch = async (...args) => {
      const url = new URL(args[0] instanceof Request ? args[0].url : args[0], location.href);
      const locale = url.href.match(/^https:\/\/unpkg\.com\/@sveltia\/cms@0\.261\.0\/locales\/(fr|es-CO|en-CA)\.json$/)?.[1];
      if (locale) return nativeFetch('/editor/locales/' + locale + '.json', { signal: args[1]?.signal });
      // Update discovery is deliberately pinned, with no third-party request or CSP exception.
      if (url.href === 'https://unpkg.com/@sveltia/cms/package.json') return new Response('{"version":"0.261.0"}', { headers: { 'Content-Type': 'application/json' } });
      const own = url.origin === location.origin;
      // Sveltia loads its configuration without a session, and only members may read it.
      if (own && url.pathname === config) {
        const sent = new Headers(args[1]?.headers ?? (args[0] instanceof Request ? args[0].headers : undefined));
        sent.set('Authorization', headers.Authorization);
        args = [args[0], { ...args[1], headers: sent }];
      }
      const response = await nativeFetch(...args);
      if (own && (url.pathname === config || url.pathname.startsWith('/' + slug + '/api/')) && response.status === 401) {
        leaving = true;
        leave();
      }
      return response;
    };
    const script = document.createElement('script');
    script.src = '/editor/sveltia-cms.js';
    script.onerror = () => { showState(true); };
    script.onload = () => { document.getElementById('editor-start')?.remove(); };
    document.body.append(script);
  }
  start();
}
