import { test, expect } from 'bun:test';
import { createHandler } from '../src/index.ts';
import { handleGraphql } from '../src/relay.ts';
import type { Env } from '../src/env.ts';

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

test('a request that fails logs no part of the error message, so an address cannot reach the logs', async () => {
  const original = console.error, entries: unknown[][] = [];
  console.error = (...args) => { entries.push(args); };
  try {
    const env = { DB: { prepare() { throw Error('person@example.test was not found'); } } } as unknown as Env;
    const response = await createHandler(async () => undefined)(new Request('https://login.test/example/'), env, ctx);
    expect(response.status).toBe(502);
    expect(JSON.stringify(entries)).not.toContain('person@example.test');
    expect(entries.length).toBeGreaterThan(0);
  } finally { console.error = original; }
});

test('the GraphQL size limit counts bytes, even without a Content-Length header', async () => {
  // About 10.5 million characters but over 20 MiB once encoded, sent as a stream so no length header exists.
  const bytes = new TextEncoder().encode('é'.repeat(10 * 1024 * 1024 + 1));
  const body = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
  const request = new Request('https://login.test/api/graphql', { method: 'POST', body });
  expect(request.headers.get('Content-Length')).toBeNull();
  const site = { slug: 'example', owner: 'example-owner', repo: 'example-site', branch: 'main', label: 'Example', installation_id: '1', contentFiles: [] };
  const response = await handleGraphql(request, {} as Env, ctx, { id: 'e', name: 'E', email: 'e@example.test' }, site);
  expect(response.status).toBe(413);
});

test('the schema script never writes into the applied migrations', async () => {
  const source = await Bun.file('scripts/generate-schema.ts').text();
  expect(source).not.toMatch(/writeFileSync|Bun\.write/);
  expect(source).not.toContain('migrations/0001_auth.sql\'');
});
