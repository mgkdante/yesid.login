import { exampleSiteSql } from './example-fixture.ts';
import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Fake data only. Dedicated persistence directory, never the default local database.
const directory = resolve('.wrangler/s13-fixture');
mkdirSync(directory, { recursive: true });
const secret = 's13-local-only-fake-secret-at-least-32-characters';
writeFileSync('.dev.vars.s13', `BETTER_AUTH_SECRET=${secret}\nGITHUB_APP_PRIVATE_KEY=fake-not-a-private-key\nRESEND_API_KEY=fake-local-only\n`, { flag: 'wx' });
const token = 's13-local-session';
const signed = encodeURIComponent(token + '.' + createHmac('sha256', secret).update(token).digest('base64'));
const now = new Date().toISOString();
const expiry = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
writeFileSync(resolve(directory, 'seed.sql'), `${exampleSiteSql}
INSERT OR IGNORE INTO site(slug,owner,repo,branch,label,installation_id) VALUES ('choice','fixture','fixture','main','Choice','fake');

INSERT OR REPLACE INTO user (id,name,email,emailVerified,createdAt,updatedAt)
VALUES ('s13-user','Local fixture','local@example.test',1,'${now}','${now}');
INSERT OR REPLACE INTO membership (site_slug,user_id,role) VALUES ('example','s13-user','owner'),('choice','s13-user','owner');
INSERT OR REPLACE INTO session (id,expiresAt,token,createdAt,updatedAt,userId,site_slug)
VALUES ('s13-session','${expiry}','${token}','${now}','${now}','s13-user','example');
`);
writeFileSync(resolve(directory, 'browser.json'), JSON.stringify({ backendName: 'github', token: signed }));
process.stdout.write('Fake fixture written. Apply seed.sql only with --local and --persist-to .wrangler/s13-local.\n');
