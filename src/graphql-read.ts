import { Kind, parse, print, visit, type SelectionNode, type OperationDefinitionNode } from 'graphql';
import { isContentPath, type Site, type GraphqlBody } from './guard.ts';

const selection = (text: string) => (parse(`query { ${text} }`).definitions[0] as OperationDefinitionNode).selectionSet.selections[0];
// Compare normalized ASTs, so whitespace and field/argument order do not affect the contract.
const canonical = (node: SelectionNode) => print(visit(node, {
  SelectionSet(set) { return { ...set, selections: [...set.selections].sort((a, b) => print(a).localeCompare(print(b))) }; },
  Field(field) { return { ...field, arguments: [...(field.arguments ?? [])].sort((a, b) => a.name.value.localeCompare(b.name.value)) }; },
  ObjectValue(value) { return { ...value, fields: [...value.fields].sort((a, b) => a.name.value.localeCompare(b.name.value)) }; }
}));
const templates = [
  'ref(qualifiedName:$branch){target{... on Commit{history(first:1){nodes{oid message}}}}}',
  'ref(qualifiedName:$qualifiedName){refUpdateRule{viewerCanPush}}',
  'batch_0:object(oid:"OID"){... on Blob{text isTruncated}}',
  'batch_0:ref(qualifiedName:$branch){target{... on Commit{history(first:1,path:"PATH"){nodes{author{name email user{id:databaseId login}} committedDate}}}}}',
  'batch_0:object(oid:"OID"){... on Commit{status{contexts{context state targetUrl description}} deployments(last:10,orderBy:{field:CREATED_AT,direction:ASC}){nodes{environment latestStatus{state environmentUrl description}}} checkSuites(last:10){nodes{checkRuns(last:20){nodes{name status conclusion detailsUrl summary}}}}}}',
  'defaultBranchRef{name}', 'object(expression:$expression){oid}',
  // Captured from the pinned Sveltia 0.261.0, 2026-11-08: the History panel, and a save's publish status as three
  // separate queries. Metadata only; paths stay content paths, and older file contents stay unreadable.
  'batch_0:ref(qualifiedName:$branch){target{... on Commit{history(first:100,path:"PATH"){nodes{oid messageHeadline author{name email avatarUrl user{login}} committedDate}}}}}',
  'batch_0:object(oid:"OID"){... on Commit{status{contexts{context state targetUrl description}}}}',
  'batch_0:object(oid:"OID"){... on Commit{checkSuites(last:10){nodes{checkRuns(last:20){nodes{name status conclusion detailsUrl summary}}}}}}',
  'batch_0:object(oid:"OID"){... on Commit{deployments(last:10,orderBy:{field:CREATED_AT,direction:ASC}){nodes{environment latestStatus{state environmentUrl description}}}}}'
].map(text => canonical(selection(text)));
const fileReturn = canonical(selection('batch_0:file(path:"PATH"){oid}'));

function normalized(node: SelectionNode, site: Site): string | undefined {
  let valid = true;
  const result = visit(node, {
    Directive() { valid = false; },
    Field(field) {
      if (field.alias && field.alias.value !== 'id') {
        if (!/^[A-Za-z_]\w*_\d+$/.test(field.alias.value)) valid = false;
        return { ...field, alias: { ...field.alias, value: 'batch_0' } };
      }
    },
    StringValue(value, key, parent) {
      const argument = parent as { name?: { value: string } };
      if (argument.name?.value === 'oid') {
        if (!/^[a-fA-F0-9]{40}$/.test(value.value)) valid = false;
        return { ...value, value: 'OID' };
      }
      if (argument.name?.value === 'path') {
        if (!isContentPath(value.value, site)) valid = false;
        return { ...value, value: 'PATH' };
      }
    }
  });
  return valid ? canonical(result) : undefined;
}
export function closedRead(operation: OperationDefinitionNode, body: GraphqlBody, site: Site): { blobs: string[] } | undefined {
  const vars = body.variables ?? {};
  if (vars.owner !== site.owner || vars.repo !== site.repo) return;
  for (const [name, value] of Object.entries(vars)) {
    if (name === 'owner' || name === 'repo') continue;
    if (name === 'branch' && value === site.branch) continue;
    if (name === 'qualifiedName' && value === `refs/heads/${site.branch}`) continue;
    if (name === 'expression' && typeof value === 'string' && value.startsWith(`${site.branch}:`) && isContentPath(value.slice(site.branch.length + 1), site)) continue;
    return;
  }
  if (operation.directives?.length || operation.variableDefinitions?.some(v => v.defaultValue || v.directives?.length || !['owner', 'repo', 'branch', 'qualifiedName', 'expression'].includes(v.variable.name.value))) return;
  const roots = operation.selectionSet.selections;
  if (roots.length !== 1) return;
  const root = roots[0];
  if (root.kind !== Kind.FIELD || root.alias || root.name.value !== 'repository' || root.directives?.length || root.arguments?.length !== 2) return;
  if (!['owner', 'name'].every(name => root.arguments?.some(a => a.name.value === name && a.value.kind === Kind.VARIABLE && a.value.name.value === (name === 'name' ? 'repo' : 'owner')))) return;
  let bound = true;
  visit(operation.selectionSet, { Variable(node) { if (!Object.hasOwn(vars, node.name.value)) bound = false; } });
  if (!bound) return;
  const fields = root.selectionSet?.selections;
  if (!fields?.length || fields.length > 300) return;
  const aliases = new Set<string>(); const blobs: string[] = [];
  for (const field of fields) {
    const text = normalized(field, site);
    if (!text || !templates.includes(text)) return;
    if (field.kind !== Kind.FIELD) return;
    const key = field.alias?.value ?? field.name.value;
    if (aliases.has(key)) return;
    aliases.add(key);
    if (text === templates[2]) {
      const oid = field.arguments?.[0]?.value;
      if (oid?.kind === Kind.STRING) blobs.push(oid.value);
    }
  }
  return { blobs };
}
export function closedCommitReturn(operation: OperationDefinitionNode, site: Site): boolean {
  const root = operation.selectionSet.selections[0];
  if (root?.kind !== Kind.FIELD || root.directives?.length || operation.directives?.length) return false;
  const selections = root.selectionSet?.selections;
  if (selections?.length !== 1) return false;
  const commit = selections[0];
  if (commit.kind !== Kind.FIELD || commit.name.value !== 'commit' || commit.alias || commit.arguments?.length || commit.directives?.length) return false;
  const seen = new Set<string>();
  if ((commit.selectionSet?.selections.filter(field => field.kind === Kind.FIELD && field.alias).length ?? 0) > 300) return false;
  return !!commit.selectionSet?.selections.length && commit.selectionSet.selections.length <= 302 && commit.selectionSet.selections.every(field => {
    if (field.kind !== Kind.FIELD) return false;
    const key = field.alias?.value ?? field.name.value;
    if (seen.has(key)) return false;
    seen.add(key);
    const text = normalized(field, site);
    return text === 'oid' || text === 'committedDate' || text === fileReturn;
  });
}
