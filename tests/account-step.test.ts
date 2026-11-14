import { test, expect } from 'bun:test';
import { readAccount, saveAccount, clearAccount } from '../login/step.ts';
const key = 'login.account.example';
function fixture() {
  const values = new Map<string, string>();
  const store = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  return { values, store };
}
test('A-8: locale reload keeps each stage, address and deadline, never a code', () => {
  for (const stage of ['address', 'current', 'new'] as const) {
    const { values, store } = fixture();
    expect(saveAccount(store, 'example', 'user', stage, 'new@example.test', 1000)).toBe(true);
    expect(JSON.parse(values.get(key)!)).toEqual({ userId: 'user', stage, newEmail: 'new@example.test', sentAt: 1000, expiresAt: 301000 });
    expect(readAccount(store, 'example', 'user', 1000)?.stage).toBe(stage);
    expect(readAccount(store, 'example', 'user', 2101000)?.newEmail).toBe('new@example.test');
    expect(readAccount(store, 'example', 'user', 2101001)).toBeUndefined();
  }
});
test('A-8 Reading a record: wrong user, malformed, future and inconsistent records are removed', () => {
  for (const patch of [{ userId: 'other' }, { stage: 'done' }, { newEmail: 4 }, { sentAt: 1001 }, { expiresAt: 301001 }, { sentAt: '1000' }]) {
    const { values, store } = fixture();
    values.set(key, JSON.stringify({ userId: 'user', stage: 'current', newEmail: 'new@example.test', sentAt: 1000, expiresAt: 301000, ...patch }));
    expect(readAccount(store, 'example', 'user', 1000)).toBeUndefined(); expect(values.size).toBe(0);
  }
});
test('A-5/A-9: cleanup and blocked storage do not turn success into failure', () => {
  const { values, store } = fixture();
  saveAccount(store, 'example', 'user', 'new', 'new@example.test', 1000);
  clearAccount(store, 'example'); expect(values.size).toBe(0);
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  expect(readAccount(blocked, 'example', 'user')).toBeUndefined();
  expect(saveAccount(blocked, 'example', 'user', 'address', '', 1000)).toBe(false);
  expect(() => clearAccount(blocked, 'example')).not.toThrow();
});

test('A-8: failed replacement removes stale context', () => {
  const { values, store } = fixture();
  saveAccount(store, 'example', 'user', 'current', 'first@example.test', 1000);
  expect(saveAccount({ ...store, setItem() { throw Error(); } }, 'example', 'user', 'new', 'next@example.test', 2000)).toBe(false);
  expect(values.size).toBe(0);
});
