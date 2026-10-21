import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync, lstatSync, statSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, dirname, relative, isAbsolute, resolve } from 'node:path';
import type { SkillProvider } from '@deepseek-ai/dsh-skill';
import { LocalSkills } from './local-skills.ts';
import { readPublic } from './updates.ts';
import { GITHUB_SKILL_POLICY, githubSkillSpecSchema, githubSkillReleaseSchema, githubSkillStateSchema } from './github-skills-schema.ts';
import type { GithubSkillSpec, GithubSkillFile, GithubSkillRelease, GithubSkillSource, GithubSkillSourceView, GithubSkillSummary, GithubSkillPreview, GithubSkillFilePreview } from './github-skills-schema.ts';
export class GithubSkillError extends Error { constructor(message: string) { super(message); this.name = 'GithubSkillError'; } }

const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const sha1 = (value: Uint8Array): string => createHash('sha1').update(`blob ${value.byteLength}\0`).update(value).digest('hex');
const gitSha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const inside = (root: string, path: string): boolean => { const rel = relative(root, path); return rel !== '' && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'); };
export function githubSkillPath(path: string, allowEmpty = false): string {
  if (allowEmpty && path === '') return path;
  if (!path || path.length > 512 || path.split('/').length > 16 || path.split('/').some(part => !part || part === '.' || part === '..' || /[\\<>:"|?*\x00-\x1f\x7f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new GithubSkillError('技能文件路径不受支持。');
  return path;
}
export function normalizeGithubSkillSpec(input: GithubSkillSpec): GithubSkillSpec {
  const value = githubSkillSpecSchema.parse(input), url = new URL(value.repository);
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash) throw new GithubSkillError('请使用公开 GitHub 仓库主页地址。');
  const parts = url.pathname.replace(/\/$/, '').split('/').slice(1).map(decodeURIComponent);
  if (parts.length !== 2 || !/^[A-Za-z0-9-]{1,39}$/.test(parts[0]!) || !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[1]!) || ['.', '..'].includes(parts[1]!)) throw new GithubSkillError('请将分支和技能目录填入各自字段。');
  if (/[\\\x00-\x20\x7f]/.test(value.reference) || value.reference.split('/').some(part => part === '.' || part === '..')) throw new GithubSkillError('分支或提交标识无效。');
  const repository = parts[1]!.replace(/\.git$/i, ''); if (!repository || ['.', '..'].includes(repository)) throw new GithubSkillError('仓库名称无效。');
  return { repository: `https://github.com/${parts[0]!.toLowerCase()}/${repository.toLowerCase()}`, reference: value.reference, path: githubSkillPath(value.path, true), mode: value.mode };
}
function sourceId(spec: GithubSkillSpec): string { return sha256(JSON.stringify(spec)); }
function releaseDigest(release: Omit<GithubSkillRelease, 'digest'> | GithubSkillRelease): string { const { digest: _ignored, ...payload } = release as GithubSkillRelease; return sha256(JSON.stringify(payload)); }
function summary(value: GithubSkillRelease): GithubSkillSummary { const { files, entries, problems: _ignored, ...base } = value; return { ...base, bytes: files.reduce((sum, file) => sum + file.bytes, 0), fileCount: files.length, skillCount: entries.length }; }
type TreeEntry = { path: string; type: string; mode: string; sha: string; size?: number };
export function githubTreeHash(entries: TreeEntry[]): string {
  const sorted = [...entries].sort((a, b) => Buffer.compare(Buffer.from(a.path + (a.type === 'tree' ? '/' : '')), Buffer.from(b.path + (b.type === 'tree' ? '/' : ''))));
  const bytes = Buffer.concat(sorted.map(entry => Buffer.concat([Buffer.from(`${entry.mode === '040000' ? '40000' : entry.mode} ${entry.path}\0`), Buffer.from(entry.sha, 'hex')])));
  return createHash('sha1').update(`tree ${bytes.length}\0`).update(bytes).digest('hex');
}
function verifyTree(entries: TreeEntry[], expected: string, recursive: boolean): void {
  const paths = new Set<string>(), folders = new Map<string, { sha: string; entries: TreeEntry[] }>([['', { sha: expected, entries: [] }]]);
  for (const entry of entries) {
    githubSkillPath(entry.path);
    if (!gitSha(entry.sha) || !({ '100644': 'blob', '100755': 'blob', '120000': 'blob', '040000': 'tree', '160000': 'commit' } as Record<string, string>)[entry.mode] || ({ '100644': 'blob', '100755': 'blob', '120000': 'blob', '040000': 'tree', '160000': 'commit' } as Record<string, string>)[entry.mode] !== entry.type || paths.has(entry.path) || !recursive && entry.path.includes('/')) throw new GithubSkillError('Git 目录条目无效。');
    paths.add(entry.path); if (recursive && entry.type === 'tree') folders.set(entry.path, { sha: entry.sha, entries: [] });
  }
  for (const entry of entries) {
    const slash = entry.path.lastIndexOf('/'), parent = slash < 0 ? '' : entry.path.slice(0, slash), name = entry.path.slice(slash + 1), folder = folders.get(parent);
    if (!folder) throw new GithubSkillError('Git 目录缺少父树。'); folder.entries.push({ ...entry, path: name });
  }
  for (const folder of folders.values()) if (githubTreeHash(folder.entries) !== folder.sha) throw new GithubSkillError('Git 目录摘要不匹配。');
}

/** Public GitHub data snapshots. No Git checkout, hook, dependency installer,
 * ambient credential or repository-supplied command participates in download.
 */
export class GithubSkills {
  private readonly root: string;
  private readonly rootIdentity:string;
  private sources: GithubSkillSource[] = [];
  private serialized = '';
  private readonly listeners = new Set<() => void>();
  private readonly mounted = new Map<string, string>();
  private busy = false;
  private closed = false;
  private readonly lifetime = new AbortController();
  private downloading?: AbortController;
  constructor(root: string, private readonly fetcher: typeof fetch = fetch,options:{candidate?:boolean}={}) {
    mkdirSync(root, { recursive: true }); this.root = realpathSync.native(root);
    const initial=lstatSync(this.root,{bigint:true});this.rootIdentity=initial.dev+':'+initial.ino;
    this.reload();
    if(options.candidate)return;
    let changed = false;
    for (const source of this.sources) if (source.pending) {
      try { this.verify(source.id, source.pending); if (source.enabled) source.active = source.pending; }
      catch { source.state = 'unavailable'; }
      source.pending = ''; changed = true;
    }
    if (changed) this.save(this.sources);
    for (const source of this.sources) if (source.enabled && source.active) this.mounted.set(source.id, source.active);
  }
  private owned(path: string): string {
    const target = resolve(path); if (!inside(this.root, target)) throw new GithubSkillError('技能缓存路径越界。');
    for (let cursor = target; cursor !== this.root; cursor = dirname(cursor)) {
      let info; try { info = lstatSync(cursor); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      if (info.isSymbolicLink() || !inside(this.root, realpathSync.native(cursor))) throw new GithubSkillError('技能缓存包含链接或发生漂移。');
    }
    return target;
  }
  private get stateFile(): string { return this.owned(join(this.root, 'state.json')); }
  private reload(): void {
    const file = this.stateFile;
    if (existsSync(file) && statSync(file).size > 262144) throw new GithubSkillError('GitHub 技能配置过大。');
    const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (text === this.serialized) return;
    const sources = text ? githubSkillStateSchema.parse(JSON.parse(text)).sources : [];
    if (new Set(sources.map(item => item.id)).size !== sources.length || sources.some(item => JSON.stringify(normalizeGithubSkillSpec(item.spec)) !== JSON.stringify(item.spec) || sourceId(item.spec) !== item.id)) throw new GithubSkillError('GitHub 技能源配置无效。');
    this.sources = sources; this.serialized = text;
  }
  private save(sources: GithubSkillSource[]): void {
    const file = this.stateFile, current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current !== this.serialized) throw new GithubSkillError('技能配置已被其他 Host 修改，请刷新后重试。');
    const text = JSON.stringify(githubSkillStateSchema.parse({ schemaVersion: 1, sources })) + '\n';
    if (Buffer.byteLength(text) > 262144) throw new GithubSkillError('GitHub 技能配置过大。');
    writeFileSync(this.owned(file + '.tmp'), text, { mode: 0o600 }); renameSync(this.owned(file + '.tmp'), file); this.serialized = text; this.sources = sources;
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private changed(): void { if (!this.closed) for (const listener of this.listeners) listener(); }
  private releaseRoot(id: string, digest: string): string {
    if (!/^[a-f0-9]{64}$/.test(id) || !/^[a-f0-9]{64}$/.test(digest)) throw new GithubSkillError('技能版本标识无效。');
    return this.owned(join(this.root, 'releases', id, digest));
  }
  private release(id: string, digest: string): GithubSkillRelease {
    const file = this.owned(join(this.releaseRoot(id, digest), 'manifest.json'));
    if (statSync(file).size > 1024 * 1024) throw new GithubSkillError('技能版本清单过大。');
    const value = githubSkillReleaseSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    if (value.digest !== digest || value.sourceId !== id || sourceId(value.spec) !== id || JSON.stringify(normalizeGithubSkillSpec(value.spec)) !== JSON.stringify(value.spec) || releaseDigest(value) !== digest) throw new GithubSkillError('技能版本清单已变化。');
    const paths = new Set<string>();
    for (const file of value.files) { githubSkillPath(file.path); const key = `${file.location}/${file.path}`.normalize('NFC').toLowerCase(); if (paths.has(key)) throw new GithubSkillError('技能文件路径重复。'); paths.add(key); }
    return value;
  }
  private verify(id: string, digest: string): GithubSkillRelease {
    const value = this.release(id, digest), root = this.releaseRoot(id, digest), expected = new Set(['manifest.json']);
    for (const file of value.files) {
      const relative = `${file.location}/${file.path}`; expected.add(relative);
      const path = this.owned(join(root, file.location, file.path));
      const info = lstatSync(path); if (!info.isFile() || info.size !== file.bytes) throw new GithubSkillError('技能文件已变化。');
      const bytes = readFileSync(path); if (sha256(bytes) !== file.sha256 || sha1(bytes) !== file.gitSha) throw new GithubSkillError('技能文件摘要不匹配。');
    }
    const walk = (folder: string, prefix = ''): void => {
      for (const name of readdirSync(folder)) { const path = this.owned(join(folder, name)), rel = prefix + name, info = lstatSync(path);
        if (info.isDirectory()) walk(path, rel + '/'); else if (!info.isFile() || !expected.has(rel)) throw new GithubSkillError('技能目录包含未登记文件。');
      }
    };
    walk(root); return value;
  }
  list(): GithubSkillSourceView[] {
    this.reload(); return this.sources.map(source => {
      const running = source.enabled ? this.mounted.get(source.id) ?? '' : ''; let skills: GithubSkillRelease['entries'] = [];
      try { if (running || source.active) skills = this.release(source.id, running || source.active).entries; } catch {}
      return { ...structuredClone(source), running, skills };
    });
  }
  /** Read all retained immutable releases, including unapproved or forgotten
   * sources. Does not construct another Host or activate pending updates. */
  backupState(): {schemaVersion:1;root:string;statePresent:boolean;sources:GithubSkillSource[];running:Array<{id:string;digest:string}>;releases:Array<{root:string;release:GithubSkillRelease}>} {
    if(this.closed||this.busy)throw new GithubSkillError('技能资源操作进行中或服务已关闭，请稍后备份。');
    const rootCurrent=()=>{const info=lstatSync(this.root,{bigint:true});if(info.isSymbolicLink()||!info.isDirectory()||info.dev+':'+info.ino!==this.rootIdentity)throw new GithubSkillError('技能缓存根已变化。');};rootCurrent();this.reload();
    const before=this.serialized,statePresent=existsSync(this.stateFile),releases:Array<{root:string;release:GithubSkillRelease}>=[],parent=this.owned(join(this.root,'releases'));let metadataBytes=0;
    if(existsSync(parent)){
      const ids=readdirSync(parent).sort();if(ids.length>1024)throw new GithubSkillError('技能保留来源过多。');
      for(const id of ids){if(!/^[a-f0-9]{64}$/.test(id)||!lstatSync(this.owned(join(parent,id))).isDirectory())throw new GithubSkillError('技能保留来源无效。');
        const digests=readdirSync(this.owned(join(parent,id))).sort();if(digests.length>20)throw new GithubSkillError('技能保留版本过多。');
        for(const digest of digests){const root=this.releaseRoot(id,digest),manifest=lstatSync(this.owned(join(root,'manifest.json')));if(!manifest.isFile())throw new GithubSkillError('技能版本清单无效。');metadataBytes+=manifest.size;if(releases.length>=1024||metadataBytes>64*1024**2)throw new GithubSkillError('技能备份清单过大。');releases.push({root,release:this.verify(id,digest)});}
      }
    }
    this.reload();if(this.serialized!==before||existsSync(this.stateFile)!==statePresent)throw new GithubSkillError('技能来源已变化，请重新备份。');
    rootCurrent();return structuredClone({schemaVersion:1,root:this.root,statePresent,sources:this.sources,running:[...this.mounted].map(([id,digest])=>({id,digest})),releases});
  }
  history(id: string): GithubSkillSummary[] {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new GithubSkillError('技能来源标识无效。');
    const path = this.owned(join(this.root, 'releases', id)); if (!existsSync(path)) return [];
    const names = readdirSync(path); if (names.length > 20) throw new GithubSkillError('技能保留版本过多。');
    return names.map(name => summary(this.release(id, name))).sort((a, b) => a.revision.localeCompare(b.revision));
  }
  inspect(id: string, digest: string): GithubSkillPreview {
    this.reload(); const release = this.release(id, digest), source = this.sources.find(item => item.id === id) ?? null;
    const baseline = this.mounted.get(id) || source?.active;
    let active; try { active = baseline ? this.release(id, baseline) : undefined; } catch {}
    const before = new Map(active?.files.map(file => [`${file.location}/${file.path}`, `${file.sha256}:${file.mode}`]) ?? []), after = new Map(release.files.map(file => [`${file.location}/${file.path}`, `${file.sha256}:${file.mode}`]));
    return { release, source: source ? this.list().find(item => item.id === source.id) ?? null : null, comparisonAvailable: !baseline || !!active, added: [...after.keys()].filter(path => !before.has(path)), removed: [...before.keys()].filter(path => !after.has(path)), changed: [...after.keys()].filter(path => before.has(path) && before.get(path) !== after.get(path)) };
  }
  file(id: string, digest: string, location: 'package' | 'origin', path: string): GithubSkillFilePreview {
    const release = this.release(id, digest), item = release.files.find(file => file.location === location && file.path === path);
    if (!item) throw new GithubSkillError('技能资源不可访问。');
    const target = this.owned(join(this.releaseRoot(id, digest), location, githubSkillPath(path)));
    if (!lstatSync(target).isFile() || statSync(target).size !== item.bytes) throw new GithubSkillError('技能资源大小已变化。');
    const bytes = readFileSync(target);
    if (bytes.length !== item.bytes || sha256(bytes) !== item.sha256 || sha1(bytes) !== item.gitSha) throw new GithubSkillError('技能资源已变化。');
    let content = '', encoding: 'opaque' | 'text' = 'opaque';
    if (bytes.length <= 131072) try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if (!content.includes('\0')) encoding = 'text'; else content = ''; } catch {}
    return { path, location, sha256: item.sha256, bytes: item.bytes, encoding, content };
  }
  private async raw(url: string, size: number, signal: AbortSignal): Promise<Buffer> {
    const target = new URL(url); if (target.origin !== 'https://raw.githubusercontent.com' || target.username || target.password || target.search || target.hash) throw new GithubSkillError('技能下载来源无效。');
    const response = await this.fetcher(target.href, { method: 'GET', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), headers: { Accept: 'application/octet-stream', 'User-Agent': 'DSH-zhen-skills/0.1.0' } });
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new GithubSkillError('公开技能文件暂时无法下载。'); }
    const reader = response.body.getReader(), parts: Uint8Array[] = []; let total = 0;
    try { while (true) { const item = await reader.read(); if (item.done) break; total += item.value.byteLength; if (total > size || total > 8 * 1024 * 1024) throw new GithubSkillError('技能文件超出声明大小。'); parts.push(item.value); } }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (total !== size) throw new GithubSkillError('技能文件大小不匹配。'); return Buffer.concat(parts);
  }
  async download(input: GithubSkillSpec, signal?: AbortSignal): Promise<GithubSkillPreview> {
    if (this.busy || this.closed) throw new GithubSkillError('已有技能下载进行中。'); this.busy = true;
    const controller = this.downloading = new AbortController();
    const abort = AbortSignal.any([...(signal ? [signal] : []), this.lifetime.signal, controller.signal]);
    const stage = join(this.root, 'staging', randomUUID());
    try {
      this.owned(stage);
      let spec = normalizeGithubSkillSpec(input); const repo = spec.repository.slice('https://github.com/'.length), api = `https://api.github.com/repos/${repo}`;
      const metadata = JSON.parse(await readPublic(api, this.fetcher, abort, 256 * 1024));
      if (String(metadata.full_name).toLowerCase() !== repo || metadata.private !== false) throw new GithubSkillError('仓库身份不匹配或不是公开仓库。');
      if (!spec.reference) spec = normalizeGithubSkillSpec({ ...spec, reference: metadata.default_branch });
      const commit = JSON.parse(await readPublic(`${api}/commits/${encodeURIComponent(spec.reference)}`, this.fetcher, abort, 2 * 1024 * 1024));
      if (!gitSha(commit.sha) || !gitSha(commit.commit?.tree?.sha)) throw new GithubSkillError('GitHub 提交标识无效。');
      const revision = commit.sha, id = sourceId(spec);
      for (const old of this.history(id)) if (old.revision === revision) { this.verify(id, old.digest); return this.inspect(id, old.digest); }
      const tree = async (sha: string, recursive = false): Promise<TreeEntry[]> => {
        const response = JSON.parse(await readPublic(`${api}/git/trees/${sha}${recursive ? '?recursive=1' : ''}`, this.fetcher, abort, 2 * 1024 * 1024));
        if (response.sha !== sha || response.truncated !== false || !Array.isArray(response.tree) || response.tree.length > 1024) throw new GithubSkillError('GitHub 目录树不完整或过大。');
        verifyTree(response.tree as TreeEntry[], sha, recursive); return response.tree as TreeEntry[];
      };
      const top = await tree(commit.commit.tree.sha); let selected = commit.commit.tree.sha;
      for (const [index, part] of spec.path.split('/').filter(Boolean).entries()) {
        const entries = index === 0 ? top : await tree(selected), child = entries.find(item => item.path === part && item.type === 'tree' && item.mode === '040000');
        if (!child || !gitSha(child.sha)) throw new GithubSkillError('仓库中没有所选技能目录。'); selected = child.sha;
      }
      const entries = await tree(selected, true), files: Array<{ entry: TreeEntry; location: 'package' | 'origin'; remote: string }> = [];
      const seen = new Set<string>(); let declared = 0;
      for (const entry of entries) {
        githubSkillPath(entry.path);
        const key = entry.path.normalize('NFC').toLowerCase(); if (seen.has(key)) throw new GithubSkillError('技能路径在本机有大小写冲突。'); seen.add(key);
        if (entry.type === 'tree' && entry.mode === '040000') continue;
        if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) || !gitSha(entry.sha) || !Number.isSafeInteger(entry.size) || entry.size! < 0 || entry.size! > 8 * 1024 * 1024) throw new GithubSkillError('技能包含链接、子模块或不支持的文件。');
        declared += entry.size!; files.push({ entry, location: 'package', remote: [spec.path, entry.path].filter(Boolean).join('/') });
      }
      if (files.length > 512 || declared > 32 * 1024 * 1024) throw new GithubSkillError('技能资源包过大。');
      const notices = top.filter(item => item.type === 'blob' && /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(item.path));
      if (notices.length > 4) throw new GithubSkillError('仓库许可文件过多，请选择较小的技能来源。');
      for (const entry of notices) {
        githubSkillPath(entry.path); if (!gitSha(entry.sha) || !['100644', '100755'].includes(entry.mode) || !Number.isSafeInteger(entry.size) || entry.size! < 0 || entry.size! > 262144) throw new GithubSkillError('仓库许可文件无效。');
        declared += entry.size!; files.push({ entry, location: 'origin', remote: entry.path });
      }
      const outputPaths = new Set<string>();
      for (const file of files) { const key = `${file.location}/${file.entry.path}`.normalize('NFC').toLowerCase(); if (outputPaths.has(key)) throw new GithubSkillError('文件或许可路径在本机有冲突。'); outputPaths.add(key); }
      const cache = this.owned(join(this.root, 'releases')); let used = 0, count = 0;
      if (existsSync(cache)) for (const source of readdirSync(cache)) { if (++count > 64) throw new GithubSkillError('缓存来源过多，请清理未选版本。'); for (const release of this.history(source)) used += release.bytes; }
      if (count >= 64 && !existsSync(this.owned(join(cache, id)))) throw new GithubSkillError('缓存来源过多，请清理未选版本。');
      if (used + declared > 512 * 1024 * 1024 || this.history(id).length >= 20) throw new GithubSkillError('技能缓存已达上限，请移除未选中的下载版本。');
      mkdirSync(this.owned(join(stage, 'package')), { recursive: true }); mkdirSync(this.owned(join(stage, 'origin')), { recursive: true });
      const stored: GithubSkillFile[] = [];
      // Keep public API metadata reads small; pinned raw-file requests do not
      // need one REST blob call per resource. Each byte stream is still hashed.
      for (const item of files) {
        abort.throwIfAborted();
        const url = `https://raw.githubusercontent.com/${repo}/${revision}/${item.remote.split('/').map(encodeURIComponent).join('/')}`;
        const bytes = await this.raw(url, item.entry.size!, abort);
        if (sha1(bytes) !== item.entry.sha) throw new GithubSkillError('Git 文件摘要与提交树不匹配。');
        if (bytes.subarray(0, 43).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1')) throw new GithubSkillError('技能包含尚未支持的 Git LFS 资源。');
        const path = this.owned(join(stage, item.location, item.entry.path)); mkdirSync(this.owned(dirname(path)), { recursive: true });
        writeFileSync(path, bytes, { mode: item.entry.mode === '100755' ? 0o700 : 0o600 });
        stored.push({ location: item.location, path: item.entry.path, gitSha: item.entry.sha, sha256: sha256(bytes), bytes: bytes.length, mode: item.entry.mode as '100644' | '100755' });
      }
      stored.sort((a, b) => `${a.location}/${a.path}` < `${b.location}/${b.path}` ? -1 : 1);
      const parser = new LocalSkills(join(stage, 'inspection.json'));
      let draft;
      try { draft = await parser.preview(join(stage, 'package'), spec.mode); } finally { parser.close(); }
      if (!draft.entries.length) throw new GithubSkillError('所选目录没有有效 SKILL.md。');
      const payload = { schemaVersion: 1 as const, spec, sourceId: id, revision, tree: selected, license: typeof metadata.license?.spdx_id === 'string' ? metadata.license.spdx_id.slice(0, 100) : 'NOASSERTION', files: stored, entries: draft.entries, problems: draft.problems };
      const release = githubSkillReleaseSchema.parse({ ...payload, digest: releaseDigest(payload) });
      writeFileSync(this.owned(join(stage, 'manifest.json')), JSON.stringify(release) + '\n', { mode: 0o600 });
      const target = this.releaseRoot(id, release.digest); mkdirSync(this.owned(dirname(target)), { recursive: true });
      if (existsSync(target)) this.verify(id, release.digest); else renameSync(stage, target);
      this.verify(id, release.digest); return this.inspect(id, release.digest);
    } finally { try { if (existsSync(stage)) rmSync(this.owned(stage), { recursive: true, force: true }); } finally { this.busy = false; if (this.downloading === controller) this.downloading = undefined; } }
  }
  approve(id: string, digest: string, confirmation: string): void {
    if (confirmation !== GITHUB_SKILL_POLICY) throw new GithubSkillError('请先审阅来源及完整资源清单。');
    this.reload(); const release = this.verify(id, digest), old = this.sources.find(item => item.id === id), running = this.mounted.get(id) ?? '', activate = !running || running === digest;
    const source: GithubSkillSource = old ? { ...old, enabled: true, pending: activate ? '' : digest, active: activate ? digest : old.active } : { id, spec: release.spec, enabled: true, automatic: true, active: digest, pending: '', latest: digest, checkedAt: new Date().toISOString(), state: 'checked', policy: GITHUB_SKILL_POLICY };
    this.save(old ? this.sources.map(item => item.id === id ? source : item) : [...this.sources, source]); if (activate) this.mounted.set(id, digest); this.changed();
  }
  disable(id: string): void { this.reload(); this.save(this.sources.map(item => item.id === id ? { ...item, enabled: false, pending: '' } : item)); this.changed(); }
  forget(id: string): void { this.reload(); this.save(this.sources.filter(item => item.id !== id)); this.mounted.delete(id); this.changed(); }
  cancelPending(id: string): void { this.reload(); this.save(this.sources.map(item => item.id === id ? { ...item, pending: '' } : item)); }
  cancelDownload(): void { this.downloading?.abort(); }
  automatic(id: string, enabled: boolean): void { this.reload(); this.save(this.sources.map(item => item.id === id ? { ...item, automatic: enabled } : item)); }
  async check(id: string, signal?: AbortSignal): Promise<void> {
    this.reload(); const source = this.sources.find(item => item.id === id); if (!source) throw new GithubSkillError('技能来源不存在。');
    let preview: GithubSkillPreview | undefined;
    try { preview = await this.download(source.spec, signal); } catch { if (signal?.aborted || this.closed) return; }
    this.reload(); if (this.closed || signal?.aborted) return;
    this.save(this.sources.map(item => item.id === id ? { ...item, latest: preview?.release.digest ?? item.latest, checkedAt: new Date().toISOString(), state: preview ? 'checked' : 'unavailable' } : item));
  }
  async automaticCheck(signal?: AbortSignal): Promise<void> {
    if (this.busy || this.closed) return;
    for (const source of this.list()) if (source.enabled && source.automatic && (!source.checkedAt || Date.now() - Date.parse(source.checkedAt) > 86400000)) { if (signal?.aborted || this.closed) return; await this.check(source.id, signal); }
  }
  deleteRelease(id: string, digest: string): void {
    this.reload(); if (this.busy) throw new GithubSkillError('请等待当前下载结束。');
    const source = this.sources.find(item => item.id === id); if (source?.active === digest || source?.pending === digest || this.mounted.get(id) === digest) throw new GithubSkillError('不能移除当前或待启用版本。');
    this.release(id, digest); const path = this.releaseRoot(id, digest); rmSync(this.owned(path), { recursive: true, force: true });
    const parent = this.owned(dirname(path)); if (!readdirSync(parent).length) rmSync(parent, { recursive: true, force: true });
    if (source?.latest === digest) this.save(this.sources.map(item => item.id === id ? { ...item, latest: item.active } : item));
  }
  provider(): SkillProvider {
    return { name: 'dsh-zhen-github-skills',
      list: async options => {
        options.signal?.throwIfAborted(); const candidates = [], seen = new Set<string>();
        for (const source of this.list()) if (source.enabled && source.running) try { const release = this.release(source.id, source.running); for (const entry of release.entries) if (!seen.has(entry.name)) {
          seen.add(entry.name); candidates.push({ name: entry.name, description: entry.description, provider: 'dsh-zhen-github-skills', source: 'custom', rank: 450,
            resourceBase: { kind: 'directory' as const, path: join(this.releaseRoot(source.id, source.running), 'package', entry.directory) }, invocation: { modelInvocable: entry.modelInvocable, userInvocable: entry.userInvocable }, locator: { sourceId: source.id, digest: source.running, directory: entry.directory, bodyDigest: entry.digest } });
        } } catch {}
        return candidates;
      },
      get: async (candidate, options) => {
        options.signal?.throwIfAborted(); const locator = candidate.locator as { sourceId?: string; digest?: string; directory?: string; bodyDigest?: string } | undefined;
        const source = this.list().find(item => item.id === locator?.sourceId && item.enabled && item.running === locator?.digest);
        if (!source || !locator || typeof locator.directory !== 'string' || typeof locator.bodyDigest !== 'string') return undefined;
        try {
          const release = this.verify(source.id, source.running), root = this.releaseRoot(source.id, source.running), parser = new LocalSkills(join(root, 'inspection.json')); let body;
          try { body = await parser.body(join(root, 'package'), locator.directory, locator.bodyDigest); } finally { parser.close(); }
          options.signal?.throwIfAborted(); if (body.entry.name !== candidate.name || !this.list().some(item => item.id === source.id && item.enabled && item.running === release.digest) || this.closed) return undefined;
          return { name: body.entry.name, description: body.entry.description, provider: 'dsh-zhen-github-skills', source: 'custom', resourceBase: { kind: 'directory', path: body.resourceRoot }, invocation: { modelInvocable: body.entry.modelInvocable, userInvocable: body.entry.userInvocable }, content: body.content };
        } catch { options.signal?.throwIfAborted(); return undefined; }
      },
    };
  }
  close(): void { this.closed = true; this.lifetime.abort(); this.listeners.clear(); }
}
