import assert from 'node:assert/strict';
import { test } from 'bun:test';
import { checkGraphql, checkRest, isContentPath, withEditor, type Site } from '../src/guard.ts';

import { CONTENT_FILES } from '../src/sites.ts';

const site: Site = {
  owner: 'example-owner',
  repo: 'example-site',
  branch: 'cms-proof',
  contentFiles: CONTENT_FILES
};

const COMMIT = 'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }';

const commitInput = (overrides: Record<string, unknown> = {}) => ({
  branch: { repositoryNameWithOwner: 'example-owner/example-site', branchName: 'cms-proof' },
  expectedHeadOid: 'abc',
  message: { headline: 'Update' },
  fileChanges: { additions: [{ path: 'src/lib/content/fr.json', contents: 'e30=' }] },
  ...overrides
});

const commit = (overrides: Record<string, unknown> = {}) => ({ query: COMMIT, variables: { input: commitInput(overrides) } });

test('content paths stay inside the allowed folders', () => {
  assert.equal(isContentPath('src/lib/content/fr.json', site), true);
  assert.equal(isContentPath('static/images/uploads/a.webp', site), true);
  for (const path of [
    '.github/workflows/deploy.yml',
    'package.json',
    'src/lib/content/../../hooks.server.ts',
    '/src/lib/content/fr.json',
    'src\\lib\\content\\fr.json',
    'src/lib/content',
    'src/lib/contents/fr.json',
    '',
    'src/lib/content/index.ts',
    'src/lib/content/slugs.ts',
    'src/lib/content/fr.json.ts',
    'src/lib/content/nested/fr.json',
    'static/images/uploads/x.svg',
    'static/images/uploads/x.html',
    'static/images/uploads/x.webp.js',
    'static/images/uploads/..webp',
    'static/images/uploads/nested/x.webp'
  ]) {
    assert.equal(isContentPath(path, site), false, path);
  }
});

test('REST allows only reads of this repository and the profile', () => {
  assert.deepEqual(checkRest('GET', '/user', site), { kind: 'user' });
  assert.deepEqual(checkRest('GET', '/repos/example-owner/example-site', site), { kind: 'repository' });
  assert.deepEqual(checkRest('GET', '/repos/example-owner/example-site/git/trees/cms-proof', site), { kind: 'forward' });
  assert.deepEqual(checkRest('GET', `/repos/example-owner/example-site/git/blobs/${'a1'.repeat(20)}`, site), { kind: 'forward' });
  assert.deepEqual(checkRest('GET', '/repos/example-owner/example-site/commits', site), { kind: 'forward' });
});

test('REST refuses writes, other repositories and everything else', () => {
  for (const [method, path] of [
    ['POST', '/repos/example-owner/example-site/git/refs'],
    ['PUT', '/repos/example-owner/example-site/contents/package.json'],
    ['DELETE', '/repos/example-owner/example-site'],
    ['GET', '/repos/example-owner/other'],
    ['GET', '/repos/example-owner/example-site-private/git/trees/main'],
    ['GET', '/repos/example-owner/example-site/actions/secrets'],
    ['GET', '/repos/example-owner/example-site/git/../../other'],
    ['GET', '/repos/example-owner/example-site/git/trees/%2e%2e%2f%2e%2e%2fother'],
    ['GET', '/repos/example-owner/example-site/git/trees/a%2Fb'],
    ['GET', '/repos/example-owner/example-site/git/blobs/not-a-sha'],
    ['GET', '/repos/example-owner/example-site/git/blobs/%2e%2e'],
    ['GET', '/installation/repositories'],
    ['GET', '/app']
  ] as const) {
    assert.equal(checkRest(method, path, site).kind, 'denied', `${method} ${path}`);
  }
});

test('GraphQL refuses formerly unrestricted read queries', () => {
  assert.equal(checkGraphql({ query: 'query($owner: String!) { repository(owner: $owner, name: "x") { id } }', variables: {} }, site).ok, false);
});

test('GraphQL allows a commit to the site branch inside content', () => {
  const result = checkGraphql(commit(), site);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.paths, ['src/lib/content/fr.json']);
});

test('GraphQL checks deletions as well as additions', () => {
  const result = checkGraphql(commit({ fileChanges: { deletions: [{ path: 'package.json' }] } }), site);
  assert.equal(result.ok, false);
});

test('GraphQL refuses commits outside the site or its content', () => {
  const cases = {
    'other path': commit({ fileChanges: { additions: [{ path: '.github/workflows/deploy.yml', contents: 'e30=' }] } }),
    'one bad path among good ones': commit({
      fileChanges: { additions: [{ path: 'src/lib/content/fr.json', contents: 'e30=' }, { path: 'package.json', contents: 'e30=' }] }
    }),
    'main branch': commit({ branch: { repositoryNameWithOwner: 'example-owner/example-site', branchName: 'main' } }),
    'other repository': commit({ branch: { repositoryNameWithOwner: 'example-owner/other', branchName: 'cms-proof' } }),
    'branch by id': commit({ branch: { id: 'abc' } }),
    'branch id next to the allowed name': commit({
      branch: { id: 'main-ref-id', repositoryNameWithOwner: 'example-owner/example-site', branchName: 'cms-proof' }
    }),
    'unknown input field': commit({ somethingElse: true }),
    'unknown file change field': commit({ fileChanges: { additions: [{ path: 'src/lib/content/fr.json', contents: 'e30=' }], other: [] } }),
    'code file inside the content folder': commit({ fileChanges: { additions: [{ path: 'src/lib/content/index.ts', contents: 'e30=' }] } }),
    'script uploaded as an image': commit({ fileChanges: { additions: [{ path: 'static/images/uploads/x.svg', contents: 'e30=' }] } }),
    'no changes': commit({ fileChanges: {} })
  };
  for (const [name, body] of Object.entries(cases)) {
    assert.equal(checkGraphql(body, site).ok, false, name);
  }
});

test('GraphQL refuses other mutations and disguised documents', () => {
  const cases = {
    'other mutation': { query: 'mutation { deleteRef(input: { refId: "x" }) { clientMutationId } }', variables: {} },
    'second field': {
      query: 'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } deleteRef(input: { refId: "x" }) { clientMutationId } }',
      variables: { input: commitInput() }
    },
    'alias on another mutation': { query: 'mutation { createCommitOnBranch: deleteRef(input: { refId: "x" }) { clientMutationId } }', variables: {} },
    'literal input': {
      query: 'mutation { createCommitOnBranch(input: { branch: { branchName: "main" } }) { commit { oid } } }',
      variables: { input: commitInput() }
    },
    'renamed variable': {
      query: 'mutation($other: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $other) { commit { oid } } }',
      variables: { input: commitInput(), other: commitInput({ fileChanges: { additions: [{ path: 'package.json', contents: 'e30=' }] } }) }
    },
    'hidden behind a query': {
      query: 'query A { viewer { login } } mutation B { deleteRef(input: { refId: "x" }) { clientMutationId } }',
      variables: {},
      operationName: 'B'
    },
    subscription: { query: 'subscription { x }', variables: {} },
    'not GraphQL': { query: 'not graphql {', variables: {} },
    'no query': { variables: {} }
  };
  for (const [name, body] of Object.entries(cases)) {
    assert.equal(checkGraphql(body, site).ok, false, name);
  }
});

test('GraphQL refuses bodies that are not objects', () => {
  for (const body of [null, [], 'text', 1]) {
    assert.equal(checkGraphql(body as never, site).ok, false, JSON.stringify(body));
  }
});

test('GraphQL refuses directives and fragments on a commit', () => {
  const cases = {
    directive: 'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) @skip(if: false) { commit { oid } } }',
    fragment: 'mutation($input: CreateCommitOnBranchInput!) { ...C } fragment C on Mutation { createCommitOnBranch(input: $input) { commit { oid } } }'
  };
  for (const [name, query] of Object.entries(cases)) {
    assert.equal(checkGraphql({ query, variables: { input: commitInput() } }, site).ok, false, name);
  }
});

const messageOf = (message: unknown) =>
  (withEditor(commit({ message }), 'user_123').variables as { input: { message: { headline: string; body: string } } }).input.message;

test('commits name the editor by internal ID only, keeping a plain headline', () => {
  assert.deepEqual(messageOf({ headline: 'Update', body: 'Details' }), { headline: 'Update', body: 'Edited-by: user_123' });
});

test('a sign-off or an email address never reaches the repository', () => {
  const message = messageOf({ headline: 'By Someone <someone@example.test>', body: 'Signed-off-by: Someone <someone@example.test>' });
  assert.deepEqual(message, { headline: 'Update content', body: 'Edited-by: user_123' });
  assert.equal(messageOf({ body: 'x' }).headline, 'Update content');
});

test('Markdown is limited to flat collection folders, and uploads may keep a tilde', () => {
  for (const path of [
    'src/lib/content/posts/hello-world.md',
    'src/lib/content/projects/x.fr.md',
    'src/lib/content/case-studies-2/x.md',
    'src/lib/content/projects/a~b.fr.md',
    'static/images/uploads/a~b.webp'
  ]) assert.equal(isContentPath(path, site), true, path);
  for (const path of [
    'src/lib/content/hello.md',
    'src/lib/content/posts/nested/hello.md',
    'src/lib/content/a/b/c.md',
    'src/lib/content/Projects/x.md',
    'src/lib/content/2024/x.md',
    'src/lib/content/-x/x.md',
    'src/lib/content/my_folder/x.md',
    'src/lib/content/projects/x.json',
    'src/lib/content/projects/x.svelte',
    'src/lib/content/projects/x.md.js',
    'src/lib/content/projects/../x.md',
    'src/lib/content/../x/y.md',
    'src/lib/content/./projects/x.md',
    'src/lib/content/projects/x.md\n',
    'static/images/uploads/a~b.svg',
    'static/images/uploads/a~/b.webp',
    'elsewhere/hello.md'
  ]) assert.equal(isContentPath(path, site), false, path);
});
