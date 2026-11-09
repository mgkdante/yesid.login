import { test, expect } from 'bun:test';
import { createController, popupHandover, USER_KEY, validTarget, type Ports, type State } from '../login/controller.ts';
import { RESERVED } from '../src/sites.ts';
function fixture(search = '', responses: Response[] = []) {
  const navigations: string[] = [], calls: { url: string; init?: RequestInit }[] = [];
  const storage = new Map<string, string>();
  let state: State;
  const ports: Ports = {
    search, storage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value); }, removeItem: key => { storage.delete(key); }
    },
    fetch: (async (url, init) => { calls.push({ url: String(url), init }); return responses.shift()!; }) as typeof fetch,
    navigate: path => navigations.push(path), handOver: () => true
  };
  const controller = createController(ports, false, value => { state = value; });
  return { controller, storage, navigations, calls, ports, get state() { return state; } };
}
for (const hint of ['//evil.com', '%2f%2fevil.com', 'admin', 'a', 'c']) {
  test(`hint is membership checked: ${hint}`, async () => {
    const f = fixture('?site='+hint,[new Response(null,{headers:{'set-auth-token':'fake'}}),Response.json([{slug:'a',label:'A'},{slug:'b',label:'B'}]),Response.json({success:true})]);
    await f.controller.verify('a@example.test','123456');
    expect(f.navigations).toEqual(hint === 'a' ? ['/a/'] : []);
    expect(f.storage.has(USER_KEY)).toBe(false);
    await f.controller.open('//evil.com');
    expect(f.navigations).toEqual(hint === 'a' ? ['/a/'] : []);
  });
}
test('expired site tokens are cleared and legacy tokens are discarded', async () => {
  const f=fixture('?site=a',[new Response(null,{status:401})]);
  f.storage.set('login.session.a','{"token":"fake"}'); f.storage.set(USER_KEY,'{"token":"legacy"}');
  await f.controller.restore(); expect(f.storage.size).toBe(0);
});

test('code requests keep neutral copy, rate limiting and allowlisted language', async () => {
  const f = fixture('', [new Response(), new Response(null, { status: 429 }), new Response(null, { status: 500 })]);
  await f.controller.send('person@example.test', 'es'); expect(f.state.message).toBe('neutral');
  expect(f.state.step).toBe('enter');
  expect(f.calls[0].init?.headers).toHaveProperty('X-Login-Language', 'es');
  expect(JSON.parse(String(f.calls[0].init?.body))).toEqual({ email: 'person@example.test', type: 'sign-in' });
  await f.controller.send('person@example.test', 'fr'); expect(f.state.message).toBe('rate');
  await f.controller.send('person@example.test', 'en'); expect(f.state.message).toBe('sendError');
  expect(f.state.busy).toBe(false);
});
test('verify requires a token before choosing sites', async () => {
  const f = fixture('', [new Response(null, { status: 400 }), new Response(), new Response(null, { headers: { 'set-auth-token': 'fake' } }), Response.json([])]);
  await f.controller.verify('a@example.test', '123456'); expect(f.state.message).toBe('invalid');
  await f.controller.verify('a@example.test', '123456'); expect(f.state.message).toBe('connection');
  await f.controller.verify('a@example.test', '123456'); expect(f.state.message).toBe('empty');
  expect(f.navigations).toEqual([]);
});
test('popup requires exact origin, opener and handshake', () => {
  const sent: unknown[][] = [];
  const opener = { postMessage: (...args: unknown[]) => sent.push(args) };
  let receive: (event: unknown) => void = () => {};
  const host = { opener, location: { origin: 'https://login.example.test' }, addEventListener: (_: string, callback: typeof receive) => { receive = callback; } };
  expect(popupHandover(host as unknown as Window, 'fake')).toBe(true);
  expect(sent).toEqual([['authorizing:github', host.location.origin]]);
  for (const event of [
    { origin: 'https://evil.test', source: opener, data: 'authorizing:github' },
    { origin: host.location.origin, source: {}, data: 'authorizing:github' },
    { origin: host.location.origin, source: opener, data: 'wrong' }
  ]) receive(event);
  expect(sent).toHaveLength(1);
  receive({ origin: host.location.origin, source: opener, data: 'authorizing:github' });
  expect(sent[1]).toEqual(['authorization:github:success:{"token":"fake"}', host.location.origin]);
  expect(popupHandover({ ...host, opener: null } as unknown as Window, 'fake')).toBe(false);
});

test('network failures restore controls and expose only localized message keys', async () => {
  const f = fixture();
  f.ports.fetch = (async () => { throw Error('private network detail'); }) as unknown as typeof fetch;
  await f.controller.send('a@example.test', 'fr');
  expect(f.state.message).toBe('sendError'); expect(f.state.busy).toBe(false);
  await f.controller.verify('a@example.test', '123456');
  expect(f.state.message).toBe('connection'); expect(f.state.busy).toBe(false);
});

test('popup verify hands off the token without writing it to storage or a URL', async () => {
  const f = fixture('', [new Response(null, { headers: { 'set-auth-token': 'fake' } }), Response.json([{slug:'a',label:'A'}]), Response.json({success:true})]);
  const handed: string[] = [];
  f.ports.handOver = token => { handed.push(token); return true; };
  const messages: unknown[] = [];
  const popup = createController(f.ports, true, state => { messages.push(state.message); });
  await popup.verify('a@example.test', '123456');
  expect(f.calls.map(c=>c.url)).toEqual(['/auth/api/sign-in/email-otp','/auth/sites','/auth/bind']);
  expect(handed).toEqual(['fake']); expect(messages).toContain('connected');
  expect(f.storage.size).toBe(0); expect(f.navigations).toEqual([]);
});

test('resending uses the same request and keeps step two through a rate limit', async () => {
  const f = fixture('', [Response.json({ success: true }), new Response('', { status: 429 }), Response.json({ success: true })]);
  await f.controller.send('a@example.test', 'es');
  expect(f.state.step).toBe('enter');
  await f.controller.send('a@example.test', 'es');
  expect(f.state.step).toBe('enter'); expect(f.state.message).toBe('rate');
  await f.controller.send('a@example.test', 'es');
  expect(f.state.message).toBe('neutral');
  expect(f.calls.map(call => call.init?.body)).toEqual(Array(3).fill(JSON.stringify({ email: 'a@example.test', type: 'sign-in' })));
});

test('no Svelte attribute hides a regex quantifier, which Svelte would read as an expression', async () => {
  for (const name of ['App.svelte', 'People.svelte', 'Account.svelte']) {
    const source = await Bun.file(`login/${name}`).text();
    expect(source).not.toMatch(/pattern="[^"]*\{\d/);
  }
});

for (const slug of ['privacy','terms','legal']) test(`legal slug ${slug} cannot become a client target`, () => {
  expect(validTarget(slug)).toBe(false);
});
test('the sign-in screen refuses every slug the server reserves', () => {
  for (const slug of RESERVED) expect(validTarget(slug)).toBe(false);
});

test('a single site is bound before its token is saved or editor opens', async () => {
  const f = fixture('', [new Response(null,{headers:{'set-auth-token':'new'}}),Response.json([{slug:'a',label:'A'}]),Response.json({success:true})]);
  await f.controller.verify('a@example.test','123456');
  expect(f.calls.map(c=>c.url)).toEqual(['/auth/api/sign-in/email-otp','/auth/sites','/auth/bind']);
  expect(f.storage.has('sveltia-cms.user')).toBe(false);
  expect(JSON.parse(f.storage.get('login.session.a')!).token).toBe('new');
  expect(f.navigations).toEqual(['/a/']);
});

test('switching signs out only the selected site and asks for a fresh code', async () => {
  const f=fixture('?site=a&switch=1',[Response.json([{slug:'a',label:'A'}]),Response.json({success:true})]);
  f.storage.set('login.session.a','{"token":"a"}'); f.storage.set('login.session.b','{"token":"b"}');
  await f.controller.restore(); expect(f.navigations).toEqual([]);
  await f.controller.switchSite();
  expect(f.state.step).toBe('ask'); expect(f.state.message).toBe('switchNotice');
  expect(f.storage.has('login.session.a')).toBe(false); expect(f.storage.has('login.session.b')).toBe(true);
  expect(f.calls.at(-1)?.url).toBe('/auth/api/sign-out');
  expect(f.navigations).toEqual(['/?switch=1']);
});
