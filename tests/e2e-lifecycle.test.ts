import { expect, test } from 'bun:test';
import { cleanup, cleanupStarted, startResource } from '../e2e/lifecycle.ts';

test('cleanup attempts every resource even when one close throws', async () => {
  let disposed = false;
  await expect(cleanup([() => { throw new Error('close failed'); }, async () => { disposed = true; }])).rejects.toThrow('Resource cleanup failed');
  expect(disposed).toBe(true);
});

test('cleanup has a deadline even when a close never settles', async () => {
  await expect(cleanup([() => new Promise(() => {})], 10)).rejects.toThrow('Resource cleanup exceeded');
});

test('the startup deadline includes the call creating the Worker', async () => {
  await expect(startResource(() => new Promise<never>(() => {}), async () => {}, 10)).rejects.toThrow('Local Worker startup exceeded');
});

test('a hanging first fetch disposes the created Worker', async () => {
  let disposed = false;
  await expect(startResource(async () => ({ dispose: async () => { disposed = true; } }), () => new Promise(() => {}), 10)).rejects.toThrow('Local Worker startup exceeded');
  expect(disposed).toBe(true);
});

test('a Worker created after the deadline is still disposed', async () => {
  let create!: (worker: { dispose(): Promise<void> }) => void;
  let disposed!: () => void;
  const closed = new Promise<void>(resolve => { disposed = resolve; });
  const pending = new Promise<{ dispose(): Promise<void> }>(resolve => { create = resolve; });
  await expect(startResource(() => pending, async () => {}, 10)).rejects.toThrow('Local Worker startup exceeded');
  create({ dispose: async () => { disposed(); } });
  await closed;
});

for (const stage of ['Worker startup', 'Chromium launch']) {
  test(`cleanup preserves the original rejected ${stage} error`, async () => {
    const failure = new Error(`${stage} failed`);
    const pending = stage === 'Worker startup'
      ? startResource(async () => { throw failure; }, async () => {}, 100)
      : Promise.reject(failure);
    const run = async () => {
      try { await pending; }
      finally { await cleanup([() => cleanupStarted(pending, async () => {})]); }
    };
    await expect(run()).rejects.toBe(failure);
  });
}
