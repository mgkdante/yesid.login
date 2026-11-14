import { test, expect } from 'bun:test';
import { runInNewContext } from 'node:vm';

const source = await Bun.file('public/editor/boot.js').text();
async function boot(options: { token?: string; member?: boolean; expired?: boolean; role?: string; language?: string; hash?: string; holdFrame?: boolean } = { token: 'fake' }) {
  let stored: string | null = options.token ? JSON.stringify({ backendName: 'github', token: options.token }) : null;
  const navigations: string[] = [], scripts: unknown[] = [], calls: { path: string; init?: RequestInit }[] = [];
  const panels: any[] = [];
  let frame = () => {};
  let timer: () => Promise<void> = async () => {};
  const listeners: Record<string, ((event?: any) => void)[]> = {};
  const entries = new Map<string,string>();
  if (stored) entries.set('login.session.a', stored);
  entries.set('login.session.b', JSON.stringify({token:'other'}));
  entries.set('sveltia-cms.user', JSON.stringify({token:'legacy'}));
  const sandbox = {
    requestAnimationFrame: (callback: () => void) => { frame = callback; if (!options.holdFrame) callback(); },
    JSON, URL, Request, Response, Headers, Date, encodeURIComponent,
    location: { pathname: '/a/', hash: options.hash ?? '', href: 'https://login.test/a/', origin: 'https://login.test', replace: (path: string) => navigations.push(path) },
    localStorage: { getItem: (key: string) => key === 'login.language' ? options.language : entries.get(key) ?? null, setItem: (key:string,value:string) => { entries.set(key,value); }, removeItem: (key:string) => { entries.delete(key); } },
    document: { documentElement: { lang: 'fr' }, getElementById: () => null, body: { textContent: '', append: (element: any) => { if (element.id !== 'editor-start') scripts.push(element); else panels.push(element); } }, createElement: (tagName: string) => ({ tagName, children: [] as any[], append(...elements: any[]) { this.children.push(...elements); }, setAttribute() {} }) },
    setInterval: (callback: () => Promise<void>) => { timer = callback; },
    window: { addEventListener: (name: string, callback: (event?: any) => void) => { (listeners[name] ??= []).push(callback); }, fetch: async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path === '/auth/api/get-session') return Response.json(options.expired ? null : { session: {} });
      if (path === '/auth/sites') return Response.json(options.member === false ? [] : [{ slug: 'a', role: options.role }]);
      if (path === '/auth/api/sign-out') return Response.json({ success: true });
      return Response.json({ message: 'Sign in required' }, { status: 401 });
    } }
  };
  runInNewContext(source, sandbox);
  await new Promise(resolve => setTimeout(resolve, 0));
  return { panels, frame: () => frame(), entries, sandbox, navigations, scripts, calls, fire: (name: string, event?: any) => listeners[name]?.forEach(callback => callback(event)), remove: () => { entries.delete('login.session.a'); }, timer: () => timer() };
}
test('boot only loads Sveltia after session and membership checks', async () => {
  const state = await boot();
  expect(state.calls.map(call => call.path)).toEqual(['/auth/api/get-session', '/auth/sites']);
  expect(state.scripts).toHaveLength(3); expect(state.navigations).toEqual([]);
});
test('People leaves the screen while an entry is open, because it would cover the form', async () => {
  const state = await boot({ token: 'fake', role: 'owner', hash: '#/collections/pages/entries/area' });
  const link = state.scripts.find((item: any) => item.href === '/a/people') as { hidden: boolean };
  expect(link.hidden).toBe(true);
  for (const [hash, hidden] of [['#/collections/pages', false], ['#/collections/posts/new', true], ['#/collections/pages/entries/home', true], ['#/assets', false], ['', false], ['#/collections/entries', false]] as const) {
    state.sandbox.location.hash = hash; state.fire('hashchange');
    expect(link.hidden).toBe(hidden);
  }
});
test('missing or expired session returns to the current site sign-in', async () => {
  for (const options of [{}, { token: 'expired', expired: true }]) {
    const state = await boot(options); expect(state.scripts).toHaveLength(0); expect(state.navigations).toEqual(['/?site=a']);
  }
});
test('nonmember returns to site choice without starting Sveltia', async () => {
  const state = await boot({ token: 'fake', member: false }); expect(state.scripts).toHaveLength(0); expect(state.navigations).toEqual(['/']);
});
test('removing entry posts JSON sign-out with the in-memory bearer then goes home', async () => {
  const state = await boot(); state.remove(); await state.timer();
  const call = state.calls.find(call => call.path.endsWith('/sign-out'))!;
  expect(call.init?.body).toBe('{}');
  expect(new Headers(call.init?.headers).get('Content-Type')).toBe('application/json');
  expect(new Headers(call.init?.headers).get('Authorization')).toBe('Bearer fake');
  expect(state.navigations).toEqual(['/']);
});
test('only the configuration request gains the session, and only on this origin', async () => {
  const state = await boot();
  await state.sandbox.window.fetch('/a/config.yml', { headers: { Accept: 'text/yaml' } });
  const sent = new Headers(state.calls.at(-1)?.init?.headers);
  expect(sent.get('Authorization')).toBe('Bearer fake');
  expect(sent.get('Accept')).toBe('text/yaml');
  await state.sandbox.window.fetch('https://elsewhere.test/a/config.yml');
  expect(new Headers(state.calls.at(-1)?.init?.headers).has('Authorization')).toBe(false);
  await state.sandbox.window.fetch('/b/config.yml');
  expect(new Headers(state.calls.at(-1)?.init?.headers).has('Authorization')).toBe(false);
});
test('relay 401 clears storage and retains site in the sign-in URL', async () => {
  const state = await boot(); await state.sandbox.window.fetch('/a/api/v3/user');
  expect(state.navigations).toEqual(['/?site=a']);
});

test('People link is only for Owner and IT, with allowlisted language', async () => {
  for (const role of ['owner', 'it', 'employee']) for (const [language, label] of [['fr','Personnes'],['en','People'],['es','Personas'],['bad','Personnes']]) {
    const state = await boot({ token: 'fake', role, language });
    const links = state.scripts.filter((item: any) => item.href === '/a/people') as { textContent: string; title: string }[];
    expect(links).toHaveLength(role === 'employee' ? 0 : 1);
    if (links.length) { expect(links[0].textContent).toBe(label); expect(links[0].title).toBe(label); }
  }
});

test('only pinned supported locale requests are rewritten without credentials', async () => {
  const state = await boot();
  for (const locale of ['fr', 'es-CO', 'en-CA']) {
    await state.sandbox.window.fetch(`https://unpkg.com/@sveltia/cms@0.261.0/locales/${locale}.json`);
    expect(state.calls.at(-1)?.path).toBe(`/editor/locales/${locale}.json`);
    expect(new Headers(state.calls.at(-1)?.init?.headers).has('Authorization')).toBe(false);
  }
  const count = state.calls.length;
  const update = await state.sandbox.window.fetch('https://unpkg.com/@sveltia/cms/package.json');
  expect(await update.json()).toEqual({ version: '0.261.0' }); expect(state.calls).toHaveLength(count);
  await state.sandbox.window.fetch('https://elsewhere.test/locales/fr.json');
  expect(state.calls.at(-1)?.path).toBe('https://elsewhere.test/locales/fr.json');
});

test('Sveltia storage wrapper is scoped and foreign storage events cannot replace the token', async () => {
  const state = await boot();
  expect(state.entries.has('sveltia-cms.user')).toBe(false);
  expect(JSON.parse(state.sandbox.localStorage.getItem('sveltia-cms.user')!).token).toBe('fake');
  state.sandbox.localStorage.setItem('sveltia-cms.user', JSON.stringify({token:'refreshed'}));
  expect(JSON.parse(state.entries.get('login.session.a')!).token).toBe('refreshed');
  expect(JSON.parse(state.entries.get('login.session.b')!).token).toBe('other');
  const adopted: unknown[] = [];
  state.sandbox.window.addEventListener('storage', (event: any) => adopted.push(event));
  state.fire('storage', {key:'login.session.b',newValue:'other'});
  state.fire('storage', {key:'sveltia-cms.user',newValue:'legacy'});
  expect(adopted).toEqual([]);
  state.fire('storage', {key:'login.session.a',newValue:'same'});
  expect(adopted).toEqual([{key:'sveltia-cms.user',newValue:'same'}]);
});

// LOG-16 / Account access: every signed-in role gets its own site context.
test('My account is localized for every role and hides over existing and new entries', async () => {
  for (const role of ['owner', 'it', 'employee']) for (const [language, label] of [['fr','Mon compte'],['en','My account'],['es','Mi cuenta']]) {
    const state = await boot({ token: 'fake', role, language });
    const link = state.scripts.find((item: any) => item.href === `/account?site=a&lang=${language}`) as { textContent: string; hidden: boolean } | undefined;
    expect(link).toBeDefined();
    expect(link!.textContent).toBe(label);
    for (const [hash, hidden] of [['#/collections/pages/entries/home',true],['#/collections/pages/new',true],['#/collections/pages',false],['#/assets',false]]) {
      state.sandbox.location.hash = hash as string; state.fire('hashchange');
      expect(link!.hidden).toBe(hidden as boolean);
    }
  }
});


test('H-3 background tab has a heading before its first animation frame; only status waits', async () => {
  const state = await boot({ token: 'fake', holdFrame: true });
  const title = state.panels[0].children.find((element: any) => element.tagName === 'h1');
  const status = state.panels[0].children.find((element: any) => element.className === 'editor-status');
  expect(title.textContent).toBe('Ouverture de votre éditeur…');
  expect(status.textContent ?? '').toBe('');
  state.frame(); expect(status.textContent).toBe(title.textContent);
});
