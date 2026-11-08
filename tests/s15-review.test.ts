// Regressions for the S15 independent security review, through the real handler, Better Auth and migrations.
import { Database } from 'bun:sqlite';
import { readdirSync } from 'node:fs';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createHandler } from '../src/index.ts';
import { alertFailure } from '../src/alerts.ts';
import { CODE_FLOOR_MS } from '../src/code-requests.ts';
import { EDITOR_HEADERS } from '../src/pages.ts';
import type { Env } from '../src/env.ts';

let db: Database;
let sql: string[];
let mail: { to: string; body: string }[];
let resendStatus: number;
const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => { pending.push(p); }, passThroughOnException() {} } as unknown as ExecutionContext;
const originalFetch = globalThis.fetch;
const statement = (text: string, args: unknown[] = []): unknown => ({
  bind: (...values: unknown[]) => statement(text, values),
  first: async () => db.query(text).get(...args as string[]),
  // Like D1: all() runs any statement and reports what it changed.
  all: async () => {
    const results = db.query(text).all(...args as string[]);
    const meta = db.query('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get() as { changes: number; last_row_id: number };
    return { results, meta };
  },
  raw: async () => db.query(text).values(...args as string[]),
  run: async () => ({ meta: { changes: db.query(text).run(...args as string[]).changes } })
});
// prepare, batch and exec together are how Better Auth recognises a D1 binding.
const d1 = {
  prepare: (text: string) => { sql.push(text); return statement(text); },
  exec: async (text: string) => { db.exec(text); },
  batch: async (statements: { all(): Promise<unknown> }[]) => {
    db.exec('BEGIN');
    try { const results = []; for (const item of statements) results.push(await item.all()); db.exec('COMMIT'); return results; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
} as unknown as D1Database;
const env = (overrides: Partial<Env> = {}) => ({
  DB: d1, BETTER_AUTH_SECRET: 'fixture-only-secret-with-at-least-32-characters', RESEND_API_KEY: 'fixture-only',
  EMAIL_FROM: 'login@example.test', ALERT_EMAIL: 'alerts@example.test', ASSETS: { fetch: () => new Response('asset') }, ...overrides
}) as unknown as Env;
const handler = createHandler();
const call = async (path: string, init: RequestInit = {}, e = env()) => {
  const response = await handler(new Request('https://login.test' + path, init), e, ctx);
  await Promise.all(pending.splice(0));
  return response;
};
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const requestCode = (email: string) => post('/auth/api/email-otp/send-verification-otp', { email, type: 'sign-in' });
const signIn = (email: string, otp: string) => post('/auth/api/sign-in/email-otp', { email, otp });
const lastCode = () => mail.at(-1)?.body.match(/\b\d{6}\b/)?.[0] ?? '';

beforeEach(async () => {
  db = new Database(':memory:'); db.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) db.exec(await Bun.file('migrations/' + file).text());
  db.exec(`INSERT INTO user VALUES ('member','M','member@example.test',1,NULL,0,0),('removed','R','removed@example.test',1,NULL,0,0);
    INSERT INTO site (slug,owner,repo,branch,label,installation_id) VALUES ('a','owner','a','main','Site A','fake-a');
    INSERT INTO membership (site_slug,user_id,role) VALUES ('a','member','owner')`);
  sql = []; mail = []; resendStatus = 200;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === 'https://api.resend.com/emails') {
      const body = String(init?.body ?? '');
      mail.push({ to: JSON.parse(body).to, body });
      return new Response('{}', { status: resendStatus });
    }
    throw Error('unexpected request');
  }) as unknown as typeof fetch;
});
afterEach(() => { globalThis.fetch = originalFetch; });

const timed = async (run: () => Promise<Response>) => {
  const started = performance.now();
  const response = await run();
  return { ms: performance.now() - started, status: response.status, body: await response.text() };
};

test('finding 1: known, removed and unknown addresses take the same minimum time and read the same', async () => {
  const results = [];
  for (const email of ['member@example.test', 'removed@example.test', 'nobody@example.test']) {
    results.push({ send: await timed(() => requestCode(email)), wrong: await timed(() => signIn(email, '000000')) });
  }
  for (const { send, wrong } of results) {
    expect(send.ms).toBeGreaterThanOrEqual(CODE_FLOOR_MS - 5);
    expect(wrong.ms).toBeGreaterThanOrEqual(CODE_FLOOR_MS - 5);
    expect([send.status, send.body]).toEqual([results[0].send.status, results[0].send.body]);
    expect([wrong.status, wrong.body]).toEqual([results[0].wrong.status, results[0].wrong.body]);
  }
}, 20000);

test('finding 2: sign-in sets no cookie, and a session cookie alone is never a session', async () => {
  await requestCode('member@example.test');
  const signed = await signIn('member@example.test', lastCode());
  expect(signed.status).toBe(200);
  expect(signed.headers.get('set-cookie')).toBeNull();
  const token = signed.headers.get('set-auth-token') ?? '';
  expect(token).not.toBe('');
  const cookie = `__Secure-better-auth.session_token=${encodeURIComponent(token)}; better-auth.session_token=${encodeURIComponent(token)}`;
  const attempts: Record<string, string>[] = [{ Cookie: cookie }, { Cookie: cookie, Authorization: 'Bearer ' }];
  for (const headers of attempts) {
    const session = await call('/auth/api/get-session', { headers });
    if (headers.Authorization !== undefined) expect(session.status).toBe(401);
    else expect(await session.json()).toBeNull();
  }
  const real = await call('/auth/api/get-session', { headers: { Authorization: 'Bearer ' + token } });
  expect(((await real.json()) as { user?: { id?: string } } | null)?.user?.id).toBe('member');
}, 20000);

test('finding 3: an alert still goes out when the database is down', async () => {
  const down = { prepare() { throw Error('D1 unavailable'); } } as unknown as D1Database;
  await alertFailure(env({ DB: down }), 'retention');
  expect(mail.map(item => item.to)).toEqual(['alerts@example.test']);
});

test('finding 3: a refused alert gives its hour back, so the next failure tries again', async () => {
  resendStatus = 500;
  await alertFailure(env(), 'code-email', 401);
  resendStatus = 200;
  await alertFailure(env(), 'code-email', 401);
  expect(mail.length).toBe(2);
  await alertFailure(env(), 'code-email', 401);
  expect(mail.length).toBe(2);
});

test('finding 4: one address gets at most five code requests an hour, whoever asks, and the limit stores no address', async () => {
  for (let i = 0; i < 5; i++) expect((await requestCode('member@example.test')).status).toBe(200);
  expect(mail.length).toBe(5);
  const before = db.query("SELECT value FROM verification WHERE identifier LIKE 'sign-in-otp-%'").all();
  const over = await requestCode('member@example.test');
  expect([over.status, await over.json()]).toEqual([200, { success: true }]);
  expect(mail.length).toBe(5);
  expect(db.query("SELECT value FROM verification WHERE identifier LIKE 'sign-in-otp-%'").all()).toEqual(before);
  expect((await requestCode('MEMBER@example.test')).status).toBe(200);
  expect(mail.length).toBe(5);
  const keys = db.query('SELECT DISTINCT key FROM code_budget').all() as { key: string }[];
  expect(keys.length).toBe(1);
  expect(keys[0].key).toMatch(/^[0-9a-f]{64}$/);
  expect(JSON.stringify(db.query('SELECT * FROM code_budget').all())).not.toContain('member');
}, 30000);

test('re-check: requests refused by the IP limit never spend an address budget', async () => {
  const fromIp = (ip: string, email: string) => post('/auth/api/email-otp/send-verification-otp', { email, type: 'sign-in' }, { 'cf-connecting-ip': ip });
  for (let i = 0; i < 5; i++) expect((await fromIp('192.0.2.1', `other${i}@example.test`)).status).toBe(200);
  for (let i = 0; i < 5; i++) expect((await fromIp('192.0.2.1', 'member@example.test')).status).toBe(429);
  expect(mail.length).toBe(0);
  expect((await fromIp('198.51.100.9', 'member@example.test')).status).toBe(200);
  expect(mail.map(item => item.to)).toEqual(['member@example.test']);
}, 30000);

test('re-check: a burst of simultaneous requests from many IP addresses still gets five codes at most', async () => {
  const burst = Array.from({ length: 20 }, (_, i) => post('/auth/api/email-otp/send-verification-otp',
    { email: 'member@example.test', type: 'sign-in' }, { 'cf-connecting-ip': `198.51.100.${i + 1}` }));
  for (const response of await Promise.all(burst)) expect(response.status).toBe(200);
  expect(mail.length).toBe(5);
  expect(db.query('SELECT count(*) AS n FROM code_budget').get()).toEqual({ n: 5 });
}, 30000);

test('finding 5: an auth library error never writes its message to the logs', async () => {
  const entries: unknown[][] = [];
  const saved = { error: console.error, warn: console.warn, log: console.log, info: console.info };
  console.error = console.warn = console.log = console.info = (...args: unknown[]) => { entries.push(args); };
  try {
    // A failure inside the library's own router, where it logs errors itself.
    const broken = { ...d1, prepare: (text: string) => {
      if (/verification/i.test(text) && !/sqlite_master|pragma/i.test(text)) throw Error('person@example.test broke the query');
      return d1.prepare(text);
    } } as unknown as D1Database;
    await call('/auth/api/email-otp/send-verification-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.test', type: 'sign-in' }) }, env({ DB: broken }));
    await call('/auth/api/sign-in/email-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'person@example.test', otp: '000000' }) }, env({ DB: broken }));
  } finally { Object.assign(console, saved); }
  expect(JSON.stringify(entries.map(args => args.map(arg => arg instanceof Error ? `${arg.name}: ${arg.message}` : arg)))).not.toContain('person@example.test');
});

test('finding 6: a request does not read the database schema', async () => {
  await requestCode('member@example.test');
  expect(sql.filter(text => /sqlite_master|pragma_table_info|index_list/i.test(text))).toEqual([]);
}, 20000);

test('finding 7: the static editor headers allow the same connections as the editor page', async () => {
  const headers = await Bun.file('public/_headers').text();
  const connect = (policy: string) => policy.split(';').map(part => part.trim()).find(part => part.startsWith('connect-src '));
  const editorBlock = headers.split(/\r?\n\r?\n/).find(block => block.startsWith('/editor/*')) ?? '';
  expect(connect(editorBlock.match(/Content-Security-Policy: (.*)/)?.[1] ?? '')).toBe(connect(EDITOR_HEADERS['Content-Security-Policy']));
});


test('site binding is one-time, narrows sites and blocks every other-site route', async () => {
  db.exec("INSERT INTO site(slug,owner,repo,branch,label,installation_id) VALUES ('b','owner','b','main','B','fake'); INSERT INTO membership(site_slug,user_id,role) VALUES ('b','member','owner')");
  await requestCode('member@example.test');
  const signed = await signIn('member@example.test', lastCode());
  const headers = { Authorization: 'Bearer ' + signed.headers.get('set-auth-token') };
  expect((await post('/auth/bind', { slug: 'missing' }, headers)).status).toBe(403);
  for (const path of ['/a/config.yml','/a/api/v3/user','/a/api/graphql','/a/people/members','/account']) expect((await call(path,{headers})).status).toBe(403);
  for (const path of ['/email-otp/request-email-change','/email-otp/change-email','/email-otp/send-verification-otp']) expect((await post('/auth/api'+path,{type:'email-verification',newEmail:'new@example.test'},headers)).status).toBe(403);
  expect((await post('/auth/bind', { slug: 'a' }, headers)).status).toBe(200);
  expect((await post('/auth/bind', { slug: 'a' }, headers)).status).toBe(200);
  expect((await post('/auth/bind', { slug: 'b' }, headers)).status).toBe(403);
  expect((await (await call('/auth/sites',{headers})).json() as {slug:string}[]).map(s=>s.slug)).toEqual(['a']);
  for (const [path,method] of [['/b/config.yml','GET'],['/b/api/v3/user','GET'],['/b/api/graphql','POST'],['/b/people/members','GET'],['/b/people/members','POST'],['/b/people/members/member','DELETE']]) expect((await call(path,{method,headers})).status).toBe(403);
  expect((await call('/account',{headers})).status).toBe(200);
  expect((await post('/auth/api/email-otp/send-verification-otp',{type:'email-verification'},headers)).status).toBe(200);
},20000);

test('unbound sessions expire after ten minutes, including get-session and bind', async () => {
  await requestCode('member@example.test');
  const signed = await signIn('member@example.test', lastCode());
  const headers = { Authorization: 'Bearer ' + signed.headers.get('set-auth-token') };
  db.exec("UPDATE session SET createdAt=datetime('now','-11 minutes')");
  for (const path of ['/auth/sites','/auth/api/get-session','/a/config.yml','/account']) expect((await call(path,{headers})).status).toBe(401);
  expect((await post('/auth/bind',{slug:'a'},headers)).status).toBe(401);
},20000);

test('concurrent binding chooses exactly one eligible site and nonmembers cannot bind', async () => {
  db.exec("INSERT INTO site(slug,owner,repo,branch,label,installation_id) VALUES ('b','owner','b','main','B','fake'),('c','owner','c','main','C','fake'); INSERT INTO membership(site_slug,user_id,role) VALUES ('b','member','owner')");
  await requestCode('member@example.test');
  const signed=await signIn('member@example.test',lastCode());
  const headers={Authorization:'Bearer '+signed.headers.get('set-auth-token')};
  expect((await post('/auth/bind',{slug:'c'},headers)).status).toBe(403);
  const responses=await Promise.all(['a','b'].map(slug=>post('/auth/bind',{slug},headers)));
  expect(responses.map(r=>r.status).sort()).toEqual([200,403]);
  const sites=await (await call('/auth/sites',{headers})).json() as {slug:string}[];
  expect(sites).toHaveLength(1);
  db.exec("DELETE FROM membership WHERE site_slug='"+sites[0].slug+"'");
  // Without its site's membership the bound session is no session at all.
  expect((await call('/'+sites[0].slug+'/api/v3/user',{headers})).status).toBe(401);
},20000);

test('a session dies with the membership of its site, even when another site row remains', async () => {
  db.exec("INSERT INTO site(slug,owner,repo,branch,label,installation_id) VALUES ('b','owner','b','main','B','fake'); INSERT INTO membership(site_slug,user_id,role,invited_at) VALUES ('b','member','employee',datetime('now','-10 days'))");
  await requestCode('member@example.test');
  const signed = await signIn('member@example.test', lastCode());
  const headers = { Authorization: 'Bearer ' + signed.headers.get('set-auth-token') };
  expect((await post('/auth/bind', { slug: 'a' }, headers)).status).toBe(200);
  expect((await call('/account', { headers })).status).toBe(200);
  db.exec("DELETE FROM membership WHERE site_slug='a' AND user_id='member'");
  for (const path of ['/auth/api/get-session', '/account', '/auth/sites']) expect((await call(path, { headers })).status).toBe(401);
  expect((await post('/auth/api/email-otp/send-verification-otp', { type: 'email-verification' }, headers)).status).toBe(401);
}, 20000);
