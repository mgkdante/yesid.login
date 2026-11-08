import { exampleSiteSql } from '../scripts/example-fixture.ts';
// Real Better Auth against SQLite with the real migrations, because these guarantees live in its behavior.
import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createAuth, deliverCode, codeDelivery } from '../src/auth.ts';
import type { Env } from '../src/env.ts';
import { people } from '../src/people.ts';
import { account } from '../src/account.ts';
import { sameCodeFailure } from '../src/responses.ts';
import type { ClientSite } from '../src/sites.ts';

const MIGRATIONS = ['0001_auth', '0002_edit_log', '0003_sites', '0004_people', '0005_invite_safeguards', '0006_alerts', '0007_code_budget', '0008_session_site'];
const site = { slug: 'a', owner: 'owner', repo: 'a', branch: 'main', label: 'Site A', installation_id: '1', contentFiles: [] } as ClientSite;

let db: Database;
let code = '';
let recipient = '';
let codeType = '';
const originalFetch = globalThis.fetch;

const statement = (sql: string, args: unknown[] = []) => ({
  bind: (...values: unknown[]) => statement(sql, values),
  first: async () => db.query(sql).get(...(args as string[])),
  all: async () => ({ results: db.query(sql).all(...(args as string[])) }),
  run: async () => ({ meta: { changes: db.query(sql).run(...(args as string[])).changes } })
});
const d1 = {
  prepare: (sql: string) => statement(sql),
  batch: async (statements: ReturnType<typeof statement>[]) => {
    db.exec('BEGIN');
    try {
      const results = [];
      for (const item of statements) results.push(await item.run());
      db.exec('COMMIT');
      return results;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
} as unknown as D1Database;
const env = { DB: d1, EMAIL_FROM: 'test@example.test', RESEND_API_KEY: 'fixture-only' } as Env;

const auth = () => createAuth({
  database: db,
  origin: 'https://login.test',
  secret: 'fixture-only-secret-with-at-least-32-characters',
  sendCode: (email, value, type) => { code = value; recipient = email; codeType = type; }
});
const post = async (path: string, body: unknown) => sameCodeFailure(await auth().handler(new Request(`https://login.test/auth/api${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
})));
const requestCode = (email: string) => post('/email-otp/send-verification-otp', { email, type: 'sign-in' });
const signIn = (email: string, otp: string) => post('/sign-in/email-otp', { email, otp });
const manage = (method: string, suffix: string, body?: unknown) => people(new Request(`https://login.test/a${suffix}`, {
  method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {})
}), env, site, 'owner-user', suffix);

beforeEach(async () => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const name of MIGRATIONS) db.exec(await Bun.file(`migrations/${name}.sql`).text());
  db.exec(`INSERT INTO site (slug,owner,repo,branch,label,installation_id) VALUES ('a','owner','a','main','Site A','1')`);
  globalThis.fetch = (async () => Response.json({ id: 'sent' })) as unknown as typeof fetch;
  db.exec(exampleSiteSql);
  code = '';
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  db.close();
});

test('wrong codes read the same for real and unknown addresses, however many are tried', async () => {
  expect((await manage('POST', '/people/members', { email: 'real@example.test' })).status).toBe(200);
  const replies: Record<string, string[]> = {};
  for (const email of ['real@example.test', 'absent@example.test']) {
    expect((await requestCode(email)).status).toBe(200);
    replies[email] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      db.exec('DELETE FROM rateLimit; DELETE FROM email_change_budget');
      const response = await signIn(email, '000000');
      replies[email].push(`${response.status} ${await response.text()}`);
    }
  }
  expect(new Set(replies['real@example.test']).size).toBe(1);
  expect(replies['real@example.test']).toEqual(replies['absent@example.test']);
});

test('the attempt limit still holds behind the identical reply', async () => {
  expect((await manage('POST', '/people/members', { email: 'real@example.test' })).status).toBe(200);
  await requestCode('real@example.test');
  const right = code;
  for (let attempt = 0; attempt < 3; attempt += 1) await signIn('real@example.test', right === '000000' ? '111111' : '000000');
  db.exec('DELETE FROM rateLimit; DELETE FROM email_change_budget');
  expect((await signIn('real@example.test', right)).status).toBe(400);
});

test('a person added by an Owner can sign in with a real code', async () => {
  expect((await manage('POST', '/people/members', { email: 'new@example.test' })).status).toBe(200);
  await requestCode('new@example.test');
  const response = await signIn('new@example.test', code);
  expect(response.status).toBe(200);
  expect(response.headers.get('set-auth-token')).toBeTruthy();
});

test('someone removed from their last site cannot start a session, even with a valid code', async () => {
  await manage('POST', '/people/members', { email: 'gone@example.test' });
  await requestCode('gone@example.test');
  const valid = code;
  const { id } = db.query("SELECT id FROM user WHERE email = 'gone@example.test'").get() as { id: string };
  expect((await manage('DELETE', `/people/members/${id}`)).status).toBe(200);

  const response = await signIn('gone@example.test', valid);
  expect(response.status).toBe(400);
  expect(response.headers.get('set-auth-token')).toBeNull();
  expect(db.query('SELECT count(*) AS n FROM session').get()).toEqual({ n: 0 });
});

test('a code is only sent to someone with a site', async () => {
  const sent: string[] = [];
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    sent.push(String(init?.body));
    return Response.json({ id: 'sent' });
  }) as unknown as typeof fetch;
  await manage('POST', '/people/members', { email: 'member@example.test' });
  const { id } = db.query("SELECT id FROM user WHERE email = 'member@example.test'").get() as { id: string };
  sent.length = 0;

  await deliverCode(env, 'member@example.test', '123456', 'fr');
  expect(sent).toHaveLength(1);

  await manage('DELETE', `/people/members/${id}`);
  await deliverCode(env, 'member@example.test', '123456', 'fr');
  await deliverCode(env, 'nobody@example.test', '123456', 'fr');
  expect(sent).toHaveLength(1);
});

test('every address the People page accepts can receive a sign-in code', async () => {
  for (const email of ['a/b@example.test', 'x@y.c', 'x@a.123']) {
    expect((await manage('POST', '/people/members', { email })).status).toBe(400);
  }
  for (const email of ['plain@example.test', 'first.last+tag@sub.example.ca']) {
    expect((await manage('POST', '/people/members', { email })).status).toBe(200);
    db.exec('DELETE FROM rateLimit; DELETE FROM email_change_budget');
    expect((await requestCode(email)).status).toBe(200);
  }
});

async function accountFixture() {
  await manage('POST', '/people/members', { email: 'first@example.test' });
  await requestCode('first@example.test');
  const response = await signIn('first@example.test', code);
  db.exec("UPDATE session SET site_slug='a'");
  return response.headers.get('set-auth-token')!;
}
const rawAccountPost = (token: string, path: string, newEmail: string, otp?: string) => account(new Request('https://login.test/auth/api/email-otp/' + path, {
  method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'X-Login-Language': 'es' },
  body: JSON.stringify({ newEmail, otp, userId: 'another-user' })
}), env, { waitUntil: () => {} } as unknown as ExecutionContext, auth());
async function accountPost(token: string, path: string, email: string, otp?: string) {
  if (path === 'request-email-change') {
    await rawAccountPost(token, 'send-verification-otp', email);
    expect(recipient).toBe('first@example.test');
    expect(codeType).toBe('email-verification');
    otp = code;
  }
  return rawAccountPost(token, path, email, otp);
}

test('real Better Auth changes only self, revokes every session atomically and notifies old email', async () => {
  const token = await accountFixture();
  await requestCode('first@example.test'); await signIn('first@example.test', code);
  expect((await accountPost(token, 'request-email-change', 'new@example.test')).status).toBe(200);
  expect(recipient).toBe('new@example.test');
  expect(codeType).toBe('change-email');
  const otp = code;
  const stored = db.query("SELECT value FROM verification WHERE identifier LIKE 'change-email%'").get() as { value: string };
  expect(stored.value).not.toContain(otp);
  const mails: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => { mails.push(JSON.parse(String(init?.body))); return Response.json({}); }) as typeof fetch;
  expect((await accountPost(token, 'change-email', 'new@example.test', otp)).status).toBe(200);
  expect(db.query("SELECT email FROM user WHERE email = 'new@example.test'").get()).toBeTruthy();
  expect(db.query('SELECT count(*) AS n FROM session').get()).toEqual({ n: 0 });
  expect(mails[0].to).toBe('first@example.test');
  expect(String(mails[0].html)).toContain('lang="es"'); expect(JSON.stringify(mails)).not.toContain('new@example.test');
  const session = await auth().api.getSession({ headers: new Headers({ Authorization: 'Bearer ' + token }) });
  expect(session).toBeNull();
  await requestCode('new@example.test');
  expect((await signIn('new@example.test', code)).status).toBe(200);
});
test('real Better Auth account replies hide occupied addresses and invalid code attempts', async () => {
  const token = await accountFixture();
  await manage('POST', '/people/members', { email: 'occupied@example.test' });
  const replies = [];
  for (const email of ['available@example.test', 'occupied@example.test']) {
    db.exec('DELETE FROM rateLimit; DELETE FROM email_change_budget');
    replies.push(await (await accountPost(token, 'request-email-change', email)).text());
  }
  expect(replies[0]).toBe(replies[1]);
  const failures = [];
  for (const email of ['available@example.test', 'occupied@example.test']) {
    const attempts = [];
    for (let i = 0; i < 5; i++) { db.exec('DELETE FROM rateLimit; DELETE FROM email_change_budget'); const response = await accountPost(token, 'change-email', email, 'wrong'); attempts.push([response.status, await response.text()]); }
    failures.push(attempts);
  }
  expect(failures[0]).toEqual(failures[1]);
  expect((await accountPost('', 'request-email-change', 'new@example.test')).status).toBe(401);
  expect((await accountPost(token, 'request-email-change', 'bad')).status).toBe(400);
});

test('email change codes expire and cannot be used after three wrong attempts', async () => {
  const token = await accountFixture();
  await accountPost(token, 'request-email-change', 'limited@example.test');
  const valid = code;
  for (let attempt = 0; attempt < 3; attempt++) expect((await accountPost(token, 'change-email', 'limited@example.test', 'wrong')).status).toBe(400);
  expect((await accountPost(token, 'change-email', 'limited@example.test', valid)).status).toBe(400);
  db.exec('DELETE FROM rateLimit; DELETE FROM email_change_budget');
  await accountPost(token, 'request-email-change', 'expired@example.test');
  const expired = code;
  db.exec("UPDATE verification SET expiresAt = '2000-01-01T00:00:00.000Z' WHERE identifier LIKE 'change-email%'");
  expect((await accountPost(token, 'change-email', 'expired@example.test', expired)).status).toBe(400);
  expect(db.query("SELECT email FROM user WHERE email='first@example.test'").get()).toBeTruthy();
});

test('the public sign-in sender cannot be used for a new-address email-change code', async () => {
  const response = await post('/email-otp/send-verification-otp', { email: 'stranger@example.test', type: 'change-email' });
  expect(response.status).toBe(400);
});


test('expired invitations fail every gate and a different valid site remains usable', async () => {
  const { hasSite, isMember, sitesFor } = await import('../src/sites.ts');
  const { canManage } = await import('../src/people.ts');
  await manage('POST', '/people/members', { email: 'expired@example.test' });
  await requestCode('expired@example.test'); const valid = code;
  const { id } = db.query("SELECT id FROM user WHERE email='expired@example.test'").get() as { id: string };
  db.exec("UPDATE membership SET invited_at=datetime('now','-8 days') WHERE user_id='" + id + "'");
  expect(await hasSite(d1, 'expired@example.test')).toBe(false);
  expect(await isMember(d1, 'a', id)).toBe(false);
  expect(await canManage(d1, 'a', id)).toBe(false);
  expect(await sitesFor(d1, id)).toEqual([]);
  expect((await signIn('expired@example.test', valid)).status).toBe(400);
  db.exec("INSERT INTO membership (site_slug,user_id,role,invited_at) VALUES ('example','" + id + "','employee',datetime('now'))");
  expect(await hasSite(d1, 'expired@example.test')).toBe(true);
  await requestCode('expired@example.test');
  expect((await signIn('expired@example.test', code)).status).toBe(200);
  expect(await isMember(d1, 'a', id)).toBe(false);
  expect(db.query('SELECT site_slug FROM invitation_notice').all()).toEqual([{ site_slug: 'example' }]);
});

test('confirmation and its notification fire once per membership; renewal is limited and audited', async () => {
  await manage('POST', '/people/members', { email: 'once@example.test' });
  await requestCode('once@example.test'); await signIn('once@example.test', code);
  expect(db.query('SELECT confirmed_at FROM membership').get()).toHaveProperty('confirmed_at');
  db.exec('DELETE FROM invitation_notice');
  await requestCode('once@example.test'); await signIn('once@example.test', code);
  expect(db.query('SELECT * FROM invitation_notice').all()).toHaveLength(0);
  await manage('POST', '/people/members', { email: 'renew@example.test' });
  db.exec("UPDATE membership SET invited_at=datetime('now','-8 days') WHERE confirmed_at IS NULL");
  expect((await manage('POST', '/people/members', { email: 'renew@example.test' })).status).toBe(200);
  expect(db.query("SELECT * FROM people_log WHERE action='add'").all()).toHaveLength(3);
  expect((await manage('POST', '/people/members', { email: 'renew@example.test' })).status).toBe(200);
  expect(db.query("SELECT * FROM people_log WHERE action='add'").all()).toHaveLength(3);
});

test('current-address proof is mandatory and per-account budget survives changing IPs', async () => {
  const token = await accountFixture();
  expect((await rawAccountPost(token, 'request-email-change', 'attacker@example.test')).status).toBe(400);
  for (let i=0; i<4; i++) {
    db.exec('DELETE FROM rateLimit');
    expect((await rawAccountPost(token, 'send-verification-otp', 'ignored@example.test')).status).toBe(200);
    expect(recipient).toBe('first@example.test');
  }
  db.exec('DELETE FROM rateLimit');
  expect((await rawAccountPost(token, 'send-verification-otp', 'other@example.test')).status).toBe(429);
  db.exec('UPDATE email_change_budget SET started_at=unixepoch()-3601');
  expect((await rawAccountPost(token, 'send-verification-otp', 'other@example.test')).status).toBe(200);
});


test('a failed session deletion rolls back the email update itself', async () => {
  const token = await accountFixture();
  await accountPost(token,'request-email-change','atomic@example.test'); const otp=code;
  db.exec("CREATE TRIGGER refuse_session_delete BEFORE DELETE ON session BEGIN SELECT RAISE(ABORT,'fixture deletion failure'); END");
  expect((await accountPost(token,'change-email','atomic@example.test',otp)).status).toBe(400);
  expect(db.query("SELECT email FROM user WHERE email='first@example.test'").get()).toBeTruthy();
  expect(db.query('SELECT count(*) AS n FROM session').get()).toEqual({ n: 1 });
});
test('expired invitations receive no email; renewal consumes the site hourly budget', async () => {
  await manage('POST','/people/members',{email:'expire@example.test'});
  db.exec("UPDATE membership SET invited_at=datetime('now','-8 days')");
  let sends=0;
  globalThis.fetch=(async()=>{sends++;return Response.json({});}) as unknown as typeof fetch;
  await deliverCode(env,'expire@example.test','123456','fr'); expect(sends).toBe(0);
  for(let i=0;i<19;i++) db.exec("INSERT INTO people_log(site_slug,actor_id,action,target_id) VALUES ('a','owner-user','add','fixture')");
  expect((await manage('POST','/people/members',{email:'expire@example.test'})).status).toBe(429);
  expect(sends).toBe(0);
});


test('Owner notice is French and reaches the Owner, and its failure cannot undo sign-in', async () => {
  const { confirmInvitations } = await import('../src/invitations.ts');
  db.exec("INSERT INTO user VALUES ('owner-user','Owner','owner@example.test',1,NULL,0,0); INSERT INTO membership(site_slug,user_id,role) VALUES ('a','owner-user','owner')");
  await manage('POST','/people/members',{email:'notice@example.test'});
  await requestCode('notice@example.test'); expect((await signIn('notice@example.test',code)).status).toBe(200);
  const {id}=db.query("SELECT id FROM user WHERE email='notice@example.test'").get() as {id:string};
  let sends=0;
  globalThis.fetch=(async (_input: unknown,init?:RequestInit)=>{
    sends++; const body=JSON.parse(String(init?.body)); expect(body.to).toBe('owner@example.test');
    expect(body.html).toContain('lang="fr"'); expect(body.html).toContain('/a/people');
    return new Response('',{status:500});
  }) as typeof fetch;
  await confirmInvitations(env,id); expect(sends).toBe(1);
  expect(db.query('SELECT count(*) AS n FROM session').get()).toEqual({n:1});
});

test('an Owner alert that fails is kept and retried, under one key, until it is accepted', async () => {
  const { confirmInvitations, retryNotices } = await import('../src/invitations.ts');
  db.exec(`INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES
    ('site-owner','O','owner@example.test',1,'2026-01-01','2026-01-01'),('person','P','person@example.test',1,'2026-01-01','2026-01-01');
    INSERT INTO membership (site_slug,user_id,role,confirmed_at) VALUES ('a','site-owner','owner',datetime('now'));
    INSERT INTO membership (site_slug,user_id,role,invited_at) VALUES ('a','person','employee',datetime('now'));
    INSERT INTO invitation_notice (site_slug,user_id) VALUES ('a','person');`);
  const keys: (string | null)[] = [];
  let status = 500;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    keys.push(new Headers(init?.headers).get('Idempotency-Key'));
    return new Response('{}', { status });
  }) as unknown as typeof fetch;
  await confirmInvitations(env, 'person');
  expect(db.query('SELECT count(*) AS n FROM invitation_notice').get()).toEqual({ n: 1 });
  status = 200;
  await retryNotices(env, 'a');
  expect(db.query('SELECT count(*) AS n FROM invitation_notice').get()).toEqual({ n: 0 });
  await retryNotices(env, 'a');
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[0]).toBeTruthy();
});

test('an Owner sees only edits on their own site, and nothing about sign-ins elsewhere', async () => {
  db.exec(`INSERT INTO site (slug,owner,repo,branch,label,installation_id) VALUES ('b','owner','b','main','Site B','2');
    INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('person','P','person@example.test',1,'2026-01-01','2026-01-01');
    INSERT INTO membership (site_slug,user_id,role,confirmed_at) VALUES ('b','person','employee',datetime('now'));
    INSERT INTO session (id,expiresAt,token,createdAt,updatedAt,userId) VALUES ('s','2099-01-01','t','2026-01-01','2026-01-01','person');
    INSERT INTO edit_log (editor_id,repository,branch,paths,site_slug) VALUES ('person','owner/b','main','[]','b');`);
  await manage('POST', '/people/members', { email: 'person@example.test' });
  const members = await (await manage('GET', '/people/members')).json() as Record<string, unknown>[];
  const person = members.find((member) => member.email === 'person@example.test')!;
  expect(person.lastEdit).toBeNull();
  expect(Object.keys(person)).not.toContain('lastSignIn');
  db.exec("INSERT INTO edit_log (editor_id,repository,branch,paths,site_slug) VALUES ('person','owner/a','main','[]','a')");
  const after = await (await manage('GET', '/people/members')).json() as Record<string, unknown>[];
  expect(after.find((member) => member.email === 'person@example.test')!.lastEdit).toBeTruthy();
});

for (const theme of ['dark','light'] as const) for (const type of ['sign-in','email-verification','change-email']) {
  test(`real ${type} code delivery preserves ${theme} header into the email`, async () => {
    await manage('POST', '/people/members', { email: 'owner@example.test' });
    const messages: { html: string }[] = [], pending: Promise<unknown>[] = [];
    globalThis.fetch = (async (_input, init) => { messages.push(JSON.parse(String(init?.body))); return Response.json({ id: 'fake' }); }) as typeof fetch;
    const headers = { 'Content-Type': 'application/json', 'X-Login-Language': 'en', 'X-Login-Theme': theme };
    const delivery = codeDelivery(new Request('https://login.test', { headers }),env,{ waitUntil: promise => { pending.push(promise); } } as ExecutionContext);
    delivery('owner@example.test','482915',type);
    await Promise.all(pending);
    expect(messages).toHaveLength(1);
    expect(messages[0].html).toContain(`content="${theme}"`);
    expect(messages[0].html).toContain(theme === 'dark' ? '#141414' : '#F3F6FB');
  });
}

test('sessions omit IP and browser while signed bearer and IP limits still work', async()=>{
 await manage('POST','/people/members',{email:'session@example.test'});
 const withIp=(path:string,body:unknown)=>auth().handler(new Request('https://login.test/auth/api'+path,{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'192.0.2.55','user-agent':'Test Browser'},body:JSON.stringify(body)}));
 await withIp('/email-otp/send-verification-otp',{email:'session@example.test',type:'sign-in'});
 const response=await withIp('/sign-in/email-otp',{email:'session@example.test',otp:code});
 expect(response.status).toBe(200);
 const row=db.query('SELECT token,ipAddress,userAgent FROM session').get() as {token:string;ipAddress:string|null;userAgent:string|null};
 expect(row.ipAddress || null).toBeNull(); expect(row.userAgent || null).toBeNull();
 expect(await auth().api.getSession({headers:new Headers({Authorization:`Bearer ${row.token}`})})).toBeNull();
 expect(await auth().api.getSession({headers:new Headers({Authorization:`Bearer ${response.headers.get('set-auth-token')}`})})).toBeTruthy();
 for(let i=0;i<4;i++) expect((await withIp('/email-otp/send-verification-otp',{email:'session@example.test',type:'sign-in'})).status).toBe(200);
 expect((await withIp('/email-otp/send-verification-otp',{email:'session@example.test',type:'sign-in'})).status).toBe(429);
});

for (const unavailable of [false,true]) test(`code failure alert stays in background and contains no recipient or code (${unavailable})`,async()=>{
 await manage('POST','/people/members',{email:'alert-member@example.test'});
 const pending:Promise<unknown>[]=[]; const sent:Record<string,unknown>[]=[];
 const alertEnv={...env,ALERT_EMAIL:'admin@example.test'};
 globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body)); sent.push(body);
  if(body.to==='admin@example.test') return new Response('',{status:200});
  if(unavailable) throw Error('provider detail with an address');
  return new Response('provider detail with an address',{status:503});
 }) as typeof fetch;
 codeDelivery(new Request('https://login.test'),alertEnv,{waitUntil:(p:Promise<unknown>)=>pending.push(p)} as unknown as ExecutionContext)('alert-member@example.test','123456','sign-in');
 expect(pending).toHaveLength(1); await Promise.all(pending);
 expect(sent).toHaveLength(2);
 expect(sent[1].text).toBe(unavailable?'Failure: code-email':'Failure: code-email; HTTP 503');
});

test('sign-in verification also keeps its IP budget',async()=>{
 for(let i=0;i<11;i++) {
  const response=await auth().handler(new Request('https://login.test/auth/api/sign-in/email-otp',{method:'POST',headers:{'Content-Type':'application/json','cf-connecting-ip':'192.0.2.77'},body:JSON.stringify({email:'unknown@example.test',otp:'000000'})}));
  expect(response.status).toBe(i===10?429:400);
 }
});

test('Owner notice refusal alerts without exposing the invitation',async()=>{
 const {confirmInvitations}=await import('../src/invitations.ts');
 await manage('POST','/people/members',{email:'owner-alert@example.test'});
 await requestCode('owner-alert@example.test'); await signIn('owner-alert@example.test',code);
 const user=db.query("SELECT id FROM user WHERE email='owner-alert@example.test'").get() as {id:string};
 db.exec("INSERT INTO user VALUES ('notice-owner','Owner','owner@example.test',1,NULL,0,0); INSERT INTO membership(site_slug,user_id,role) VALUES ('a','notice-owner','owner')");
 const sent:Record<string,unknown>[]=[];
 globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));sent.push(body);return new Response('',{status:body.to==='admin@example.test'?200:503});}) as typeof fetch;
 await confirmInvitations({...env,ALERT_EMAIL:'admin@example.test'},user.id);
 expect(sent[1].text).toBe('Failure: owner-notice; HTTP 503');
});

test('old-address refusal alerts in background after a successful email change',async()=>{
 const token=await accountFixture();
 await accountPost(token,'request-email-change','changed-alert@example.test'); const otp=code;
 const sent:Record<string,unknown>[]=[]; const pending:Promise<unknown>[]=[];
 globalThis.fetch=(async(_url:unknown,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));sent.push(body);return new Response('',{status:body.to==='admin@example.test'?200:503});}) as typeof fetch;
 const response=await account(new Request('https://login.test/auth/api/email-otp/change-email',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({newEmail:'changed-alert@example.test',otp})}),{...env,ALERT_EMAIL:'admin@example.test'},{waitUntil:(p:Promise<unknown>)=>pending.push(p)} as unknown as ExecutionContext,auth());
 expect(response.status).toBe(200); expect(pending).toHaveLength(1); await Promise.all(pending);
 expect(sent[1].text).toBe('Failure: old-address-notice; HTTP 503');
});
