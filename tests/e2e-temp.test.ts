import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createShardTempDirectory } from '../e2e/temp-directory.ts';

test('a long checkout still gives D1 enough path space for its SQLite files', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'yl-workspace-'));
  const checkout = join(workspace, 'nested-checkout-'.repeat(9));
  mkdirSync(join(checkout, '.wrangler'), { recursive: true });
  const original = process.cwd();
  let temp: string | undefined;
  let db: Database | undefined;
  try {
    process.chdir(checkout);
    temp = createShardTempDirectory(1);
    const namespace = join(temp, 'miniflare-' + 'a'.repeat(32), 'd1', 'miniflare-D1DatabaseObject');
    mkdirSync(namespace, { recursive: true });
    db = new Database(join(namespace, 'b'.repeat(64) + '.sqlite'), { create: true });
    db.exec('CREATE TABLE fixture(n INTEGER); INSERT INTO fixture VALUES (42)');
    expect(db.query('SELECT n FROM fixture').get()).toEqual({ n: 42 });
    expect(resolve(dirname(temp))).toBe(resolve(tmpdir()));
  } finally {
    db?.close();
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
