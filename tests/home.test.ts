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
    navigate: path => navigations.push(path), handOver: () => ({ retry() {}, dispose() {} })
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
  await f.controller.verify('a@example.test', '123456'); expect(f.state.message).toBe('checkError');
  await f.controller.verify('a@example.test', '123456'); expect(f.state.message).toBe('empty');
  expect(f.navigations).toEqual([]);
});
test('H-4 to H-7 captures opener, validates acknowledgement, sends once and cleans up', () => {
  const sent: unknown[][] = [], messages: string[] = [];
  const opener = { closed: false, postMessage: (...args: unknown[]) => sent.push(args) };
  const listeners = new Map<string, Function>();
  const host = { opener, location: { origin: 'https://login.example.test' },
    addEventListener: (name: string, callback: Function) => listeners.set(name, callback),
    removeEventListener: (name: string) => listeners.delete(name) };
  const handoff = popupHandover(host as unknown as Window, 'fake', message => messages.push(message));
  const receive = listeners.get('message')!;
  expect(messages).toEqual(['openingEditor']);
  handoff.retry(); expect(listeners.size).toBe(2); expect(sent).toHaveLength(2);
  for (const event of [
    { origin: 'https://evil.test', source: opener, data: 'authorizing:github' },
    { origin: host.location.origin, source: {}, data: 'authorizing:github' },
    { origin: host.location.origin, source: opener, data: {} }
  ]) receive(event);
  expect(sent).toHaveLength(2);
  host.opener = { closed: false, postMessage() { throw Error('wrong opener'); } };
  const ack = { origin: host.location.origin, source: opener, data: 'authorizing:github' };
  receive(ack); receive(ack); handoff.retry();
  expect(sent).toHaveLength(3);
  expect(sent[2]).toEqual(['authorization:github:success:{"token":"fake"}', host.location.origin]);
  expect(messages.at(-1)).toBe('connected'); expect(listeners.size).toBe(0);
  popupHandover({ ...host, opener: null } as unknown as Window, 'fake', message => messages.push(message));
  expect(messages.at(-1)).toBe('reopen'); expect(listeners.size).toBe(0);
});

test('network failures restore controls and expose only localized message keys', async () => {
  const f = fixture();
  f.ports.fetch = (async () => { throw Error('private network detail'); }) as unknown as typeof fetch;
  await f.controller.send('a@example.test', 'fr');
  expect(f.state.message).toBe('sendError'); expect(f.state.busy).toBe(false);
  await f.controller.verify('a@example.test', '123456');
  expect(f.state.message).toBe('checkError'); expect(f.state.busy).toBe(false);
});

test('popup verify hands off the token without writing it to storage or a URL', async () => {
  const f = fixture('', [new Response(null, { headers: { 'set-auth-token': 'fake' } }), Response.json([{slug:'a',label:'A'}]), Response.json({success:true})]);
  const handed: string[] = [];
  f.ports.handOver = (token, update) => { handed.push(token); update('openingEditor'); return { retry() {}, dispose() {} }; };
  const messages: unknown[] = [];
  const popup = createController(f.ports, true, state => { messages.push(state.message); });
  await popup.verify('a@example.test', '123456');
  expect(f.calls.map(c=>c.url)).toEqual(['/auth/api/sign-in/email-otp','/auth/sites','/auth/bind']);
  expect(handed).toEqual(['fake']); expect(messages).toContain('openingEditor');
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
  expect(f.state.step).toBe('ask'); expect(f.state.message).toBeUndefined();
  expect(f.storage.has('login.session.a')).toBe(false); expect(f.storage.has('login.session.b')).toBe(true);
  expect(f.calls.at(-1)?.url).toBe('/auth/api/sign-out');
  expect(f.navigations).toEqual(['/']);
});

test('S-4, S-5 format refusal sends nothing; accepted separators preserve zeros', async () => {
  const f = fixture('', [new Response(null, { status: 400 })]);
  await f.controller.verify('a@example.test', 'Code: 000123');
  expect(f.state.message).toBe('format'); expect(f.calls).toHaveLength(0);
  await f.controller.verify('a@example.test', '000 123');
  expect(JSON.parse(String(f.calls[0].init?.body)).otp).toBe('000123');
});
test('S-2, S-6, S-7, S-12 distinguish refusal, lost check and throttle without server detail', async () => {
  const f = fixture('', [new Response('wrong', { status: 400 }), new Response('expired', { status: 400 }), new Response('exhausted', { status: 400 }), new Response(null, { status: 500 }), new Response(null, { status: 429, headers: { 'X-Retry-After': '61' } }), new Response(null, { status: 429 })]);
  for (let i = 0; i < 3; i++) { await f.controller.verify('a@example.test', '123456'); expect(f.state.message).toBe('invalid'); }
  await f.controller.verify('a@example.test', '123456'); expect(f.state.message).toBe('checkError');
  await f.controller.verify('a@example.test', '123456'); expect(f.state.message).toBe('rate'); expect(f.state.retryMinutes).toBe(2);
  await f.controller.send('a@example.test', 'en'); expect(f.state.retryMinutes).toBeUndefined();
});
test('S-1, S-8 Clock uses request start and failed resend keeps the old timestamp', async () => {
  const f = fixture('', [new Response(), new Response(null, { status: 500 })]);
  const before = Date.now(); await f.controller.send(' a@example.test ', 'en');
  expect(f.state.sentAt).toBeGreaterThanOrEqual(before); const sentAt = f.state.sentAt;
  await f.controller.send('a@example.test', 'en'); expect(f.state.sentAt).toBe(sentAt);
});

for (const [header, minutes] of [['0.1', 1], ['1', 1], ['60', 1], ['60.1', 2], ['0', undefined], ['no wait', undefined], ['-1', undefined], ['', undefined]] as const) {
  test(`S-12 throttle header ${JSON.stringify(header)} uses only a valid server wait`, async () => {
    const f = fixture('', [new Response(null, { status: 429, headers: { 'X-Retry-After': header } })]);
    await f.controller.send('a@example.test', 'en');
    expect(f.state.message).toBe('rate'); expect(f.state.retryMinutes).toBe(minutes);
  });
}


test('S-13 list failure keeps token in memory and retries without another code', async () => {
  const f = fixture('', [new Response(null, { status: 503 }), Response.json([])]);
  await f.controller.choose('fake');
  expect(f.state.step).toBe('sites'); expect(f.state.message).toBe('sitesError');
  expect(f.controller.token).toBe('fake');
  await f.controller.retrySites(); expect(f.state.message).toBe('empty');
});

test('S-13, H-1 a bind 401 returns to Email with session-ended wording', async () => {
  const f = fixture('?site=a', [Response.json([{slug:'a',label:'A'}]), new Response(null,{status:401})]);
  f.storage.set('login.session.a', 'old');
  await f.controller.choose('fake');
  expect(f.state.step).toBe('ask'); expect(f.state.message).toBe('sessionEnded');
  expect(f.storage.size).toBe(0); expect(f.controller.token).toBe('');
});


test('S-14 to S-17 switch takes precedence with one site; Keep editing binds it again', async () => {
  const f = fixture('?site=a&switch', [Response.json([{slug:'a',label:'A'}]), new Response()]);
  await f.controller.choose('fake'); expect(f.state.message).toBe('switchNotice'); expect(f.calls).toHaveLength(1);
  await f.controller.open('a'); expect(f.navigations).toEqual(['/a/']);
});

test('S-15, H-1 opening failure belongs to its row and retries bind', async () => {
  const f = fixture('', [Response.json([{slug:'a',label:'A'},{slug:'b',label:'B'}]), new Response(null,{status:403}), new Response()]);
  await f.controller.choose('fake'); await f.controller.open('b');
  expect(f.state.openError).toBe('b'); expect(f.state.busy).toBe(false);
  await f.controller.open('b'); expect(f.navigations).toEqual(['/b/']); expect(f.state.openError).toBeUndefined();
});


test('S-17 failed server sign-out keeps the switch question; storage removal cannot undo success', async () => {
  const f = fixture('?site=a&switch', [Response.json([{slug:'a',label:'A'}]), new Response(null,{status:502}), new Response()]);
  await f.controller.choose('fake'); await f.controller.switchSite();
  expect(f.state.step).toBe('sites'); expect(f.state.switching).toBe(true); expect(f.controller.token).toBe('fake');
  f.ports.storage.removeItem = () => { throw Error('blocked'); };
  await f.controller.switchSite(); expect(f.state.step).toBe('ask'); expect(f.controller.token).toBe('');
});

test('H-2 storage refusal stays on its row without navigating', async () => {
  const f = fixture('', [Response.json([{slug:'a',label:'A'}]), new Response()]);
  f.ports.storage.setItem = () => { throw Error('blocked'); };
  await f.controller.choose('fake'); expect(f.state.message).toBe('editorStorage'); expect(f.state.openError).toBe('a'); expect(f.navigations).toEqual([]);
});

for (const sites of [null, {}, [null], [{slug:'admin',label:'No'}], [{slug:'a'}]]) {
  test('S-13 malformed list retains the in-memory retry path: ' + JSON.stringify(sites), async () => {
    const f = fixture('', [Response.json(sites)]); await f.controller.choose('fake');
    expect(f.state.step).toBe('sites'); expect(f.state.message).toBe('sitesError'); expect(f.controller.token).toBe('fake');
  });
}

test('S-15 only the selected row is busy, and concurrent opening is ignored', async () => {
  const f = fixture('', [Response.json([{slug:'a',label:'A'},{slug:'b',label:'B'}])]);
  await f.controller.choose('fake');
  let finish!: (response: Response) => void;
  f.ports.fetch = (() => new Promise<Response>(resolve => { finish = resolve; })) as unknown as typeof fetch;
  const pending = f.controller.open('a');
  expect(f.state.opening).toBe('a'); expect(f.state.busy).toBe(true);
  await f.controller.open('b'); expect(f.state.opening).toBe('a');
  finish(new Response(null, {status:403})); await pending;
  expect(f.state.opening).toBeUndefined(); expect(f.state.openError).toBe('a');
});


test('S-16 empty screen survives a failed sign-out with its recovery action', async () => {
  const f = fixture('', [Response.json([]), new Response(null,{status:502})]);
  await f.controller.choose('fake'); await f.controller.switchSite();
  expect(f.state.step).toBe('sites'); expect(f.state.empty).toBe(true); expect(f.state.message).toBe('checkError');
});
