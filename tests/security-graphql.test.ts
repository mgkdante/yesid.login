import { test, expect } from 'bun:test';
import { checkGraphql } from '../src/guard.ts';
import { CONTENT_FILES } from '../src/sites.ts';
const site = { owner: 'sample-owner', repo: 'sample-site', branch: 'main', contentFiles: CONTENT_FILES };
const variables = { owner: site.owner, repo: site.repo, branch: 'main' };
const read = (selection: string) => {
  const optional = ['branch', 'qualifiedName', 'expression'].filter(name => selection.includes(`$${name}`));
  const declarations = ['owner', 'repo', ...optional].map(name => `$${name}:String!`).join(',');
  return { query: `query(${declarations}){repository(owner:$owner,name:$repo){${selection}}}`, variables };
};
test('closed reads bind the only repository root and reject unknown documents', () => {
  expect(checkGraphql(read('ref(qualifiedName:$branch){target{... on Commit{history(first:1){nodes{oid message}}}}}'), site).ok).toBe(true);
  for (const query of ['query{viewer{login}}', 'query{search(query:"x",type:REPOSITORY){repositoryCount}}', 'query{node(id:"x"){id}}', 'query{repository(owner:"other",name:"public"){defaultBranchRef{name}}}', 'query($owner:String!,$repo:String!){other:repository(owner:$owner,name:$repo){defaultBranchRef{name}}}']) expect(checkGraphql({ query, variables }, site).ok).toBe(false);
  expect(checkGraphql({ ...read('defaultBranchRef{name}'), variables: { ...variables, repo: 'other' } }, site).ok).toBe(false);
  expect(checkGraphql(read('refs(first:100){nodes{name}}'), site).ok).toBe(false);
});
test('commit return cannot read code', () => {
  expect(checkGraphql({ query: 'mutation($input:CreateCommitOnBranchInput!){createCommitOnBranch(input:$input){commit{oid content_0:file(path:"package.json"){oid}}}}', variables: { input: { branch: { repositoryNameWithOwner: 'sample-owner/sample-site', branchName: 'main' }, fileChanges: { additions: [{ path: 'src/lib/content/en.json' }] } } } }, site).ok).toBe(false);
});

test('all captured read shapes accept made-up aliases and paths', () => {
  for (const selection of [
    'ref(qualifiedName:$qualifiedName){refUpdateRule{viewerCanPush}}',
    `content_0:object(oid:"${'12'.repeat(20)}"){... on Blob{text isTruncated}}`,
    'commit_0:ref(qualifiedName:$branch){target{... on Commit{history(first:1,path:"src/lib/content/en.json"){nodes{author{name email user{id:databaseId login}} committedDate}}}}}',
    `commit_0:object(oid:"${'34'.repeat(20)}"){... on Commit{status{contexts{context state targetUrl description}} deployments(last:10,orderBy:{field:CREATED_AT,direction:ASC}){nodes{environment latestStatus{state environmentUrl description}}} checkSuites(last:10){nodes{checkRuns(last:20){nodes{name status conclusion detailsUrl summary}}}}}}`,
    'defaultBranchRef{name}', 'object(expression:$expression){oid}'
  ]) expect(checkGraphql({ ...read(selection), variables: { ...variables, qualifiedName: 'refs/heads/main', expression: 'main:src/lib/content/en.json' } }, site).ok).toBe(true);
});
test('query variants fail closed', () => {
  const good = read('defaultBranchRef{name}');
  for (const body of [
    { ...good, query: good.query + ' query{viewer{login}}' },
    { ...good, query: good.query + ' fragment X on Repository{id}' },
    read('defaultBranchRef @skip(if:true){name}'),
    read('... on Repository{defaultBranchRef{name}}'),
    read('ref(qualifiedName:$branch){target{... on Commit{history(first:2){nodes{oid message}}}}}'),
    read('commit_0:ref(qualifiedName:$branch){target{... on Commit{history(first:1,path:"package.json"){nodes{author{name email user{id:databaseId login}} committedDate}}}}}'),
    { ...read('object(expression:$expression){oid}'), variables: { ...variables, expression: 'main:package.json' } },
    read(Array.from({ length: 301 }, (_, i) => `content_${i}:object(oid:"${'12'.repeat(20)}"){... on Blob{text isTruncated}}`).join(' ')),
    read('defaultBranchRef{name extra:name}')
  ]) expect(checkGraphql(body, site).ok).toBe(false);
});
