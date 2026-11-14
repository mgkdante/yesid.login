import { SHARDS, parseShard } from './shards.ts';
import { removeShardTempDirectory, superviseShard } from './launcher-lifecycle.ts';
import { createShardTempDirectory } from './temp-directory.ts';
import { resolve } from 'node:path';

if (!Bun.which('node')) throw new Error('Put Node 24 LTS on PATH before running the sign-in browser suite.');
if (Bun.spawnSync(['node', '-p', 'process.versions.node.split(".")[0]']).stdout.toString().trim() !== '24') throw new Error('Build the sign-in app with Node 24 LTS on PATH.');

// Bundle application imports (including token JSON) for Node's Wrangler/Miniflare APIs.
const build = await Bun.build({
  entrypoints: ['e2e/sign-in.ts'], target: 'node',
  external: ['wrangler', 'playwright-core'],
  outdir: '.wrangler', naming: 'e2e-runner.mjs'
});
if (!build.success) throw new AggregateError(build.logs, 'Could not build the browser runner');
const args = process.argv.slice(2).filter(arg => arg !== '--');
let selected: number | undefined;
let sequential = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--shard') selected = parseShard(args[++i] || '', SHARDS.length);
  else if (args[i] === '--sequential') sequential = true;
  else throw new Error(`Unknown E2E argument: ${args[i]}`);
}
if (!selected && process.env.LOGIN_E2E_SHARD) selected = parseShard(process.env.LOGIN_E2E_SHARD, SHARDS.length);
const basePort = Number(process.env.LOGIN_E2E_PORT || 8799);
if (!Number.isInteger(basePort) || basePort < 1 || basePort + SHARDS.length - 1 > 65535) throw new Error('Invalid E2E base port');
const active = new Set<ReturnType<typeof superviseShard>>();
let interruptionExitCode = 0;
const forward = (signal: 'SIGINT' | 'SIGTERM') => {
  interruptionExitCode ||= signal === 'SIGINT' ? 130 : 143;
  for (const control of active) control.forward(signal);
};
const interrupt = () => forward('SIGINT');
const terminate = () => forward('SIGTERM');
process.on('SIGINT', interrupt);
process.on('SIGTERM', terminate);
const started = performance.now();
async function runShard(shard: number): Promise<number> {
  if (interruptionExitCode) return interruptionExitCode;
  const start = performance.now();
  // Chromium and Miniflare inherit a private temp root: cleanup can be audited per run.
  const temp = createShardTempDirectory(shard);
  let runner: ReturnType<typeof Bun.spawn> | undefined;
  let control: ReturnType<typeof superviseShard> | undefined;
  let ipcLost = false;
  let exitCode = 1;
  try {
    runner = Bun.spawn(['node', '.wrangler/e2e-runner.mjs'], {
      stdout: 'inherit', stderr: 'inherit', serialization: 'json', ipc() {},
      onDisconnect() { if (control) control.ipcDisconnected(); else ipcLost = true; },
      env: { ...process.env, LOGIN_E2E_SHARD: `${shard}/${SHARDS.length}`,
        LOGIN_E2E_PORT: String(basePort + shard - 1),
        LOGIN_E2E_SHOTS: resolve(process.env.LOGIN_E2E_SHOTS || '.wrangler/e2e', `shard-${shard}`, 'shots'),
        TMP: temp, TEMP: temp, TMPDIR: temp }
    });
    control = superviseShard(runner, `shard ${shard}/${SHARDS.length}`);
    if (ipcLost) control.ipcDisconnected();
    active.add(control);
    exitCode = await control.exited;
  } finally {
    if (control) active.delete(control);
    try { runner?.disconnect(); }
    catch (error) {
      console.error(`E2E shard ${shard} IPC cleanup failure (child exit code ${exitCode})`, error);
      exitCode ||= 1;
    }
    exitCode = removeShardTempDirectory(temp, exitCode);
    console.info(`timing - shard ${shard}/${SHARDS.length}: ${Math.round(performance.now() - start)} ms (including cleanup)`);
  }
  return exitCode;
}
try {
  const shards = selected ? [selected] : SHARDS.map((_, index) => index + 1);
  const results: number[] = [];
  if (sequential) { for (const shard of shards) results.push(await runShard(shard)); }
  else {
    const settled = await Promise.allSettled(shards.map(runShard));
    for (const result of settled) {
      if (result.status === 'fulfilled') results.push(result.value);
      else { console.error(result.reason); results.push(1); }
    }
  }
  process.exitCode = results.find(code => code !== 0) || interruptionExitCode;
} finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', terminate);
  console.info(`timing - suite: ${Math.round(performance.now() - started)} ms (including cleanup)`);
}
export {};
