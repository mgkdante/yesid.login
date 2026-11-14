import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Ephemeral D1 still opens SQLite files. Keep their names independent of checkout depth. */
export function createShardTempDirectory(shard: number): string {
  return mkdtempSync(join(tmpdir(), `yl-e2e-${shard}-`));
}
