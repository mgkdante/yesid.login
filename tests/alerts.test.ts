import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import type { Env } from '../src/env.ts';
import { scheduled } from '../src/retention.ts';
test('retention failure sends a private throttled alert in waitUntil', async () => {
  const db = new Database(':memory:');
  db.exec(await Bun.file('migrations/0006_alerts.sql').text());
  const pending: Promise<unknown>[] = []; const sent: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => { sent.push(String(init?.body)); return new Response('', { status: 200 }); }) as typeof fetch;
  const env = { ALERT_EMAIL: 'admin@example.test', EMAIL_FROM: 'sender@example.test', RESEND_API_KEY: 'fake', DB: { batch: async () => { throw Error('private detail'); }, prepare: (sql: string) => ({ bind: (...args: string[]) => ({ first: async () => db.query(sql).get(...args) }) }) } } as unknown as Env;
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext;
  try {
    await scheduled({} as ScheduledController, env, ctx); await Promise.all(pending.splice(0));
    await scheduled({} as ScheduledController, env, ctx); await Promise.all(pending.splice(0));
    expect(sent).toHaveLength(1); expect(sent[0]).toContain('retention'); expect(sent[0]).not.toContain('private detail');
    const message = JSON.parse(sent[0]);
    expect(message.subject).toBe('Login service failure');
    expect(message.text).toBe('Failure: retention');
    expect(message.to).toBe(env.ALERT_EMAIL);
  } finally { globalThis.fetch = original; db.close(); }
});

test('failed alerts never recurse and hourly claims are independent by kind', async () => {
  const { alertFailure } = await import('../src/alerts.ts');
  const db = new Database(':memory:'); db.exec(await Bun.file('migrations/0006_alerts.sql').text());
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => { calls++; throw Error('private provider detail'); }) as unknown as typeof fetch;
  const env = { ALERT_EMAIL: 'admin@example.test', EMAIL_FROM: 'sender@example.test', RESEND_API_KEY: 'fake', DB: { prepare: (sql: string) => ({ bind: (...args: string[]) => ({ first: async () => db.query(sql).get(...args) }) }) } } as unknown as Env;
  try {
    await Promise.all(Array.from({ length: 5 }, () => alertFailure(env, 'code-email', 503)));
    expect(calls).toBe(1);
    await alertFailure(env, 'welcome-email'); expect(calls).toBe(2);
    db.exec('UPDATE alert_throttle SET sent_at=unixepoch()-3600');
    await alertFailure(env, 'code-email', 429); expect(calls).toBe(3);
  } finally { globalThis.fetch = original; db.close(); }
});
