import { exampleSiteSql } from '../scripts/example-fixture.ts';
import { Database } from 'bun:sqlite';
import { test, expect } from 'bun:test';

test('site migration adds sites, memberships and the log column, and seeds no client', async () => {
  const db = new Database(':memory:'); db.exec('PRAGMA foreign_keys = ON');
  for (const name of ['0001_auth', '0002_edit_log']) db.exec(await Bun.file(`migrations/${name}.sql`).text());
  db.exec("INSERT INTO edit_log (editor_id,repository,branch,paths) VALUES ('someone','other/repo','main','[]')");
  const migration = await Bun.file('migrations/0003_sites.sql').text();
  expect(migration).not.toMatch(/^\s*(INSERT|UPDATE)\b/im);
  db.exec(migration);
  expect(db.query('SELECT count(*) AS n FROM site').get()).toEqual({ n: 0 });
  expect(db.query('SELECT site_slug FROM edit_log').all()).toEqual([{ site_slug: null }]);
  db.exec(exampleSiteSql);
  db.exec("INSERT INTO user VALUES ('member','Member','member@example.test',1,NULL,0,0)");
  db.exec("INSERT INTO membership (site_slug,user_id,role) VALUES ('example','member','owner')");
  expect(() => db.exec("INSERT INTO membership (site_slug,user_id,role) VALUES ('example','member','admin')")).toThrow();
  expect(() => db.exec("INSERT INTO membership (site_slug,user_id,role) VALUES ('missing','member','it')")).toThrow();
  db.close();
});

test('a removed site retires its slug, and no new site can take it', async () => {
  const db = new Database(':memory:'); db.exec('PRAGMA foreign_keys = ON');
  for (const name of ['0001_auth', '0002_edit_log', '0003_sites', '0004_people', '0005_invite_safeguards', '0006_alerts', '0007_code_budget', '0008_session_site', '0009_retired_slug']) db.exec(await Bun.file(`migrations/${name}.sql`).text());
  db.exec(exampleSiteSql);
  db.exec("INSERT INTO user VALUES ('member','Member','member@example.test',1,NULL,0,0); INSERT INTO membership (site_slug,user_id,role) VALUES ('example','member','owner')");
  db.exec("DELETE FROM site WHERE slug = 'example'");
  expect(db.query('SELECT count(*) AS n FROM membership').get()).toEqual({ n: 0 });
  expect(db.query('SELECT slug FROM retired_slug').all()).toEqual([{ slug: 'example' }]);
  expect(() => db.exec(exampleSiteSql)).toThrow('slug_retired');
  db.exec(exampleSiteSql.replaceAll("'example'", "'example-two'"));
  expect(db.query('SELECT count(*) AS n FROM site').get()).toEqual({ n: 1 });
  db.close();
});

test('a site with history cannot be deleted, so it is retired in place: access ends and the logs stay', async () => {
  const { readdirSync } = await import('node:fs');
  const db = new Database(':memory:'); db.exec('PRAGMA foreign_keys = ON');
  for (const name of readdirSync('migrations').filter(n => n.endsWith('.sql')).sort()) db.exec(await Bun.file(`migrations/${name}`).text());
  db.exec(exampleSiteSql);
  db.exec(`INSERT INTO user VALUES ('member','Member','member@example.test',1,NULL,0,0);
    INSERT INTO membership (site_slug,user_id,role,confirmed_at) VALUES ('example','member','owner',datetime('now'));
    INSERT INTO session (id,expiresAt,token,createdAt,updatedAt,userId,site_slug) VALUES ('s',9999999999999,'t',0,0,'member','example');
    INSERT INTO edit_log (editor_id,repository,branch,paths,site_slug) VALUES ('member','example-owner/example-site','main','[]','example');
    INSERT INTO people_log (site_slug,actor_id,action,target_id) VALUES ('example','member','add','member')`);
  expect(() => db.exec("DELETE FROM site WHERE slug = 'example'")).toThrow('FOREIGN KEY');
  db.exec("UPDATE site SET retired_at = datetime('now') WHERE slug = 'example'");
  expect(db.query('SELECT count(*) AS n FROM membership').get()).toEqual({ n: 0 });
  expect(db.query('SELECT count(*) AS n FROM session').get()).toEqual({ n: 0 });
  expect(db.query('SELECT (SELECT count(*) FROM edit_log) + (SELECT count(*) FROM people_log) AS n').get()).toEqual({ n: 2 });
  expect(() => db.exec("INSERT INTO membership (site_slug,user_id,role) VALUES ('example','member','it')")).toThrow('site_retired');
  expect(() => db.exec("UPDATE site SET retired_at = NULL WHERE slug = 'example'")).toThrow('site_retired');
  expect(() => db.exec(exampleSiteSql.replace('INSERT OR IGNORE', 'INSERT'))).toThrow();
  db.close();
});

test('0005 confirms existing members and keeps old Worker additions usable', async () => {
  const db=new Database(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for(const name of ['0001_auth','0002_edit_log','0003_sites','0004_people']) db.exec(await Bun.file(`migrations/${name}.sql`).text());
  db.exec(exampleSiteSql);
  db.exec("INSERT INTO user VALUES ('u','U','u@example.test',1,NULL,0,0); INSERT INTO membership(site_slug,user_id,role) VALUES ('example','u','employee')");
  db.exec(await Bun.file('migrations/0005_invite_safeguards.sql').text());
  expect(db.query('SELECT confirmed_at FROM membership').get()).toHaveProperty('confirmed_at',expect.any(String));
  db.exec("INSERT INTO user VALUES ('v','V','v@example.test',1,NULL,0,0); INSERT INTO membership(site_slug,user_id,role) VALUES ('example','v','employee')");
  expect(db.query("SELECT invited_at FROM membership WHERE user_id='v'").get()).toHaveProperty('invited_at',expect.any(String));
  db.close();
});
