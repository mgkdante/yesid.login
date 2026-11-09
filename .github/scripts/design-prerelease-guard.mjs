import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGES = new Set(['tokens', 'motion', 'gates', 'seo-kit', 'ui', 'analytics', 'i18n-core', 'config']);
const FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'overrides', 'resolutions'];
const RELEASE = /^https:\/\/github\.com\/mgkdante\/yesid\.design\/releases\/download\/v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\/yesid-([a-z0-9._-]+)-\1\.tgz$/;
const REHEARSAL = 'The PR may rehearse on a release candidate but can merge only after switching to the stable release.';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const design = name => name?.startsWith('@yesid/') && PACKAGES.has(name.slice(7));

// Preserve scoped names and select the terminal package, never an ancestor.
function target(key) {
  const tokens = key.match(/@[^/>@\s]+\/[^/>@\s]+(?:@[^/>\s]*)?|[^/>@\s]+(?:@[^/>\s]*)?/g) ?? [];
  return tokens.at(-1)?.replace(/(?!^)@.*$/, '');
}

function containsDownload(value) {
  if (typeof value === 'string') return value.includes('yesid.design/releases/download/');
  if (Array.isArray(value)) return value.some(containsDownload);
  return object(value) && Object.values(value).some(containsDownload);
}

/** Pure checker: repository-relative paths mapped to JSON text; returns diagnostics. */
export function checkManifests(manifests) {
  const failures = [];
  const versions = new Map();
  const fail = message => failures.push(message + '. ' + REHEARSAL);
  function entries(values, field, file, containers, inherited) {
    if (!object(values)) throw new Error(field + ': expected a dependency object');
    for (const [key, value] of Object.entries(values)) {
      const name = key === '.' && containers ? inherited : target(key);
      const location = file + ': ' + field + ', key ' + JSON.stringify(key) + ', value ' + JSON.stringify(value);
      if (object(value) && containers) {
        if (design(name) && !Object.keys(value).length) fail(location + ': empty design override');
        entries(value, field + '[' + JSON.stringify(key) + ']', file, true, name);
        continue;
      }
      const alias = typeof value === 'string' && /^npm:(@[^/]+\/[^@]+)(?:@|$)/.exec(value);
      if (!design(name) && !design(alias?.[1]) && !containsDownload(value)) continue;
      const match = typeof value === 'string' ? RELEASE.exec(value) : null;
      const selector = /[/>]/.test(key.replace(/^@[^/]+\//, ''));
      const expected = design(name) || containers || field === 'resolutions' || selector ? name : match && '@yesid/' + match[2];
      if (!match || match[0] !== value || !PACKAGES.has(match[2]) || expected !== '@yesid/' + match[2] || design(alias?.[1])) {
        fail(location + ': expected an exact stable release tarball URL matching the terminal package');
      } else {
        if (!versions.has(match[1])) versions.set(match[1], []);
        versions.get(match[1]).push(location);
      }
    }
  }
  for (const [file, text] of Object.entries(manifests)) {
    try {
      const manifest = JSON.parse(text);
      if (!object(manifest)) throw new Error('expected a manifest object');
      for (const field of FIELDS) {
        if (Object.hasOwn(manifest, field)) entries(manifest[field], field, file, field === 'overrides');
      }
      if (Object.hasOwn(manifest, 'pnpm')) {
        if (!object(manifest.pnpm)) throw new Error('pnpm: expected an object');
        if (Object.hasOwn(manifest.pnpm, 'overrides')) entries(manifest.pnpm.overrides, 'pnpm.overrides', file, true);
      }
    } catch (error) {
      fail(file + ': cannot parse or check manifest: ' + error.message);
    }
  }
  if (versions.size > 1) fail('Design releases must use one stable version in lockstep:\n' + [...versions.values()].flat().join('\n'));
  return failures;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Audit tracked manifests only. Reject tracked links and submodules rather than skip them. */
export function checkRepository(root = process.cwd()) {
  try {
    root = resolve(root);
    if (resolve(git(root, ['rev-parse', '--show-toplevel']).trim()) !== root) throw new Error('repoRoot must be the Git repository root');
    const records = git(root, ['ls-files', '--stage', '-z']).split('\0').filter(Boolean);
    const manifests = {};
    for (const record of records) {
      const match = /^(\d+) [a-f0-9]+ (\d)\t([\s\S]+)$/.exec(record);
      if (!match || match[2] !== '0') throw new Error('invalid or unmerged git index entry');
      const [, mode, , file] = match;
      if (mode === '120000') throw new Error(file + ': tracked symlink rejected');
      if (mode === '160000') throw new Error(file + ': submodule manifests cannot be audited');
      if (file.split('/').at(-1) !== 'package.json') continue;
      const path = resolve(root, file);
      if (!path.startsWith(root + sep)) throw new Error(file + ': path escapes repository');
      let cursor = root;
      for (const part of file.split('/')) {
        cursor = join(cursor, part);
        if (lstatSync(cursor).isSymbolicLink()) throw new Error(file + ': symlink rejected');
      }
      manifests[file] = readFileSync(path, 'utf8');
    }
    return checkManifests(manifests);
  } catch (error) {
    return ['Cannot discover or read tracked manifests: ' + error.message + '. ' + REHEARSAL];
  }
}

function safePath(root, file) {
  const path = resolve(root, file);
  if (!path.startsWith(root + sep)) throw new Error('case path escapes temporary repository');
  return path;
}

function discoveryCase(test) {
  const root = mkdtempSync(join(tmpdir(), 'design-guard-'));
  try {
    git(root, ['init', '--quiet']);
    for (const [file, text] of Object.entries(test.manifests)) {
      const path = safePath(root, file);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
    for (const file of test.tree.directories ?? []) mkdirSync(safePath(root, file), { recursive: true });
    git(root, ['add', '--all']);
    for (const link of test.tree.links ?? []) {
      const path = safePath(root, link.path);
      mkdirSync(dirname(path), { recursive: true });
      symlinkSync(safePath(root, link.target), path, 'junction');
      // Model a tracked link explicitly: Git does not stage Windows junctions as symlinks.
      const hash = git(root, ['hash-object', '-w', '--stdin']).trim();
      git(root, ['update-index', '--add', '--cacheinfo', '120000,' + hash + ',' + link.path]);
    }
    for (const file of test.tree.remove ?? []) unlinkSync(safePath(root, file));
    for (const file of test.tree.untracked ?? []) writeFileSync(safePath(root, file), '{');
    if (test.tree.noGit) rmSync(join(root, '.git'), { recursive: true, force: true });
    return checkRepository(test.tree.missingRoot ? join(root, 'missing') : root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function selfTest(casesPath = fileURLToPath(new URL('./design-prerelease-guard.cases.json', import.meta.url))) {
  const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
  if (!Array.isArray(cases) || !cases.length) throw new Error('expected a nonempty case table');
  const mismatches = [];
  for (const test of cases) {
    const errors = test.tree ? discoveryCase(test) : checkManifests(test.manifests);
    if ((errors.length === 0) !== test.pass || !(test.messages ?? []).every(fragment => errors.join('\n').includes(fragment))) {
      mismatches.push(test.name + ': expected ' + (test.pass ? 'pass' : 'fail') + '; received ' + JSON.stringify(errors));
    }
  }
  if (mismatches.length) throw new Error(mismatches.join('\n'));
  return cases.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === '--self-test') process.stdout.write('Passed ' + selfTest(process.argv[3]) + ' shared cases\n');
    else {
      const errors = checkRepository(process.argv[2]);
      process.stdout.write(errors.length ? errors.join('\n') + '\n' : 'Design dependencies use one exact stable release\n');
      process.exitCode = errors.length ? 1 : 0;
    }
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}
