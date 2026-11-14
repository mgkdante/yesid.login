// Manual local regression probe: node e2e/reproduce-d1.mjs binding traffic 8836
// Compare `cli` with `binding`, and `idle` with `traffic`. Optional final argument: persistence directory.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unstable_startWorker } from 'wrangler';
const [mode = 'binding', activity = 'traffic', portText = '8836', stateArg] = process.argv.slice(2);
const port = Number(portText);
if (!['cli', 'binding'].includes(mode) || !['traffic', 'idle'].includes(activity) || port < 8830 || port > 8839) throw Error('Expected cli|binding idle|traffic port (8830..8839) [state]');
const watchdog = setTimeout(() => { console.error('Probe exceeded 120 seconds'); process.exit(1); }, 120_000);
const root = resolve(`.wrangler/d1-probe-${port}`);
const state = resolve(stateArg || `${root}/state`);
mkdirSync(root, { recursive: true });
const config = resolve(root, 'wrangler.json');
writeFileSync(resolve(root, 'worker.js'), `export default {async fetch(r,e) {await e.DB.prepare('INSERT INTO probe(n) VALUES (1)').run(); return new Response('ok')}}`);
writeFileSync(config, JSON.stringify({name: 'd1-probe', main: 'worker.js', compatibility_date: '2026-10-01', d1_databases: [{binding: 'DB', database_name: 'probe', database_id: 'local-probe'}]}));
process.env.WRANGLER_SEND_METRICS = 'false';
await promisify(execFile)('node', [resolve('node_modules/wrangler/wrangler-dist/cli.js'), '--config', config, 'd1', 'execute', 'probe', '--local', '--persist-to', state, '--command', 'CREATE TABLE IF NOT EXISTS probe(n INTEGER)']);
console.info('Initialized probe database');
const worker = await unstable_startWorker({config, dev: {server: {port, hostname: 'localhost'}, persist: state, remote: false, inspector: false, watch: false, logLevel: 'error'}});
let active = true;
let traffic;
let failures = 0;
try {
  console.info('Starting probe Worker');
  await worker.fetch(`http://localhost:${port}`);
  const runtime = worker.raw.runtimes.find(runtime => runtime.mf)?.mf;
  if (!runtime) throw Error('Local runtime unavailable');
  const {DB} = await runtime.getBindings(worker.config.name);
  await DB.prepare('CREATE TABLE IF NOT EXISTS probe(n INTEGER)').run();
  if (activity === 'traffic') traffic = (async () => {
    while (active) {
      const response = await fetch(`http://localhost:${port}`);
      await response.text();
      if (!response.ok) failures++;
    }
  })();
  const count = mode === 'binding' ? 1000 : 30;
  const before = await DB.prepare('SELECT count(*) AS n FROM probe WHERE n=2').first('n');
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    if (mode === 'binding') await DB.prepare('INSERT INTO probe(n) VALUES (2)').run();
    else await new Promise((accept, reject) => {
      const child = spawn('node', [resolve('node_modules/wrangler/wrangler-dist/cli.js'), '--config', config, 'd1', 'execute', 'probe', '--local', '--persist-to', state, '--command', 'INSERT INTO probe(n) VALUES (2)'], {stdio: ['ignore', 'ignore', 'pipe'], env: {...process.env, WRANGLER_LOG: 'debug'}});
      let error = '';
      child.stderr.on('data', chunk => error += chunk);
      child.on('error', reject);
      child.on('exit', code => code === 0 ? accept() : reject(Error(error)));
    });
  }
  const after = await DB.prepare('SELECT count(*) AS n FROM probe WHERE n=2').first('n');
  if (after - before !== count) throw Error('Fixture writes were lost');
  console.info(JSON.stringify({mode, activity, count, ms: Math.round(performance.now() - start), httpFailures: failures, state}));
  if (failures) throw Error('Concurrent HTTP writes failed');
} finally { active = false; try { await traffic; } finally { await worker.dispose(); clearTimeout(watchdog); } }
