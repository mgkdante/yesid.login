import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readdirSync } from 'node:fs';
import { newClientSql } from '../scripts/new-client.ts';

const args = ['--slug','example','--owner','example-owner','--repo','example-site','--branch','main','--label',"O'Brien'); DROP TABLE user; --",'--installation','123456','--person',"o'brien@example.test",'--role','owner'];
async function database() {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const name of readdirSync('migrations').filter(n => n.endsWith('.sql')).sort()) db.exec(await Bun.file(`migrations/${name}`).text());
  return db;
}
for (const role of ['owner', 'it']) test(`onboarding SQL provisions confirmed ${role} and escapes hostile strings`, async () => {
  const db = await database();
  const sql = newClientSql([...args.slice(0,-1),role]);
  db.exec(sql.split('\n').filter(line => line.startsWith('-- INSERT') || line.startsWith('-- VALUES')).map(line => line.slice(3)).join('\n'));
  db.exec(sql);
  expect(db.query('SELECT label FROM site WHERE slug=?').get('example')).toEqual({label:args[9]});
  expect(db.query('SELECT role,confirmed_at,invited_at FROM membership').get()).toEqual({role,confirmed_at:expect.any(String),invited_at:null});
  expect(db.query('SELECT count(*) AS n FROM user').get()).toEqual({n:1});
  db.close();
});
test('missing person fails explicitly; existing person needs no internal ID', async () => {
  const db = await database();
  expect(() => db.exec(newClientSql(args))).toThrow('NOT NULL');
  db.query('INSERT INTO user VALUES (?,?,?,0,NULL,0,0)').run('existing','Name',"o'brien@example.test");
  db.exec(newClientSql(args));
  expect(db.query('SELECT user_id FROM membership').get()).toEqual({user_id:'existing'});
  db.close();
});
test('CLI rejects malformed and hostile input without SQL output', () => {
  for (const [key,value] of [['slug','admin'],['owner',"x';--"],['repo','x/y'],['branch','a..b'],['branch','a.lock'],['installation','0'],['installation','1;DROP'],['person','a@b'],['person','x\n@example.test'],['role','employee'],['label','x\n-- SQL']]) {
    const input = [...args]; input[input.indexOf(`--${key}`)+1] = value!;
    const result = Bun.spawnSync([process.execPath,'scripts/new-client.ts',...input]);
    expect(result.exitCode).not.toBe(0); expect(result.stdout.toString()).toBe(''); expect(result.stderr.toString()).toContain('new-client:');
  }
  expect(() => newClientSql(args.slice(2))).toThrow('Missing');
  expect(() => newClientSql([...args,'--role','it'])).toThrow();
  expect(() => newClientSql([...args,'--unknown','x'])).toThrow();
});
