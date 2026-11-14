import { expect, test } from 'bun:test';
import { removeShardTempDirectory, superviseShard } from '../e2e/launcher-lifecycle.ts';

for (const code of [0, 7]) {
  test(`successful folder cleanup preserves child exit ${code} and uses bounded filesystem retries`, () => {
    let options: unknown;
    const result = removeShardTempDirectory('fixture-temp', code, (_, value) => { options = value; });
    expect(result).toBe(code);
    expect(options).toEqual({ recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  for (const errorCode of ['EBUSY', 'EPERM']) test(`persistent ${errorCode} cleanup failure reports child status ${code}`, () => {
    const reports: string[] = [];
    const result = removeShardTempDirectory('fixture-temp', code,
      () => { throw Object.assign(new Error('handle is busy'), { code: errorCode }); },
      message => { reports.push(message); });
    expect(result).toBe(code || 1);
    expect(reports[0]).toContain('cleanup failure');
    expect(reports[0]).toContain('fixture-temp');
    expect(reports[0]).toContain(`child exit code ${code}`);
  });
}

function child() {
  let finish!: (code: number) => void;
  const exited = new Promise<number>(resolve => { finish = resolve; });
  const signals: unknown[] = [];
  let unreferenced = false;
  return { exited, finish, signals, get unreferenced() { return unreferenced; },
    send: (message: unknown) => { signals.push(message); },
    kill: (signal?: unknown) => { signals.push(signal); },
    unref: () => { unreferenced = true; } };
}
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('a cooperative interrupted child keeps its own exit code and cancels escalation', async () => {
  const runner = child();
  const control = superviseShard(runner, 'fixture', { limitMs: 10, windows: true });
  control.forward('SIGTERM'); runner.finish(143);
  expect(await control.exited).toBe(143);
  await wait(20);
  expect(runner.signals).toEqual([{ type: 'e2e-signal', signal: 'SIGTERM' }]);
  expect(runner.unreferenced).toBe(false);
});

for (const trigger of ['signal', 'IPC loss', 'send failure', 'kill failure']) {
  test(`a stuck child is force-terminated after ${trigger}`, async () => {
    const runner = child();
    if (trigger === 'send failure') runner.send = () => { throw new Error('IPC closed'); };
    if (trigger === 'kill failure') runner.kill = signal => { runner.signals.push(signal); throw new Error('kill failed'); };
    const reports: string[] = [];
    const control = superviseShard(runner, 'fixture', { limitMs: 10, windows: true, report: message => { reports.push(message); } });
    if (trigger === 'IPC loss') control.ipcDisconnected(); else control.forward('SIGINT');
    expect(await control.exited).toBe(137);
    expect(runner.signals).toContain('SIGKILL');
    expect(runner.unreferenced).toBe(true);
    expect(reports.some(message => message.includes('forcing termination'))).toBe(true);
  });
}

test('normal exit after IPC closure cancels escalation without reporting a failure', async () => {
  const runner = child(); const reports: string[] = [];
  const control = superviseShard(runner, 'fixture', { limitMs: 10, report: message => { reports.push(message); } });
  control.ipcDisconnected(); runner.finish(0);
  expect(await control.exited).toBe(0);
  await wait(20);
  expect(runner.signals).toEqual([]);
  expect(reports).toEqual([]);
});

test('repeated signals arm only one force-termination deadline', async () => {
  const runner = child();
  const control = superviseShard(runner, 'fixture', { limitMs: 10, windows: true, report() {} });
  control.forward('SIGTERM'); control.forward('SIGINT');
  expect(await control.exited).toBe(137);
  await wait(20);
  expect(runner.signals.filter(signal => signal === 'SIGKILL')).toHaveLength(1);
});

test('a real subprocess that closes IPC and stays alive is reaped by the parent bound', async () => {
  let control: ReturnType<typeof superviseShard> | undefined;
  let ipcLost = false;
  const runner = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000); process.disconnect();'], {
    stdout: 'ignore', stderr: 'ignore', ipc() {},
    onDisconnect() { if (control) control.ipcDisconnected(); else ipcLost = true; }
  });
  control = superviseShard(runner, 'stuck fixture', { limitMs: 50, report() {} });
  if (ipcLost) control.ipcDisconnected();
  try {
    expect(await control.exited).toBe(137);
    await runner.exited;
    expect(runner.exitCode).not.toBe(0);
  } finally { if (runner.exitCode === null) runner.kill('SIGKILL'); }
});
