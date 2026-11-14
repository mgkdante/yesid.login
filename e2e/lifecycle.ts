/** Cleanup is best effort on interruption, but must never hold a process open indefinitely. */
export const CLEANUP_LIMIT_MS = 5_000;

async function deadline<T>(work: () => Promise<T>, limitMs: number, message: string): Promise<T> {
  let limit: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_, reject) => { limit = setTimeout(() => reject(new Error(message)), limitMs); })
    ]);
  } finally { clearTimeout(limit); }
}

export async function cleanup(tasks: (() => unknown)[], limitMs = CLEANUP_LIMIT_MS): Promise<void> {
  const results = await deadline(() => Promise.allSettled(tasks.map(task => Promise.resolve().then(task))), limitMs, 'Resource cleanup exceeded its deadline');
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Resource cleanup failed');
}

/** Cover creation and readiness with one deadline; reclaim resources that arrive late. */
export async function startResource<T extends { dispose(): Promise<unknown> }>(start: () => Promise<T>, ready: (resource: T) => Promise<unknown>, limitMs: number): Promise<T> {
  let resource: T | undefined;
  let expired = false;
  const pending = Promise.resolve().then(start).then(async created => {
    resource = created;
    if (expired) {
      await cleanup([() => created.dispose()]);
      throw new Error('Local Worker startup exceeded its command limit');
    }
    await ready(created);
    return created;
  });
  try {
    return await deadline(() => pending, limitMs, 'Local Worker startup exceeded its command limit');
  } catch (error) {
    expired = true;
    await cleanup([() => resource?.dispose()]).catch(error => console.error('Startup cleanup:', error));
    throw error;
  }
}
