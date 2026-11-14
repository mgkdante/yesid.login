import { expect, test } from 'bun:test';
import { SCENARIO_NAMES, SHARDS, assertShardAssignment, parseShard } from '../e2e/shards.ts';

test('every scenario is assigned exactly once, independent of grouping', () => {
  expect(() => assertShardAssignment(['a', 'b', 'c'], [['a', 'c'], ['b']])).not.toThrow();
});
for (const [name, shards] of [
  ['missing', [['a']]], ['duplicate', [['a', 'b'], ['b']]],
  ['unknown', [['a', 'b', 'c']]], ['empty', [['a', 'b'], []]]
] as const) {
  test(`assignment rejects ${name} coverage`, () => {
    expect(() => assertShardAssignment(['a', 'b'], shards)).toThrow();
  });
}
test('duplicate registry entries fail', () => {
  expect(() => assertShardAssignment(['a', 'a'], [['a']])).toThrow();
});
test('shard selection validates numerator and denominator', () => {
  expect(parseShard('2/4', 4)).toBe(2);
  for (const value of ['0/4', '5/4', '1/3', '2', '1.5/4', '1/4junk']) {
    expect(() => parseShard(value, 4)).toThrow();
  }
});

test('the real browser scenarios are all assigned exactly once', () => {
  expect(() => assertShardAssignment(SCENARIO_NAMES, SHARDS)).not.toThrow();
});
