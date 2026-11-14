import { readFileSync, readdirSync } from 'node:fs';
import { unstable_startWorker, unstable_splitSqlQuery } from 'wrangler';
import { cleanup, startResource } from './lifecycle.ts';

/** One workerd owns both HTTP requests and fixture SQL. No second SQLite connection. */
export async function startLocalWorker(port: number, startupLimitMs: number) {
  const worker = await startResource(() => unstable_startWorker({
    config: 'wrangler.toml',
    entrypoint: 'e2e/worker.ts',
    envFiles: ['e2e/empty.env'],
    bindings: {
      BETTER_AUTH_SECRET: { type: 'secret_text', value: 'e2e-local-only-fake-secret-at-least-32-characters' },
      GITHUB_APP_PRIVATE_KEY: { type: 'secret_text', value: 'fake-not-a-private-key' },
      RESEND_API_KEY: { type: 'secret_text', value: 'fake-local-only' }
    },
    dev: {
      server: { port, hostname: 'localhost' }, inspector: false, remote: false,
      watch: false, persist: false, inferOriginFromRoutes: false,
      logLevel: 'error'
    }
  }), local => local.fetch(`http://localhost:${port}/`), startupLimitMs);
  try {
    const runtime = worker.raw.runtimes.find(runtime => runtime.mf)?.mf;
    if (!runtime) throw new Error('Wrangler did not expose its local Miniflare runtime');
    const { DB } = await runtime.getBindings<{ DB: D1Database }>(worker.config.name);
    const sql = async (command: string): Promise<string> => {
      const statements = unstable_splitSqlQuery(command).map(statement => DB.prepare(statement));
      return JSON.stringify(await DB.batch(statements), null, 2);
    };
    return {
      sql,
      async migrate() {
        // Storage is fresh for every run, so apply the production files once, in order.
        for (const name of readdirSync('migrations').filter(name => name.endsWith('.sql')).sort()) {
          await sql(readFileSync(`migrations/${name}`, 'utf8'));
        }
      },
      dispose: () => worker.dispose()
    };
  } catch (error) {
    await cleanup([() => worker.dispose()]).catch(error => console.error('Startup cleanup:', error));
    throw error;
  }
}
