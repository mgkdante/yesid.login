if (Bun.spawnSync(['node', '-p', 'process.versions.node.split(".")[0]']).stdout.toString().trim() !== '24') throw new Error('Build the sign-in app with Node 24 LTS on PATH.');

// Bundle application imports (including token JSON) for Node's Wrangler/Miniflare APIs.
const build = await Bun.build({
  entrypoints: ['e2e/sign-in.ts'], target: 'node',
  external: ['wrangler', 'playwright-core'],
  outdir: '.wrangler', naming: 'e2e-runner.mjs'
});
if (!build.success) throw new AggregateError(build.logs, 'Could not build the browser runner');
const runner = Bun.spawn(['node', '.wrangler/e2e-runner.mjs'], { stdout: 'inherit', stderr: 'inherit', serialization: 'json', ipc() {} });
// Windows process.kill terminates immediately; IPC lets Node run the same signal cleanup.
const forward = (signal: 'SIGINT' | 'SIGTERM') => process.platform === 'win32' ? runner.send({ type: 'e2e-signal', signal }) : runner.kill(signal);
const interrupt = () => forward('SIGINT');
const terminate = () => forward('SIGTERM');
process.on('SIGINT', interrupt);
process.on('SIGTERM', terminate);
try { process.exitCode = await runner.exited; }
finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', terminate);
  runner.disconnect();
}
export {};
