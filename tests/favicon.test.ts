import { expect, test } from 'bun:test';
import { createHandler } from '../src/index.ts';
import type { Env } from '../src/env.ts';

// Icon services such as DuckDuckGo's, used by Plausible's site list, read only /favicon.ico at the root.
const env = { ASSETS: { fetch: (request: Request) => new Response(Bun.file('public' + new URL(request.url).pathname)) } } as unknown as Env;
const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

test('GET /favicon.ico serves an ICO holding 16, 32 and 48px PNG images of the brand mark', async () => {
  const response = await createHandler(async () => undefined)(new Request('https://login.test/favicon.ico'), env, ctx);
  expect(response.status).toBe(200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const view = new DataView(bytes.buffer);
  expect([view.getUint16(0, true), view.getUint16(2, true)]).toEqual([0, 1]);
  const count = view.getUint16(4, true);
  const sizes: number[] = [];
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    sizes.push(bytes[entry] || 256);
    const offset = view.getUint32(entry + 12, true);
    expect([...bytes.slice(offset, offset + 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  }
  expect(sizes.sort((a, b) => a - b)).toEqual([16, 32, 48]);
});

test('only the exact /favicon.ico path is served from assets at the root', async () => {
  for (const path of ['/favicon.ico/', '/favicon.ico.bak', '/x/favicon.ico']) {
    const response = await createHandler(async () => undefined)(new Request('https://login.test' + path), env, ctx);
    expect(response.status).not.toBe(200);
  }
});
