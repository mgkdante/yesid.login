import { Database } from 'bun:sqlite';
import { beforeEach, afterEach, test, expect } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { createHandler } from '../src/index.ts';
import type { Env } from '../src/env.ts';
import { confirmSignOut } from '../src/responses.ts';

const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
let db: Database;
let calls: { url: string; init?: RequestInit }[];
const originalFetch = globalThis.fetch;
const pending: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext;
const statement = (sql: string, args: unknown[] = []): unknown => ({
  bind: (...values: unknown[]) => statement(sql, values),
  first: async () => db.query(sql).get(...args as string[]),
  all: async () => ({ results: db.query(sql).all(...args as string[]) }),
  run: async () => { const result = db.query(sql).run(...args as string[]); return { meta: { changes: result.changes } }; }
});
const env = () => ({ DB: { prepare: (sql: string) => statement(sql), batch: (statements: { run(): unknown }[]) => { db.exec('BEGIN'); return (async () => { try { const results = []; for (const item of statements) results.push(await item.run()); db.exec('COMMIT'); return results; } catch (error) { db.exec('ROLLBACK'); throw error; } })(); } }, GITHUB_APP_ID: 'fake-app',
  GITHUB_APP_PRIVATE_KEY: privateKey, ASSETS: { fetch: () => new Response('asset') }
}) as unknown as Env;
const handler = createHandler(async request => request.headers.has('Authorization') ? { siteSlug: 'a', id: 'a-user', name: 'Private name', email: 'private@example.test' } : undefined);
const request = (path: string, body?: unknown, signed = true) => (path.startsWith('/b/') && signed && db.query("SELECT 1 FROM membership WHERE site_slug='b' AND user_id='a-user'").get() ? createHandler(async () => ({siteSlug:'b',id:'a-user',name:'A',email:'a@example.test'})) : handler)(new Request('https://login.test' + path, {
  method: body ? 'POST' : 'GET', headers: signed ? { Authorization: 'Bearer fake-session' } : {},
  body: body ? JSON.stringify(body) : undefined
}), env(), ctx);
const commit = (repo = 'a', branch = 'main') => ({
  query: 'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }',
  variables: { input: { branch: { repositoryNameWithOwner: `owner/${repo}`, branchName: branch }, expectedHeadOid: 'old',
    message: { headline: 'Update' }, fileChanges: { additions: [{ path: 'src/lib/content/posts/hello.md', contents: 'eA==' }] } } }
});
beforeEach(async () => {
  db = new Database(':memory:'); db.exec('PRAGMA foreign_keys = ON');
  for (const file of ['0001_auth.sql', '0002_edit_log.sql', '0003_sites.sql', '0004_people.sql', '0005_invite_safeguards.sql', '0006_alerts.sql', '0007_code_budget.sql', '0008_session_site.sql']) db.exec(await Bun.file('migrations/' + file).text());
  db.exec(`INSERT INTO user VALUES ('a-user','A','a@example.test',1,NULL,0,0),('b-user','B','b@example.test',1,NULL,0,0);
    INSERT INTO site (slug,owner,repo,branch,label,installation_id) VALUES ('a','owner','a','main','Site A','fake-a'),('b','owner','b','draft','Site B','fake-b');
    INSERT INTO membership (site_slug,user_id,role) VALUES ('a','a-user','owner'),('b','b-user','employee')`);
  calls = [];
  const cached = new Map<string, Response>();
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: async () => ({
    match: async (key: Request) => cached.get(key.url)?.clone(),
    put: async (key: Request, value: Response) => { cached.set(key.url, value.clone()); }
  }) } });
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.includes('/access_tokens')) return Response.json({ token: url.includes('fake-a') ? 'token-a' : 'token-b', expires_at: '2099-01-01T00:00:00Z' });
    if (url.includes('/contents/')) return new Response(url.includes('/a/') ? 'config-a' : 'config-b');
    return Response.json({ data: { createCommitOnBranch: { commit: { oid: 'new' } } } });
  }) as unknown as typeof fetch;
});
afterEach(async () => { await Promise.all(pending.splice(0)); globalThis.fetch = originalFetch; db.close(); });

for (const [suffix, body] of [['/api/v3/repos/owner/b', undefined], ['/api/graphql', { query: 'query { viewer { login } }' }], ['/api/graphql', commit('b', 'draft')]] as const) {
  test(`membership blocks B ${suffix} before GitHub`, async () => {
    expect((await request('/b' + suffix, body)).status).toBe(403); expect(calls).toHaveLength(0);
  });
}
test('no session and unknown site are refused before GitHub', async () => {
  expect((await request('/a/api/v3/user', undefined, false)).status).toBe(401);
  expect((await request('/a/api/graphql', commit(), false)).status).toBe(401);
  expect((await request('/unknown/api/v3/user')).status).toBe(404); expect(calls).toHaveLength(0);
});
test('commit uses A token and repository, logs site and internal ID only', async () => {
  expect((await request('/a/api/graphql', commit())).status).toBe(200);
  await Promise.all(pending.splice(0));
  const forwarded = calls.find(call => call.url.endsWith('/graphql'))!;
  expect(new Headers(forwarded.init?.headers).get('Authorization')).toBe('Bearer token-a');
  expect(String(forwarded.init?.body)).toContain('owner/a');
  expect(String(forwarded.init?.body)).toContain('Edited-by: a-user');
  expect(String(forwarded.init?.body)).not.toContain('private@example.test');
  expect(db.query('SELECT site_slug FROM edit_log').get()).toEqual({ site_slug: 'a' });
});
test('A cannot commit to B repo or another branch', async () => {
  expect((await request('/a/api/graphql', commit('b'))).status).toBe(403);
  expect((await request('/a/api/graphql', commit('a', 'other'))).status).toBe(403); expect(calls).toHaveLength(0);
});
test('invalid and reserved slugs never query site', async () => {
  const { findSite } = await import('../src/sites.ts');
  const e = env(); e.DB = { prepare: () => { throw Error('lookup must not happen'); } } as unknown as D1Database;
  for (const slug of ['auth', 'api', 'admin', 'login', 'editor', 'account', 'privacy', 'terms', 'legal', 'Bad', '-bad', '%2f%2fevil.com', 'a'.repeat(64)]) {
    expect(await findSite(e.DB, slug)).toBeNull();
  }
  for (const slug of ['account', 'Bad', '-bad', '%2f%2fevil.com']) {
    expect((await handler(new Request(`https://login.test/${slug}/api/v3/user`), e, ctx)).status).toBe(404);
  }
  expect(calls).toHaveLength(0);
});
test('site hints never cause an HTTP redirect, including encoded URLs and backslashes', async () => {
  for (const hint of ['//evil.com', '%2f%2fevil.com', '%252f%252fevil.com', '\\evil.com', 'https://evil.com', 'a']) {
    const response = await request('/?site=' + hint); expect(response.status).toBe(200); expect(response.headers.get('location')).toBeNull();
  }
});
test('sites contains only caller memberships and roles', async () => {
  expect(await (await request('/auth/sites')).json()).toEqual([{ slug: 'a', label: 'Site A', role: 'owner' }]);
  expect((await request('/auth/sites', undefined, false)).status).toBe(401);
});
test('config is for members only, before any GitHub call or cache', async () => {
  expect((await request('/a/config.yml', undefined, false)).status).toBe(401);
  expect((await request('/b/config.yml')).status).toBe(403);
  expect(calls).toHaveLength(0);
  const response = await request('/a/config.yml');
  expect(await response.text()).toBe('config-a');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await request('/b/config.yml')).status).toBe(403);
  expect((await request('/a/config.yml', undefined, false)).status).toBe(401);
});
test('config caches per site and does not leak A to B', async () => {
  db.exec("INSERT INTO membership (site_slug,user_id,role) VALUES ('b','a-user','it')");
  expect(await (await request('/a/config.yml')).text()).toBe('config-a');
  expect(await (await request('/b/config.yml')).text()).toBe('config-b');
  expect(await (await request('/a/config.yml')).text()).toBe('config-a');
  expect(calls.filter(call => call.url.includes('/contents/'))).toHaveLength(2);
});
test('GitHub config failures produce a clear 502', async () => {
  db.exec("INSERT INTO membership (site_slug,user_id,role) VALUES ('b','a-user','it')");
  await request('/a/config.yml');
  globalThis.fetch = (async () => new Response('failure', { status: 500 })) as unknown as typeof fetch;
  const response = await request('/b/config.yml'); expect(response.status).toBe(502);
  expect(await response.text()).toContain('Configuration indisponible');
});
test('a commit message loses personal details on its way to GitHub', async () => {
  const signedOff = commit();
  signedOff.variables.input.message = { headline: 'By A <a@example.test>', body: 'Signed-off-by: A <a@example.test>' } as typeof signedOff.variables.input.message;
  expect((await request('/a/api/graphql', signedOff)).status).toBe(200);
  const forwarded = String(calls.find(call => call.url.endsWith('/graphql'))?.init?.body);
  expect(forwarded).not.toContain('a@example.test');
  expect(forwarded).toContain('Edited-by: a-user');
});
test('sign-out only reports success when the session is really gone', async () => {
  expect(confirmSignOut(Response.json({ success: true }), true).status).toBe(502);
  expect(confirmSignOut(Response.json({ success: true }), false).status).toBe(200);
  expect(confirmSignOut(new Response('no', { status: 401 }), true).status).toBe(401);
});
test('relayed responses are never stored', async () => {
  expect((await request('/a/api/v3/repos/owner/a/commits')).headers.get('cache-control')).toBe('no-store');
});
test('GitHub refusing the service does not look like an ended session', async () => {
  const stub = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
    String(input).includes('/access_tokens') ? stub(input, init) : new Response('Bad credentials', { status: 401 })) as unknown as typeof fetch;
  const rest = await request('/a/api/v3/repos/owner/a/commits');
  expect(rest.status).toBe(502);
  const graphql = await request('/a/api/graphql', { query: 'query($owner:String!,$repo:String!){repository(owner:$owner,name:$repo){defaultBranchRef{name}}}', variables: {owner:'owner',repo:'a'} });
  expect(graphql.status).toBe(502);
});
test('worker pages have security headers and editor starts only through boot', async () => {
  const response = await request('/a/'); const html = await response.text();
  expect(response.headers.get('content-security-policy')).toContain("'unsafe-eval'");
  expect(html).toContain('href="/a/config.yml"'); expect(html).toContain('/editor/boot.js'); expect(html).not.toContain('<script src="/editor/sveltia');
  for (const path of ['/', '/auth/popup']) {
    const csp = (await request(path)).headers.get('content-security-policy');
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("style-src 'self' 'unsafe-inline';");
    expect(csp).not.toContain('unsafe-eval');
  }
  expect((await request('/auth/sites')).headers.get('content-security-policy')).not.toContain('unsafe-inline');
});

const manage = (path = '/a/people/members', method = 'GET', body?: unknown, id: string | null = 'a-user') =>
  createHandler(async () => id ? { siteSlug: path.startsWith('/b/') && id === 'a-user' ? 'b' : 'a', id, name: 'Fixture', email: 'fixture@example.test' } : undefined)(new Request('https://login.test' + path, {
    method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {})
  }), env(), ctx);
test('People routes enforce session, site scope and role before any operation', async () => {
  for (const [method, suffix, body] of [['GET', '', undefined], ['POST', '', { email: 'new@example.test' }], ['DELETE', '/a-user', undefined]] as const) {
    expect((await manage('/a/people/members' + suffix, method, body, null)).status).toBe(401);
    expect((await manage('/b/people/members' + suffix, method, body)).status).toBe(403);
    expect((await manage('/b/people/members' + suffix, method, body, 'b-user')).status).toBe(403);
  }
  expect(calls).toHaveLength(0);
  db.exec("INSERT INTO membership (site_slug,user_id,role,created_at) VALUES ('a','b-user','it',datetime('now'))");
  expect((await manage('/a/people/members', 'GET', undefined, 'b-user')).status).toBe(200);
});
test('adding new and other-site emails is indistinguishable and preserves names and roles', async () => {
  const fresh = await manage(undefined, 'POST', { email: 'NEW@example.test', role: 'owner' });
  const existing = await manage(undefined, 'POST', { email: 'b@example.test' });
  expect(await fresh.json()).toEqual(await existing.json());
  expect(db.query("SELECT name FROM user WHERE id='b-user'").get()).toEqual({ name: 'B' });
  expect(db.query("SELECT name,email FROM user WHERE email='new@example.test'").get()).toEqual({ name: 'Site A', email: 'new@example.test' });
  expect(db.query("SELECT role FROM membership WHERE user_id='b-user' AND site_slug='b'").get()).toEqual({ role: 'employee' });
  await manage(undefined, 'POST', { email: 'a@example.test' });
  expect(db.query("SELECT role FROM membership WHERE user_id='a-user' AND site_slug='a'").get()).toEqual({ role: 'owner' });
  const rows = db.query('SELECT * FROM people_log').all();
  expect(rows).toHaveLength(2); expect(JSON.stringify(rows)).not.toContain('@');
  expect(JSON.stringify(rows)).toContain('a-user');
});
test('bad emails and injection attempts never write or send', async () => {
  for (const email of ['bad', 'a@example.test\r\nBcc: x@example.test', "x'); DROP TABLE user;--", '<x>@example.test', null]) {
    expect((await manage(undefined, 'POST', { email })).status).toBe(400);
  }
  expect(db.query('SELECT * FROM user').all()).toHaveLength(2); expect(calls).toHaveLength(0);
});
const seedSession = () => db.exec("INSERT INTO session (id,expiresAt,token,createdAt,updatedAt,userId) VALUES ('s',9999999999999,'t',0,0,'b-user')");
test('removal protects Owner and IT, preserves other sites, and revokes final sessions', async () => {
  db.exec("UPDATE membership SET confirmed_at = created_at WHERE user_id='b-user'");
  seedSession();
  expect((await manage('/a/people/members/a-user', 'DELETE')).status).toBe(403);
  expect((await manage('/a/people/members/b-user', 'DELETE')).status).toBe(404);
  expect((await manage('/a/people/members/unknown', 'DELETE')).status).toBe(404);
  db.exec("INSERT INTO membership (site_slug,user_id,role,created_at) VALUES ('a','b-user','it',datetime('now'))");
  expect((await manage('/a/people/members/b-user', 'DELETE')).status).toBe(403);
  db.exec("UPDATE membership SET role='employee' WHERE site_slug='a' AND user_id='b-user'");
  expect((await manage('/a/people/members/b-user', 'DELETE')).status).toBe(200);
  expect(db.query('SELECT * FROM session').all()).toHaveLength(1);
  expect(db.query("SELECT role FROM membership WHERE site_slug='b'").get()).toEqual({ role: 'employee' });
  db.exec("INSERT INTO membership (site_slug,user_id,role,created_at) VALUES ('b','a-user','it',datetime('now'))");
  expect((await manage('/b/people/members/b-user', 'DELETE')).status).toBe(200);
  expect(db.query('SELECT * FROM session').all()).toHaveLength(0);
  expect(db.query("SELECT * FROM user WHERE id='b-user'").get()).toBeTruthy();
  expect(db.query("SELECT * FROM people_log WHERE action='remove'").all()).toHaveLength(2);
});
test('capacity and hourly limits hold and no-op remains harmless at either limit', async () => {
  for (let i = 0; i < 24; i++) db.exec(`INSERT INTO user VALUES ('p${i}','P','p${i}@example.test',1,NULL,0,0); INSERT INTO membership (site_slug,user_id,role,created_at) VALUES ('a','p${i}','employee',datetime('now'));`);
  expect((await manage(undefined, 'POST', { email: 'extra@example.test' })).status).toBe(409);
  expect((await manage(undefined, 'POST', { email: 'a@example.test' })).status).toBe(200);
  db.exec("DELETE FROM membership WHERE user_id LIKE 'p%'");
  for (let i = 0; i < 20; i++) db.exec("INSERT INTO people_log (site_slug,actor_id,action,target_id) VALUES ('a','a-user','add','fixture')");
  expect((await manage(undefined, 'POST', { email: 'extra@example.test' })).status).toBe(429);
  expect((await manage(undefined, 'POST', { email: 'a@example.test' })).status).toBe(200);
});
test('welcome failure keeps membership and reports warning without leaking addresses', async () => {
  globalThis.fetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
  const response = await manage(undefined, 'POST', { email: 'new@example.test' });
  expect(await response.json()).toEqual({ success: true, emailSent: false });
  expect(db.query('SELECT * FROM people_log').all()).toHaveLength(1);
});
test('People HTML has self-only scripts; account-changing endpoints stay closed', async () => {
  expect((await manage('/a/people')).headers.get('Content-Security-Policy')).toContain("script-src 'self';");
  for (const path of ['/update-user', '/change-email', '/change-password', '/set-password', '/delete-user', '/email-otp/reset-password']) {
    expect((await manage('/auth/api' + path, 'POST', {})).status).toBe(403);
  }
});
test('a new person is stored with the same date format as existing accounts', async () => {
  expect((await request('/a/people/members', { email: 'dated@example.test' })).status).toBe(200);
  const row = db.query("SELECT createdAt, updatedAt FROM user WHERE email = 'dated@example.test'").get() as { createdAt: string; updatedAt: string };
  expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  expect(row.updatedAt).toBe(row.createdAt);
});

test('only the exact two native email-change paths are added', async () => {
  const { ACCOUNT_PATHS } = await import('../src/account.ts');
  expect(ACCOUNT_PATHS).toEqual(['/email-otp/request-email-change', '/email-otp/change-email']);
  for (const suffix of ['/email-otp/request-email-change/extra', '/email-otp/change-email/', '/email-otp/get-verification-otp', '/email-otp/create-verification-otp']) {
    expect((await request('/auth/api' + suffix, {})).status).toBe(403);
  }
});
test('account page is available and mutations require a real signed session', async () => {
  expect((await request('/account')).status).toBe(200);
  // Authentication and native mutations are exercised against real Better Auth in auth-flow.test.ts.
});

test('a code request whose body is not an object is a bad request, not an outage', async () => {
  for (const body of ['null', '[]', '1', '"x"']) {
    const response = await handler(new Request('https://login.test/auth/api/email-otp/send-verification-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body
    }), env(), ctx);
    expect(response.status).toBe(400);
  }
});

test('HTML unknown routes keep status while API and non-HTML errors keep JSON', async () => {
  for (const path of ['/nope/','/other/','/a/missing']) {
    const response = await handler(new Request('https://login.test'+path,{headers:{Accept:'text/html'}}),env(),ctx);
    expect(response.status).toBe(404); expect(response.headers.get('Content-Type')).toContain('text/html'); expect(await response.text()).toContain('data-page="not-found"');
  }
  for (const [path, accept] of [['/nope/','application/json'],['/nope/','application/json, text/html;q=0'],['/missing/api/v3/user','text/html'],['/missing/people/members','text/html']]) {
    const response = await handler(new Request('https://login.test'+path,{headers:{Accept:accept}}),env(),ctx);
    expect(response.status).toBe(404); expect(await response.json()).toEqual({message:'Not found'});
  }
});
test('HTML pages forbid edge edits, so the zone analytics beacon cannot be added', async () => {
  for (const path of ['/','/legal/privacy','/legal/terms','/a/','/a/people']) expect((await request(path,undefined,false)).headers.get('Cache-Control')).toBe('no-store, no-transform');
  const missing = await handler(new Request('https://login.test/nope/',{headers:{Accept:'text/html'}}),env(),ctx);
  expect(missing.headers.get('Cache-Control')).toBe('no-store, no-transform');
});
test('the first legal addresses redirect and keep the language', async () => {
  for (const name of ['privacy','terms']) {
    const moved = await handler(new Request(`https://login.test/${name}?lang=es`,{redirect:'manual'}),env(),ctx);
    expect(moved.status).toBe(301); expect(moved.headers.get('Location')).toBe(`https://login.test/legal/${name}?lang=es`);
  }
});
test('only the production address may be indexed', async () => {
  const at = (origin: string, path: string) => handler(new Request(origin + path, { redirect: 'manual' }), env(), ctx);
  expect((await at('https://login.yesid.dev', '/legal/privacy')).headers.get('X-Robots-Tag')).toBeNull();
  for (const path of ['/legal/privacy', '/', '/privacy', '/auth/sites', '/nope/']) {
    expect((await at('https://staging.login.yesid.dev', path)).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  }
});
test('legal shells work without a session, are indexable and retain script CSP', async () => {
  for (const path of ['/legal/privacy','/legal/terms']) {
    const response = await request(path,undefined,false); const html = await response.text();
    expect(response.status).toBe(200); expect(html).not.toContain('noindex');
    expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self';");
    expect(response.headers.get('Content-Security-Policy')).not.toContain('unsafe-eval');
  }
  expect(await (await request('/')).text()).toContain('noindex');
  expect(await (await request('/legal/privacy',undefined,false)).text()).toContain('<title>Politique de confidentialité |');
  expect(await (await request('/legal/terms',undefined,false)).text()).toContain('<title>Conditions d’utilisation |');
  const missing = await (await handler(new Request('https://login.test/nope/',{headers:{Accept:'text/html;q=0.9'}}),env(),ctx)).text();
  expect(missing).toContain('noindex'); expect(missing).toContain('Page not found');
  for (const path of ['/legal/privacy','/legal/terms']) expect(await (await request(path,undefined,false)).text()).not.toContain('Sign in');
});

test('tree listings remove code and blob reads require the current content tree', async () => {
 const sha='ab'.repeat(20);
 const baseFetch=globalThis.fetch;
 globalThis.fetch=(async(input: string|URL|Request,init?:RequestInit)=>{
  const url=String(input);
  if(url.includes('/git/trees/')) { calls.push({url,init}); return Response.json({sha:'tree',truncated:false,tree:[{path:'src',type:'tree'},{path:'src/lib/content/en.json',type:'blob',sha},{path:'package.json',type:'blob',sha:'cd'.repeat(20)},{path:'.github',type:'tree'}]}); }
  return baseFetch(input,init);
 }) as typeof fetch;
 const tree=await (await request('/a/api/v3/repos/owner/a/git/trees/main?recursive=1')).json() as {tree:{path:string}[]};
 expect(tree.tree.map(e=>e.path)).toEqual(['src','src/lib/content/en.json']);
 expect((await request('/a/api/v3/repos/owner/a/git/blobs/'+sha)).status).toBe(200);
 expect((await request('/a/api/v3/repos/owner/a/git/blobs/'+'cd'.repeat(20))).status).toBe(403);
 expect((await request('/a/api/v3/repos/owner/a/commits?sha=main&path=package.json')).status).toBe(403);
});

test('blob authorization isolates clients, refreshes misses and fails closed on truncated trees', async()=>{
 db.exec("INSERT INTO membership(site_slug,user_id,role) VALUES ('b','a-user','it'); UPDATE site SET branch='blob-test' WHERE slug='a'");
 const sha='ef'.repeat(20), other='98'.repeat(20); let truncated=false; let fresh=false; let aTrees=0;
 const stub=globalThis.fetch;
 globalThis.fetch=(async(input:string|URL|Request,init?:RequestInit)=>{
  const url=String(input);
  if(url.includes('/git/trees/')) {
   calls.push({url,init}); if(url.includes('/a/')) aTrees++;
   return Response.json({truncated,tree:[{path:'src/lib/content/en.json',type:'blob',sha:url.includes('/a/') ? (fresh?other:sha) : '76'.repeat(20)},{path:'package.json',type:'blob',sha:'54'.repeat(20)}]});
  }
  return stub(input,init);
 }) as typeof fetch;
 const blob=(oid:string)=>({query:`query($owner:String!,$repo:String!){repository(owner:$owner,name:$repo){content_0:object(oid:"${oid}"){... on Blob{text isTruncated}}}}`,variables:{owner:'owner',repo:'a'}});
 expect((await request('/a/api/graphql',blob(sha))).status).toBe(200);
 expect((await request('/b/api/v3/repos/owner/b/git/blobs/'+sha)).status).toBe(403);
 fresh=true;
 expect((await request('/a/api/graphql',blob(other))).status).toBe(200); expect(aTrees).toBe(2);
 const before=calls.filter(c=>c.url.endsWith('/graphql')).length;
 expect((await request('/a/api/graphql',blob('54'.repeat(20)))).status).toBe(403);
 expect(calls.filter(c=>c.url.endsWith('/graphql'))).toHaveLength(before);
 truncated=true; db.exec("UPDATE site SET branch='truncated-test' WHERE slug='a'");
 expect((await request('/a/api/graphql',blob(other))).status).toBe(403);
 expect((await request('/a/api/v3/repos/owner/a/git/blobs/'+other)).status).toBe(403);
});

test('welcome refusal queues an admin alert without changing the warning reply',async()=>{
 const e=env(); e.ALERT_EMAIL='admin@example.test'; e.EMAIL_FROM='sender@example.test'; e.RESEND_API_KEY='fake';
 // Migration 0006 is applied for every test in beforeEach.
 const sent:Record<string,unknown>[]=[];
 globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body));sent.push(body);
  return new Response('private provider detail',{status:body.to==='admin@example.test'?200:422});
 }) as typeof fetch;
 const response=await handler(new Request('https://login.test/a/people/members',{method:'POST',headers:{Authorization:'Bearer fake','Content-Type':'application/json'},body:JSON.stringify({email:'new-alert@example.test'})}),e,ctx);
 expect(await response.json()).toEqual({success:true,emailSent:false});
 await Promise.all(pending.splice(0));
 expect(sent[1].text).toBe('Failure: welcome-email; HTTP 422');
});
test('a leftover cookie never breaks a save or a People change', async () => {
  const withCookie = (path: string, body: unknown) => handler(new Request('https://login.test' + path, {
    method: 'POST', headers: { Authorization: 'Bearer fake-session', Cookie: 'leftover=1', 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }), env(), ctx);
  expect((await withCookie('/a/api/graphql', commit())).status).toBe(200);
  const added = await withCookie('/a/people/members', { email: 'cookie-check@example.test' });
  expect(added.status).toBe(200);
  expect(db.query("SELECT count(*) AS n FROM user WHERE email='cookie-check@example.test'").get()).toEqual({ n: 1 });
});
