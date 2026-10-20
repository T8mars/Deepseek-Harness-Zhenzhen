import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mcpChildEnvironment } from '../../packages/dsh-zhen/lib/mcp-market.js';

// Real Git computes fixture object identities. Production tree/blob hash code
// is deliberately not used as its own test oracle. No repository hook runs.
export function githubSkillFixture(root, extraFiles = {}) {
  const repo = join(root, 'example-git'), hooks = join(root, 'example-empty-hooks'), config = join(root, 'example-gitconfig');
  mkdirSync(repo); mkdirSync(hooks); writeFileSync(config, '');
  const env = mcpChildEnvironment({ GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: config,
    GIT_AUTHOR_NAME: 'EXAMPLE_ONLY', GIT_AUTHOR_EMAIL: 'EXAMPLE@example.invalid', GIT_COMMITTER_NAME: 'EXAMPLE_ONLY', GIT_COMMITTER_EMAIL: 'EXAMPLE@example.invalid',
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' });
  const git = (args, input) => execFileSync('git', ['-C', repo, '-c', `core.hooksPath=${hooks}`, '-c', 'core.autocrlf=false', ...args], { env, input, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git(['init', '--quiet']);
  const trees = new Map(), versions = new Map(); let previous;
  const instruction = '---\nname: example-github-creative\ndescription: "EXAMPLE ONLY creator skill"\n---\n\nEXAMPLE_BODY references/guide.md and scripts/example.mjs.\n';
  function version(label) {
    const files = new Map(Object.entries({
      'LICENSE': 'EXAMPLE_ONLY_ROOT_LICENSE_NOTICE',
      'skills/example-creative/SKILL.md': instruction,
      'skills/example-creative/references/guide.md': 'EXAMPLE_REFERENCE',
      'skills/example-creative/scripts/example.mjs': `throw new Error("EXAMPLE_MUST_NOT_EXECUTE_${label}");`,
      'skills/example-creative/assets/example.bin': Buffer.from([0xff, 0x00, 0xfe]),
      ...extraFiles,
    }).map(([path, value]) => { const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'object' ? value.content : value); return [path, { bytes, mode: typeof value === 'object' && !Buffer.isBuffer(value) ? value.mode : '100644', sha: git(['hash-object', '-w', '--stdin'], bytes) }]; }));
    function build(prefix) {
      const names = new Map();
      for (const [path, file] of files) if (path.startsWith(prefix)) {
        const rest = path.slice(prefix.length), slash = rest.indexOf('/'), name = slash < 0 ? rest : rest.slice(0, slash);
        if (slash < 0) names.set(name, { path: name, mode: file.mode, type: 'blob', sha: file.sha, size: file.bytes.length });
        else if (!names.has(name)) { const sha = build(prefix + name + '/'); names.set(name, { path: name, mode: '040000', type: 'tree', sha }); }
      }
      const entries = [...names.values()];
      const sha = git(['mktree'], entries.map(item => `${item.mode} ${item.type} ${item.sha}\t${item.path}\n`).join(''));
      trees.set(sha, entries); return sha;
    }
    const tree = build(''), revision = git(['commit-tree', tree, ...(previous ? ['-p', previous] : []), '-m', 'EXAMPLE_ONLY_' + label]);
    previous = revision; versions.set(revision, { files, tree }); return revision;
  }
  const first = version('FIRST'), second = version('SECOND'); let head = first;
  const calls = []; let intercept;
  const flatten = (sha, prefix = '') => trees.get(sha).flatMap(item => [{ ...item, path: prefix + item.path }, ...(item.type === 'tree' ? flatten(item.sha, prefix + item.path + '/') : [])]);
  const fetcher = async (input, options) => {
    const url = new URL(input), headers = new Headers(options.headers);
    if (headers.has('Authorization') || options.method !== 'GET' || options.redirect !== 'error') throw new Error('EXAMPLE_UNEXPECTED_AUTH_OR_METHOD');
    calls.push(url.href); if (intercept) { const response = await intercept(url, options); if (response) return response; }
    const base = '/repos/example-owner/example-skills';
    if (url.origin === 'https://api.github.com') {
      if (url.pathname === base) return Response.json({ full_name: 'example-owner/example-skills', private: false, default_branch: 'main', license: { spdx_id: 'LicenseRef-EXAMPLE' } });
      if (url.pathname === base + '/commits/main') return Response.json({ sha: head, commit: { tree: { sha: versions.get(head).tree } } });
      if (url.pathname.startsWith(base + '/git/trees/')) {
        const sha = url.pathname.slice((base + '/git/trees/').length); if (!trees.has(sha)) throw new Error('EXAMPLE_UNKNOWN_TREE');
        return Response.json({ sha, truncated: false, tree: url.searchParams.has('recursive') ? flatten(sha) : trees.get(sha) });
      }
    }
    if (url.origin === 'https://raw.githubusercontent.com') {
      const [owner, repository, revision, ...parts] = url.pathname.slice(1).split('/').map(decodeURIComponent);
      if (owner !== 'example-owner' || repository !== 'example-skills') throw new Error('EXAMPLE_WRONG_ORIGIN');
      const file = versions.get(revision)?.files.get(parts.join('/')); if (file) return new Response(file.bytes);
    }
    throw new Error('EXAMPLE_UNEXPECTED_REQUEST');
  };
  return { spec: { repository: 'https://github.com/example-owner/example-skills', reference: '', path: 'skills/example-creative', mode: 'skill' }, first, second, calls, fetcher,
    setHead(value) { head = value; }, intercept(value) { intercept = value; } };
}
