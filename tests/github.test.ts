import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { test } from 'bun:test';
import { appJwt, editorProfile, tokenCacheKey, withPushPermission } from '../src/github.ts';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });

for (const [label, type] of [['PKCS#1, as GitHub issues it', 'pkcs1'], ['PKCS#8', 'pkcs8']] as const) {
  test(`signs a short-lived App JWT from a ${label} key`, async () => {
    const pem = keys.privateKey.export({ type, format: 'pem' }).toString();
    const now = 1_800_000_000;
    const jwt = await appJwt('5650340', pem, now);
    const [header, payload, signature] = jwt.split('.');

    assert.deepEqual(decode(header), { alg: 'RS256', typ: 'JWT' });
    assert.deepEqual(decode(payload), { iat: now - 60, exp: now + 540, iss: '5650340' });
    assert.equal(createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(keys.publicKey, signature, 'base64url'), true);
  });
}

test('keeps one cached token per installation and repository', () => {
  assert.notEqual(tokenCacheKey({ installationId: '1', repo: 'a' }), tokenCacheKey({ installationId: '1', repo: 'b' }));
  assert.notEqual(tokenCacheKey({ installationId: '1', repo: 'a' }), tokenCacheKey({ installationId: '2', repo: 'a' }));
});

test('refuses a value that is not a private key', async () => {
  await assert.rejects(appJwt('1', 'not a key', 0), /private key/);
});

test('reports the repository as writable without other changes', () => {
  assert.deepEqual(withPushPermission({ name: 'example', permissions: { pull: true } }), {
    name: 'example',
    permissions: { pull: true, push: true }
  });
});

test('builds a profile with no GitHub identity', () => {
  assert.deepEqual(editorProfile({ id: 'user_1', name: 'Test', email: 'test@example.com' }), {
    id: 'user_1',
    login: 'user_1',
    name: 'Test',
    email: 'test@example.com',
    avatar_url: null,
    html_url: null,
    bot: false
  });
});
