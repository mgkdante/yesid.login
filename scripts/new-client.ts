import { validSlug } from '../src/sites.ts';

const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

export function newClientSql(args: string[]): string {
  const fields = ['slug', 'owner', 'repo', 'branch', 'label', 'installation', 'person', 'role'];
  const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.slice(2);
    if (!args[i]?.startsWith('--') || !key || !fields.includes(key) || key in values || !args[i + 1]) {
      throw Error('Expected each required --option exactly once, followed by a value');
    }
    values[key] = args[i + 1]!;
  }
  for (const key of fields) if (!values[key]) throw Error(`Missing --${key}`);
  const { slug, owner, repo, branch, label, installation, person, role } = values as Record<typeof fields[number], string>;
  if (!validSlug(slug!)) throw Error('Invalid slug');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner!)) throw Error('Invalid owner');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repo!) || repo === '.' || repo === '..') throw Error('Invalid repo');
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(branch!) || /\.\.|\/\/|@\{|\.lock(?:\/|$)|[/.]$|\/\./.test(branch!)) throw Error('Invalid branch');
  if (!/^[1-9][0-9]{0,14}$/.test(installation!)) throw Error('Invalid installation');
  if (role !== 'owner' && role !== 'it') throw Error('Invalid role: expected owner or it');
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(person!) || person!.length > 254) throw Error('Invalid person email');
  if (!label!.trim() || /[\x00-\x1f\x7f]/.test(label!)) throw Error('Invalid label');
  const email = quote(person!.toLowerCase());
  return `-- Review before applying. Optional: uncomment only if the person has no user row.
-- INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt)
-- VALUES (${quote(crypto.randomUUID())},${quote(label!)},${email},0,datetime('now'),datetime('now'));
-- If the person is missing, the site slug NOT NULL constraint fails. Enable the optional insert first.
INSERT INTO site (slug,owner,repo,branch,label,installation_id)
VALUES (CASE WHEN EXISTS (SELECT 1 FROM user WHERE email = ${email}) THEN ${quote(slug!)} ELSE NULL END,${[owner, repo, branch, label, installation].map(v => quote(v!)).join(',')});
INSERT INTO membership (site_slug,user_id,role,confirmed_at)
SELECT ${quote(slug!)},id,${quote(role)},datetime('now') FROM user WHERE email = ${email};
`;
}

if (import.meta.main) {
  try { process.stdout.write(newClientSql(Bun.argv.slice(2))); }
  catch (error) { console.error(`new-client: ${(error as Error).message}`); process.exitCode = 1; }
}
