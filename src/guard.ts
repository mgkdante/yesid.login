import { closedRead, closedCommitReturn } from './graphql-read.ts';
import { Kind, parse, visit, type DocumentNode, type OperationDefinitionNode } from 'graphql';

/** The one repository, branch and set of content files an editor session may touch. */
export interface Site {
  owner: string;
  repo: string;
  branch: string;
  /** Whole-path patterns. Folders alone are not enough: code can sit beside content. */
  contentFiles: readonly RegExp[];
}

export type RestDecision = { kind: 'user' } | { kind: 'repository' } | { kind: 'forward' } | { kind: 'denied' };

export type GraphqlDecision = { ok: true; paths: string[]; blobs?: string[] } | { ok: false; reason: string };

export interface GraphqlBody {
  query?: unknown;
  variables?: Record<string, unknown>;
  operationName?: unknown;
}

const READABLE = /^\/(git\/trees\/[\w.-]+|git\/blobs\/[0-9a-f]{40}|commits)$/;

const INPUT_KEYS = new Set(['branch', 'expectedHeadOid', 'message', 'fileChanges', 'clientMutationId']);
const BRANCH_KEYS = new Set(['repositoryNameWithOwner', 'branchName']);
const FILE_CHANGE_KEYS = new Set(['additions', 'deletions']);

const hasOnlyKeys = (value: object, allowed: Set<string>) => Object.keys(value).every((key) => allowed.has(key));

export function isContentPath(path: string, site: Site): boolean {
  if (path.split('/').some((part) => part === '..' || part === '.')) return false;
  return site.contentFiles.some((pattern) => pattern.test(path));
}

export function checkRest(method: string, path: string, site: Site): RestDecision {
  if (method !== 'GET') return { kind: 'denied' };
  if (path === '/user') return { kind: 'user' };

  const root = `/repos/${site.owner}/${site.repo}`;
  if (path === root) return { kind: 'repository' };
  if (!path.startsWith(`${root}/`) || path.includes('..')) return { kind: 'denied' };

  return READABLE.test(path.slice(root.length)) ? { kind: 'forward' } : { kind: 'denied' };
}

function parseDocument(query: unknown): DocumentNode | undefined {
  if (typeof query !== 'string') return undefined;
  try {
    return parse(query);
  } catch {
    return undefined;
  }
}

/** True only for `createCommitOnBranch(input: $input)` as the sole, unaliased field. */
function isPlainCommit(operation: OperationDefinitionNode): boolean {
  const selections = operation.selectionSet.selections;
  if (selections.length !== 1) return false;

  const [field] = selections;
  if (field.kind !== Kind.FIELD || field.alias || field.name.value !== 'createCommitOnBranch') return false;
  if (field.directives?.length || field.arguments?.length !== 1) return false;

  const [argument] = field.arguments;
  return argument.name.value === 'input' && argument.value.kind === Kind.VARIABLE && argument.value.name.value === 'input';
}

interface CommitInput {
  branch?: { repositoryNameWithOwner?: unknown; branchName?: unknown };
  fileChanges?: { additions?: { path?: unknown }[]; deletions?: { path?: unknown }[] };
}

function checkCommit(input: CommitInput | undefined, site: Site): GraphqlDecision {
  // Unknown keys are refused, not ignored: GitHub also accepts a branch by `id`, which could point anywhere.
  if (!input || !hasOnlyKeys(input, INPUT_KEYS)) return { ok: false, reason: 'Unexpected commit fields' };

  const branch = input.branch;
  if (!branch || !hasOnlyKeys(branch, BRANCH_KEYS)) return { ok: false, reason: 'Unexpected branch fields' };
  if (branch.repositoryNameWithOwner !== `${site.owner}/${site.repo}`) return { ok: false, reason: 'Wrong repository' };
  if (branch.branchName !== site.branch) return { ok: false, reason: 'Wrong branch' };
  if (input.fileChanges && !hasOnlyKeys(input.fileChanges, FILE_CHANGE_KEYS)) return { ok: false, reason: 'Unexpected file change fields' };

  const changes = [...(input?.fileChanges?.additions ?? []), ...(input?.fileChanges?.deletions ?? [])];
  if (!changes.length) return { ok: false, reason: 'No file changes' };

  const paths: string[] = [];
  for (const { path } of changes) {
    if (typeof path !== 'string' || !isContentPath(path, site)) return { ok: false, reason: 'Path outside content' };
    paths.push(path);
  }
  return { ok: true, paths };
}

export function checkGraphql(body: GraphqlBody, site: Site): GraphqlDecision {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'Invalid request' };

  const document = parseDocument(body.query);
  if (!document) return { ok: false, reason: 'Invalid query' };

  let directed = false;
  visit(document, { Directive() { directed = true; } });
  if (directed) return { ok: false, reason: 'Operation not allowed' };
  const operations = document.definitions.filter((definition) => definition.kind === Kind.OPERATION_DEFINITION);


  if (document.definitions.length !== 1 || operations.length !== 1) return { ok: false, reason: 'One operation only' };

  const [operation] = operations;
  if (operation.operation === 'query') {
    const read = closedRead(operation, body, site);
    return read ? { ok: true, paths: [], blobs: read.blobs } : { ok: false, reason: 'Operation not allowed' };
  }
  if (operation.operation !== 'mutation' || !isPlainCommit(operation) || !closedCommitReturn(operation, site)) return { ok: false, reason: 'Operation not allowed' };

  return checkCommit(body.variables?.input as CommitInput | undefined, site);
}

const EMAIL = /[^\s<>@]+@[^\s<>@]+/;
const SAFE_HEADLINE = 'Update content';

/**
 * Names the editor by internal ID only, so no name or contact detail reaches the repository. The body
 * is replaced because it can carry sign-offs, and a headline holding an email address is not kept.
 */
export function withEditor(body: GraphqlBody, editorId: string): GraphqlBody {
  const input = body.variables?.input as { message?: { headline?: unknown } };
  const headline = input?.message?.headline;
  const safe = typeof headline === 'string' && headline.trim() && !EMAIL.test(headline) ? headline : SAFE_HEADLINE;
  return {
    ...body,
    variables: { ...body.variables, input: { ...input, message: { headline: safe, body: `Edited-by: ${editorId}` } } }
  };
}
