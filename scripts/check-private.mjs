import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PRIVATE_ROOT_NAMES = new Set(['roadmap.md', 'skill.md', 'agents.md', 'anents.md']);
export function forbiddenRootPath(path) {
  const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '').normalize('NFKC');
  return PRIVATE_ROOT_NAMES.has(normalized.toLowerCase());
}
export function checkPaths(paths, label = 'files') {
  const denied = paths.filter(forbiddenRootPath);
  if (denied.length) throw new Error(`${label} contains local-only files: ${denied.join(', ')}`);
  if (paths.some(path => /^(?:创作资料)(?:\/|$)/.test(path.replaceAll('\\', '/').replace(/^\.\//, '').normalize('NFKC')))) {
    throw new Error(`${label} contains the local-only creative material directory.`);
  }
}
function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
export function checkRepository(root, revisions = ['--all']) {
  try { git(root, ['rev-parse', '--git-dir']); } catch { return { git: false, checked: 0 }; }
  checkPaths(git(root, ['ls-files', '-z']).split('\0').filter(Boolean), 'Git index');
  const commits = git(root, ['rev-list', ...revisions]).trim().split('\n').filter(Boolean);
  // Inspect trees, including merge commits, instead of relying on diff simplification.
  for (const commit of commits) {
    checkPaths(git(root, ['ls-tree', '-r', '--name-only', '-z', commit]).split('\0').filter(Boolean), `Commit ${commit.slice(0, 12)}`);
  }
  return { git: true, checked: commits.length };
}
export function checkPackList(entries) {
  checkPaths(entries.map(entry => entry.path ?? entry), 'Package');
  for (const entry of entries) {
    const path = typeof entry === 'string' ? entry : entry.path;
    if (/(^|\/)(\.env(?:\.|$)|\.credentials\.yaml$|sessions\/|node_modules\/)/i.test(path)) {
      throw new Error(`Package contains private runtime data: ${path}`);
    }
  }
}
export function pushRevisions(input) {
  const revisions = [];
  for (const line of input.trim().split('\n').filter(Boolean)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4 || !/^[a-f0-9]{40,64}$/i.test(fields[1])) throw new Error('Invalid pre-push input');
    if (!/^0+$/.test(fields[1])) revisions.push(fields[1]);
  }
  return revisions;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const revisions = process.argv.includes('--pre-push') ? pushRevisions(readFileSync(0, 'utf8')) : ['--all'];
    const result = checkRepository(process.cwd(), revisions.length ? revisions : ['--all']);
    console.log(result.git ? `Private-file guard passed: index and ${result.checked} commit trees.` : 'Private-file guard: no Git index/history exists yet.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
