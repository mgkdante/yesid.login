import { test, expect } from 'bun:test';
import { readStep, saveStep, clearStep } from '../login/step.ts';
function fixture() {
  const values = new Map<string, string>();
  return { values, store: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } } };
}
test('S-11 and Clock: reload or locale change keeps context before and within 30 minutes after expiry, never digits or token', () => {
  const { values, store } = fixture();
  saveStep(store, 'a@example.test', 1000);
  const record = { email: 'a@example.test', sentAt: 1000, expiresAt: 301000 };
  expect(JSON.parse([...values.values()][0])).toEqual({ step: 'enter', ...record });
  for (const now of [1000, 300999, 301000, 2101000]) expect(readStep(store, now)).toEqual(record);
  expect(readStep(store, 2101001)).toBeUndefined(); expect(values.size).toBe(0);
  saveStep(store, 'a@example.test', 1000); clearStep(store); expect(values.size).toBe(0);
});
test('S-11 Reading a record: invalid, legacy, future and inconsistent records are removed', () => {
  for (const patch of [{ sentAt: undefined }, { sentAt: '1000' }, { sentAt: 1001 }, { expiresAt: 301001 }, { email: 1 }, { step: 'ask' }]) {
    const { values, store } = fixture();
    values.set('login.pending', JSON.stringify({ step: 'enter', email: 'a@example.test', sentAt: 1000, expiresAt: 301000, ...patch }));
    expect(readStep(store, 1000)).toBeUndefined(); expect(values.size).toBe(0);
  }
});
test('S-1, S-9, S-11 blocked storage never throws on read, write or removal', () => {
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  expect(readStep(blocked)).toBeUndefined(); expect(saveStep(blocked, 'a@example.test', 1)).toBe(false);
  expect(() => clearStep(blocked)).not.toThrow();
});


test('S-1, S-11 failed replacement removes previously saved pending context', () => {
  const { values, store } = fixture();
  expect(saveStep(store, 'first@example.test', 1000)).toBe(true);
  const failingWrite = { ...store, setItem() { throw Error('Storage full'); } };
  expect(saveStep(failingWrite, 'second@example.test', 2000)).toBe(false);
  expect(readStep(store, 2000)).toBeUndefined();
  expect(values.size).toBe(0);
});
