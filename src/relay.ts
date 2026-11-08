import type { Env } from './env.ts';
import type { ClientSite } from './sites.ts';
import { editorProfile, forward, installationToken, withPushPermission, type Editor } from './github.ts';
import { checkGraphql, checkRest, isContentPath, withEditor, type GraphqlBody } from './guard.ts';
import { json, denied } from './responses.ts';
const REST_PREFIX = '/api/v3';
/** GitHub's own limit per commit is about 16 MB of Base64, so this leaves room without being open-ended. */
const MAX_GRAPHQL_BYTES = 20 * 1024 * 1024;
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'etag', 'link', 'x-ratelimit-remaining', 'x-ratelimit-reset'];

export const githubToken = (env: Env, site: ClientSite) => installationToken({
  appId: env.GITHUB_APP_ID, installationId: site.installation_id,
  privateKey: env.GITHUB_APP_PRIVATE_KEY, repo: site.repo
});
const relay = (response: Response): Response => {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  // The editor treats a 401 as "your session ended", so GitHub refusing this service must not look like one.
  return new Response(response.body, { status: response.status === 401 ? 502 : response.status, headers });
};


interface TreeEntry { path: string; type: string; sha: string }
interface Tree { tree: TreeEntry[]; truncated: boolean; [key: string]: unknown }
const trees = new Map<string, { until: number; tree: Tree }>();
const treeKey = (site: ClientSite) => JSON.stringify([site.owner, site.repo, site.branch]);
async function branchTree(env: Env, site: ClientSite, fresh = false): Promise<Tree | undefined> {
  const key = treeKey(site), cached = trees.get(key);
  if (!fresh && cached && cached.until > Date.now()) return cached.tree;
  const response = await forward(`/repos/${site.owner}/${site.repo}/git/trees/${encodeURIComponent(site.branch)}?recursive=1`, { method: 'GET' }, await githubToken(env, site));
  if (!response.ok) return;
  const tree = await response.json() as Tree;
  if (!Array.isArray(tree.tree) || tree.truncated !== false) return;
  if (trees.size >= 100) trees.delete(trees.keys().next().value!);
  trees.set(key, { until: Date.now() + 60000, tree });
  return tree;
}
async function contentBlobs(env: Env, site: ClientSite, shas: string[]): Promise<boolean> {
  const contains = (tree: Tree | undefined) => !!tree && shas.every(sha => tree.tree.some(e => e.type === 'blob' && e.sha === sha && isContentPath(e.path, site)));
  return contains(await branchTree(env, site)) || contains(await branchTree(env, site, true));
}
function filterTree(tree: Tree, site: ClientSite): Tree {
  const paths = tree.tree.filter(e => e.type === 'blob' && isContentPath(e.path, site)).map(e => e.path);
  return { ...tree, tree: tree.tree.filter(e => e.type === 'blob' ? isContentPath(e.path, site) : e.type === 'tree' && paths.some(path => path.startsWith(e.path + '/'))) };
}

export async function handleRest(request: Request, url: URL, env: Env, editor: Editor, site: ClientSite): Promise<Response> {
  const path = url.pathname.slice(REST_PREFIX.length);
  const decision = checkRest(request.method, path, site);

  if (decision.kind === 'denied') return denied('Not allowed');
  if (decision.kind === 'user') return json(editorProfile(editor));

  if (path.endsWith('/commits') && url.searchParams.getAll('path').some(path => !isContentPath(path, site))) return denied('Not allowed');
  const sha = path.match(/\/git\/blobs\/([a-f0-9]{40})$/)?.[1];
  if (sha && !await contentBlobs(env, site, [sha])) return denied('Not allowed');

  const headers: HeadersInit = { Accept: request.headers.get('Accept') ?? 'application/vnd.github+json' };
  const response = await forward(`${path}${url.search}`, { method: 'GET', headers }, await githubToken(env, site));

  if (path.includes('/git/trees/') && response.ok) {
    const tree = await response.json() as Tree;
    if (!Array.isArray(tree.tree)) return denied('Not allowed');
    return relay(new Response(JSON.stringify(filterTree(tree, site)), { status: response.status, headers: response.headers }));
  }
  if (decision.kind === 'repository' && response.ok) {
    return json(withPushPermission((await response.json()) as Record<string, unknown>));
  }
  return relay(response);
}

const logEdit = (env: Env, site: ClientSite, editor: Editor, paths: string[], oid: string | undefined) =>
  env.DB.prepare('INSERT INTO edit_log (editor_id, repository, branch, paths, commit_oid, site_slug) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(editor.id, `${site.owner}/${site.repo}`, site.branch, JSON.stringify(paths), oid ?? null, site.slug)
    .run();

export async function handleGraphql(request: Request, env: Env, ctx: ExecutionContext, editor: Editor, site: ClientSite): Promise<Response> {
  if (request.method !== 'POST') return denied('Not allowed', 405);
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_GRAPHQL_BYTES) return denied('Too large', 413);

  // Checked again after reading, in bytes, because the Content-Length header is optional.
  const raw = await request.arrayBuffer();
  if (raw.byteLength > MAX_GRAPHQL_BYTES) return denied('Too large', 413);
  const text = new TextDecoder().decode(raw);

  let body: GraphqlBody;
  try {
    body = JSON.parse(text) as GraphqlBody;
  } catch {
    return denied('Invalid request', 400);
  }

  const decision = checkGraphql(body, site);
  if (!decision.ok) return denied(decision.reason);

  if (decision.blobs?.length && !await contentBlobs(env, site, decision.blobs)) return denied('Not allowed');
  const isCommit = decision.paths.length > 0;
  const response = await forward(
    '/graphql',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isCommit ? withEditor(body, editor.id) : body)
    },
    await githubToken(env, site)
  );

  if (!isCommit || !response.ok) return relay(response);

  const result = (await response.json()) as { data?: { createCommitOnBranch?: { commit?: { oid?: string } } }; errors?: unknown };
  if (!result.errors) ctx.waitUntil(logEdit(env, site, editor, decision.paths, result.data?.createCommitOnBranch?.commit?.oid));
  return json(result);
}
