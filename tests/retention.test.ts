import { exampleSiteSql } from '../scripts/example-fixture.ts';
import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { retentionStatements, retainIps, scheduled, IP_CRON } from '../src/retention.ts';
import type { Env } from '../src/env.ts';

const now = '2026-11-07T12:00:00Z';
async function fixture() {
  const db = new Database(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const name of ['0001_auth', '0002_edit_log', '0003_sites', '0004_people', '0005_invite_safeguards', '0006_alerts', '0007_code_budget']) db.exec(await Bun.file(`migrations/${name}.sql`).text());
  db.exec(exampleSiteSql);
  return db;
}
function clean(db: Database) {
  const adapter = { prepare: (sql: string) => ({ bind: (...args: string[]) => () => db.query(sql).run(...args), sql }) } as unknown as D1Database;
  for (const statement of retentionStatements(adapter, now)) {
    if (typeof statement === 'function') (statement as () => unknown)();
    else db.exec((statement as unknown as { sql: string }).sql);
  }
}
const count = (db: Database, table: string) => (db.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

test('retention respects the exact 12 month instant in SQLite and ISO formats', async () => {
  const db = await fixture();
  for (const table of ['edit_log', 'people_log']) {
    const cols = table === 'edit_log' ? 'editor_id,repository,branch,paths' : 'site_slug,actor_id,action,target_id';
    const values = table === 'edit_log' ? "'gone','repo','main','[]'" : "'example','actor','add','gone'";
    for (const date of ['2025-11-07 11:59:59', '2025-11-07T11:59:59Z', '2025-11-07 12:00:00', '2025-11-07T12:00:00Z', '2025-11-07T13:00:01+01:00']) db.exec(`INSERT INTO ${table} (${cols},created_at) VALUES (${values},'${date}')`);
  }
  clean(db); expect(count(db, 'edit_log')).toBe(3); expect(count(db, 'people_log')).toBe(3); db.close();
});
test('expired dates normalize for both auth tables; numeric budgets use seconds and milliseconds', async () => {
  const db = await fixture();
  db.exec("INSERT INTO user VALUES ('member','M','m@example.test',1,NULL,0,0); INSERT INTO membership(site_slug,user_id,role) VALUES ('example','member','owner')");
  for (const [index, date] of ['2026-11-07 11:59:59', '2026-11-07T11:59:59Z', now, '2026-11-07T13:00:01+01:00'].entries()) {
    db.exec(`INSERT INTO session VALUES ('s${index}','${date}','t${index}',0,0,NULL,NULL,'member'); INSERT INTO verification VALUES ('v${index}','i','hash','${date}',0,0)`);
  }
  db.exec("INSERT INTO email_change_budget(user_id,started_at) VALUES ('member',unixepoch('2026-11-06 11:59:59')),('member',unixepoch('2026-11-06T12:00:00Z'))");
  db.exec("INSERT INTO rateLimit VALUES ('old','old',1,unixepoch('2026-11-06 12:59:59')*1000),('boundary','boundary',1,unixepoch('2026-11-06T13:00:00Z')*1000)");
  db.exec("INSERT INTO code_budget(key,started_at) VALUES ('k',unixepoch('2026-11-06 11:59:59')),('k',unixepoch('2026-11-06T12:00:00Z'))");
  clean(db);
  for (const table of ['session','verification','email_change_budget','rateLimit','code_budget']) expect(count(db,table)).toBe(1);
  expect(count(db,'user')).toBe(1); db.close();
});
test('removed people survive actor and target logs, members and notices survive, orphans cascade safely', async () => {
  const db = await fixture();
  for (const id of ['member','actor','target','editor','no-logs','old-logs']) db.exec(`INSERT INTO user VALUES ('${id}','Name','${id}@example.test',1,NULL,0,0)`);
  db.exec("INSERT INTO membership(site_slug,user_id,role) VALUES ('example','member','employee'); INSERT INTO invitation_notice VALUES ('example','member')");
  db.exec("INSERT INTO people_log(site_slug,actor_id,action,target_id,created_at) VALUES ('example','actor','remove','target','2026-11-01 00:00:00')");
  db.exec("INSERT INTO edit_log(editor_id,repository,branch,paths,created_at) VALUES ('old-logs','repo','main','[]','2025-11-07T11:59:59Z')");
  db.exec("INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt) VALUES ('a','a','p','no-logs',0,0); INSERT INTO email_change_budget(user_id,started_at) VALUES ('no-logs',9999999999)");
  db.exec("INSERT INTO edit_log(editor_id,repository,branch,paths,created_at) VALUES ('editor','repo','main','[]','2026-11-01T00:00:00Z')");
  clean(db);
  expect(db.query('SELECT id FROM user ORDER BY id').all()).toEqual([{ id: 'actor' },{ id: 'editor' },{ id: 'member' },{ id: 'target' }]);
  expect(count(db,'invitation_notice')).toBe(1); expect(count(db,'account')).toBe(0); expect(count(db,'email_change_budget')).toBe(0); db.close();
});
test('scheduled failure is contained and never logs the database error or addresses', async () => {
  const original = console.error, entries: unknown[][] = []; console.error = (...args) => { entries.push(args); };
  try {
    await scheduled({} as ScheduledController, { DB: { prepare() { throw Error('private@example.test'); } } } as unknown as Env, {} as ExecutionContext);
    expect(entries).toEqual([['Retention failed']]);
  } finally { console.error = original; }
});

// The policy says IP addresses kept for rate limiting are deleted after 1 day; the daily run alone kept them up to 2.
const d1 = (db: Database) => ({
  prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({ run: async () => ({ meta: { changes: db.query(sql).run(...args as string[]).changes } }) }) }),
  batch: async (statements: { run(): Promise<{ meta: { changes: number } }> }[]) => Promise.all(statements.map(s => s.run()))
}) as unknown as D1Database;
const at = (iso: string, deltaSeconds: number) => new Date(Date.parse(iso) + deltaSeconds * 1000).toISOString();

test('the hourly IP cleanup removes rate-limit rows within a day, and nothing else', async () => {
  const db = await fixture();
  const run = '2026-11-07T08:47:00Z';
  // Touched one second after a run: the worst case.
  db.exec(`INSERT INTO rateLimit VALUES ('worst','worst',1,${Date.parse(at(run, 1))})`);
  db.exec("INSERT INTO verification VALUES ('v','i','hash','2000-01-01',0,0)");
  let deletedAt = '';
  for (let hour = 1; hour <= 25 && !deletedAt; hour++) {
    const now = at(run, hour * 3600);
    await retainIps(d1(db), now);
    if (count(db, 'rateLimit') === 0) deletedAt = now;
  }
  expect(deletedAt).not.toBe('');
  expect(Date.parse(deletedAt) - Date.parse(at(run, 1))).toBeLessThanOrEqual(24 * 3600 * 1000);
  expect(count(db, 'verification')).toBe(1);
});

test('the hourly cron runs only the IP cleanup; the daily cron runs the full cleanup', async () => {
  const seen: string[] = [];
  const db = { prepare: (sql: string) => ({ bind: () => ({ sql, run: async () => { seen.push(sql); return { meta: { changes: 0 } }; } }) }),
    batch: async (statements: { sql: string; run(): Promise<unknown> }[]) => { for (const s of statements) await s.run(); return statements.map(() => ({ meta: { changes: 0 } })); } };
  const original = console.error; console.error = () => {};
  try {
    await scheduled({ cron: IP_CRON } as ScheduledController, { DB: db } as unknown as Env, {} as ExecutionContext);
    expect(seen.length).toBe(1);
    expect(seen[0]).toContain('rateLimit');
    seen.length = 0;
    await scheduled({ cron: '17 8 * * *' } as ScheduledController, { DB: db } as unknown as Env, {} as ExecutionContext);
    expect(seen.length).toBeGreaterThan(5);
  } finally { console.error = original; }
});

test('wrangler.toml schedules both the daily cleanup and the hourly IP cleanup', async () => {
  const toml = await Bun.file('wrangler.toml').text();
  expect(toml).toContain(`"${IP_CRON}"`);
  expect(toml).toContain('"17 8 * * *"');
  expect(IP_CRON).toMatch(/^\d{1,2} \* \* \* \*$/);
});
