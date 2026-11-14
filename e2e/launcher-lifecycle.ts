import { rmSync, type RmOptions } from 'node:fs';
import { CLEANUP_LIMIT_MS } from './lifecycle.ts';

export const PARENT_CLEANUP_LIMIT_MS = CLEANUP_LIMIT_MS + 2_000;
type Report = (message: string, error?: unknown) => void;

/** Retry filesystem handle release only; never rerun a scenario or lose a child failure. */
export function removeShardTempDirectory(path: string, childExitCode: number,
  remove: (path: string, options: RmOptions) => void = rmSync,
  report: Report = console.error): number {
  try {
    remove(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    return childExitCode;
  } catch (error) {
    report(`E2E cleanup failure: could not remove ${path} (child exit code ${childExitCode})`, error);
    return childExitCode || 1;
  }
}

type Runner = Pick<ReturnType<typeof Bun.spawn>, 'exited' | 'send' | 'kill' | 'unref'>;

/** IPC closure is also normal on exit; arm a bound, but only fail if the child lingers. */
export function superviseShard(runner: Runner, label: string,
  { limitMs = PARENT_CLEANUP_LIMIT_MS, report = console.error as Report,
    windows = process.platform === 'win32' } = {}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let forceExit!: (code: number) => void;
  const forced = new Promise<number>(resolve => { forceExit = resolve; });
  const boundCleanup = () => {
    if (settled || timer) return;
    timer = setTimeout(() => {
      report(`E2E ${label} exceeded its parent cleanup deadline; forcing termination`);
      try { runner.kill('SIGKILL'); }
      catch (error) { report(`E2E ${label} force termination failed`, error); }
      finally {
        try { runner.unref(); }
        catch (error) { report(`E2E ${label} process unref failed`, error); }
        finally { forceExit(137); }
      }
    }, limitMs);
  };
  const exited = Promise.race([runner.exited, forced]).finally(() => {
    settled = true;
    clearTimeout(timer);
  });
  return {
    exited,
    ipcDisconnected: boundCleanup,
    forward(signal: 'SIGINT' | 'SIGTERM') {
      if (settled) return;
      boundCleanup();
      try {
        if (windows) runner.send({ type: 'e2e-signal', signal });
        else runner.kill(signal);
      } catch (error) { report(`E2E ${label} signal forwarding failed`, error); }
    }
  };
}
