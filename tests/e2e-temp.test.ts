import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createShardTempDirectory } from '../e2e/temp-directory.ts';

test('a long checkout allocates a short directory directly under the OS temp root', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'yl-workspace-'));
  const checkout = join(workspace, 'nested-checkout-'.repeat(9));
  mkdirSync(join(checkout, '.wrangler'), { recursive: true });
  const original = process.cwd();
  let temp: string | undefined;
  try {
    process.chdir(checkout);
    temp = createShardTempDirectory(1);
    expect(resolve(dirname(temp))).toBe(resolve(tmpdir()));
    expect(basename(temp)).toMatch(/^yl-e2e-1-[A-Za-z0-9]{6}$/);
    expect(basename(temp).length).toBe('yl-e2e-1-'.length + 6);
  } finally {
    process.chdir(original);
    if (temp) rmSync(temp, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('concurrent invocations of the same shard get separate storage roots', () => {
  const first = createShardTempDirectory(2);
  const second = createShardTempDirectory(2);
  try { expect(first).not.toBe(second); }
  finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});
