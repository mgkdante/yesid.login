import { exampleSiteSql } from '../scripts/example-fixture.ts';
import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { retentionStatements, scheduled } from '../src/retention.ts';
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
  db.exec("INSERT INTO rateLimit VALUES ('old','old',1,unixepoch('2026-11-06 11:59:59')*1000),('boundary','boundary',1,unixepoch('2026-11-06T12:00:00Z')*1000)");
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
