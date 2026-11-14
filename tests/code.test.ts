import { test, expect } from 'bun:test';
import { normalizeCode } from '../login/code.ts';
for (const value of ['123456', ' 123456', '123456 ', '123 456', '123-456', '123–456', '123\t456', '123\u00a0456', '123\u200b456', '000123']) {
  test(`S-4 accepts separators and leading zeros: ${JSON.stringify(value)}`, () => {
    expect(normalizeCode(value)).toBe(value.includes('000123') ? '000123' : '123456');
  });
}
for (const value of ['12345', '1234567', '12a456', 'Code: 123456', '123456.', '١٢٣٤٥٦', '１２３４５６', '123\n456', '123—456', '123_456', '']) {
  test(`S-4 refuses other content: ${JSON.stringify(value)}`, () => expect(normalizeCode(value)).toBeUndefined());
}
