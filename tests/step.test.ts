import { test, expect } from 'bun:test';
import { readStep, saveStep, clearStep } from '../login/step.ts';
test('language reload restores only the address and step until five minutes, never a code or token', () => {
  const values = new Map<string, string>();
  const store = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  expect(saveStep(store, 'a@example.test', 301000)).toBe(true);
  expect(readStep(store, 1000)).toEqual({ email: 'a@example.test', expiresAt: 301000 });
  expect(JSON.parse([...values.values()][0])).toEqual({ step: 'enter', email: 'a@example.test', expiresAt: 301000 });
  expect(readStep(store, 301000)).toBeUndefined(); expect(values.size).toBe(0);
  saveStep(store, 'a@example.test', 301000); clearStep(store); expect(values.size).toBe(0);
});
test('blocked storage falls back without crashing', () => {
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
  expect(readStep(blocked)).toBeUndefined(); expect(saveStep(blocked, 'a@example.test', 1)).toBe(false);
});
