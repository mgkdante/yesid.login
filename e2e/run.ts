// Bundle application imports (including token JSON) for Node's Wrangler/Miniflare APIs.
const build = await Bun.build({
  entrypoints: ['e2e/sign-in.ts'], target: 'node',
  external: ['wrangler', 'playwright-core'],
  outdir: '.wrangler', naming: 'e2e-runner.mjs'
});
if (!build.success) throw new AggregateError(build.logs, 'Could not build the browser runner');
const runner = Bun.spawn(['node', '.wrangler/e2e-runner.mjs'], { stdout: 'inherit', stderr: 'inherit' });
process.exit(await runner.exited);
export {};
