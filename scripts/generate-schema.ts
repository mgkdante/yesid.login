// D1 cannot be reached by the Better Auth CLI, so its tables are compiled against an empty SQLite
// database here. The SQL goes to standard output only: migration 0001 is applied and never changes,
// so a schema change becomes a new, additive migration written by hand from this output.
import { Database } from 'bun:sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { authOptions } from '../src/auth.ts';

const options = authOptions({
  database: new Database(':memory:'),
  origin: 'http://localhost',
  secret: 'schema-generation-only-not-a-real-secret',
  sendCode: () => {}
});

const { compileMigrations } = await getMigrations(options);
process.stdout.write(await compileMigrations());
