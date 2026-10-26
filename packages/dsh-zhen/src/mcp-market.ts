import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, lstatSync, realpathSync, statSync, rmSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, dirname } from 'node:path';
import { parse } from 'yaml';
import { DatabaseSync } from 'node:sqlite';
import semver from 'semver';
import { MCP_RECIPES, mcpId, mcpReleaseSchema, mcpMarketSnapshotSchema, mcpArchiveSchema } from './mcp-market-schema.ts';
import type { McpId, McpRelease, McpInstallation, McpSelection, McpMarketSnapshot, McpArchive } from './mcp-market-schema.ts';
import { readPublic } from './updates.ts';

const require = createRequire(import.meta.url);
const REPOSITORY = 'git+https://github.com/modelcontextprotocol/servers.git';
const MAX_FILES = 20000, MAX_BYTES = 128 * 1024 * 1024;
const MAX_STATE_BYTES = 1024 * 1024;
export function canonicalMcpWorkspace(path: string): string {
  if (!isAbsolute(path) || !statSync(path).isDirectory()) throw new Error('请选择已存在的绝对项目目录。');
  // Native Windows realpath expands 8.3 aliases and preserves the stored path
  // spelling. Lowercasing the path breaks reference-server prefix checks.
  return realpathSync.native(path);
}
function inside(root: string, path: string): boolean { const rel = relative(root, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'); }
function ownedPath(root: string, path: string): void {
  const target = resolve(path);
  if (target === root || !inside(root, target)) throw new Error('MCP 维护目录越出专用存储范围。');
  for (let cursor = target; cursor !== root; cursor = dirname(cursor)) {
    let info;
    try { info = lstatSync(cursor); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    if (info.isSymbolicLink() || !inside(root, realpathSync.native(cursor))) throw new Error('MCP 维护目录包含链接或发生漂移。');
  }
}
export function mcpChildEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) if (/^(?:path|systemroot|windir|comspec|temp|tmp|tmpdir|pathext|lang|lc_all)$/i.test(name) && value !== undefined) env[name] = value;
  return { ...env, ...extra };
}
function hash(bytes: string | Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
export function mcpNodeCompatible(range: string): boolean { return !range || !!semver.validRange(range) && semver.satisfies(process.versions.node, range); }

/** The complete installed JS dependency tree is pinned, including the lockfile.
 * Data lives outside this tree. Bin shims are never used by the launcher. */
export function inspectMcpInstallation(directory: string): { digest: string; packages: number } {
  const root = realpathSync(directory), files: string[] = []; let size = 0;
  const walk = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const filename = join(folder, entry.name), stat = lstatSync(filename);
      if (stat.isSymbolicLink() || !inside(root, realpathSync(filename))) throw new Error('MCP 程序目录包含未支持的链接。');
      if (stat.isDirectory()) walk(filename);
      else if (stat.isFile()) { files.push(filename); size += stat.size; if (files.length > MAX_FILES || size > MAX_BYTES) throw new Error('MCP 程序目录超出支持范围。'); }
      else throw new Error('MCP 程序目录包含特殊文件。');
    }
  };
  walk(root);
  const digest = createHash('sha256');
  for (const filename of files.sort()) { const bytes = readFileSync(filename); if (bytes.length > MAX_BYTES) throw new Error('MCP 文件过大。'); digest.update(relative(root, filename).replaceAll('\\', '/')).update('\0').update(String(bytes.length)).update('\0').update(bytes); }
  const lock = parse(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8'));
  const packages = Object.entries(lock.packages ?? {});
  if (!packages.length || packages.length > 1000) throw new Error('MCP 依赖清单无效。');
  for (const [, value] of packages) {
    const resolution = (value as { resolution?: { integrity?: string; tarball?: string; type?: unknown } }).resolution;
    if (!resolution || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(resolution.integrity ?? '') || resolution.type !== undefined) throw new Error('MCP 依赖缺少固定的注册表摘要。');
    if (resolution.tarball) { const url = new URL(resolution.tarball); if (url.origin !== 'https://registry.npmjs.org' || url.search || url.hash || url.username || url.password) throw new Error('MCP 依赖来源不受支持。'); }
  }
  return { digest: digest.digest('hex'), packages: packages.length };
}

class McpReleaseIssue extends Error {
  constructor(readonly kind: 'source' | 'revision' | 'metadata', readonly version = '', readonly node = '') { super(kind === 'source' ? 'MCP 发布信息与固定来源不一致。' : 'MCP 发布信息尚未通过校验。'); }
}
function mcpUpdateNotice(id: McpId, issue: unknown): string {
  const detail = issue instanceof McpReleaseIssue ? issue.kind === 'source' ? '发布来源校验未通过' : issue.kind === 'revision' ? '来源未提供有效固定提交，暂不能校验' : '发布校验信息不完整，暂不能使用此更新' : '暂时无法读取更新，请稍后重新检查';
  const version = issue instanceof McpReleaseIssue && issue.version ? ` ${issue.version}` : '';
  const requirement = issue instanceof McpReleaseIssue && issue.node && !mcpNodeCompatible(issue.node) ? `；需要 Node ${issue.node}，当前 ${process.versions.node}` : '';
  return `${MCP_RECIPES[id].title}${version}：${detail}${requirement}`.slice(0, 120);
}
export async function inspectMcpRelease(idInput: string, version: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<McpRelease> {
  const id = mcpId.parse(idInput), recipe = MCP_RECIPES[id];
  if (!/^(?:latest|\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)$/.test(version) || version.length > 60) throw new Error('MCP 版本无效。');
  const metadata = JSON.parse(await readPublic(`https://registry.npmjs.org/${encodeURIComponent(recipe.package)}/${version}`, fetcher, signal, 256 * 1024));
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new McpReleaseIssue('metadata');
  if (metadata.name !== recipe.package || (version !== 'latest' && metadata.version !== version) || metadata.repository?.url !== REPOSITORY || metadata.bin?.[`mcp-server-${id}`] !== recipe.entry || typeof metadata.dist?.tarball !== 'string') throw new McpReleaseIssue('source');
  let tarball: URL; try { tarball = new URL(metadata.dist.tarball); } catch { throw new McpReleaseIssue('source'); }
  if (tarball.origin !== 'https://registry.npmjs.org' || tarball.username || tarball.password || tarball.search || tarball.hash) throw new McpReleaseIssue('source');
  // Only bounded, validated public facts can enter a user-facing diagnosis.
  // An incomplete publication still cannot become an installable candidate.
  const parsedVersion = mcpReleaseSchema.shape.version.safeParse(metadata.version);
  const publicVersion = parsedVersion.success ? parsedVersion.data : '';
  const publicNode = typeof metadata.engines?.node === 'string' && metadata.engines.node.length <= 40 && semver.validRange(metadata.engines.node) ? metadata.engines.node : '';
  if (!/^[a-f0-9]{40}$/.test(typeof metadata.gitHead === 'string' ? metadata.gitHead : '')) throw new McpReleaseIssue('revision', publicVersion, publicNode);
  const parsed = mcpReleaseSchema.safeParse({ id, version: metadata.version, integrity: metadata.dist.integrity, gitHead: metadata.gitHead, node: metadata.engines?.node ?? '', license: metadata.license ?? '', checkedAt: new Date().toISOString() });
  if (!parsed.success) throw new McpReleaseIssue('metadata', publicVersion, publicNode);
  return parsed.data;
}

async function installDependencies(root: string, cache: string, signal?: AbortSignal): Promise<void> {
  const pnpm = join(dirname(require.resolve('pnpm')), 'bin', 'pnpm.cjs');
  const config = join(root, '.npmrc');
  const env = mcpChildEnvironment({ NPM_CONFIG_USERCONFIG: config, NPM_CONFIG_GLOBALCONFIG: config });
  await new Promise<void>((done, reject) => {
    let failed = false;
    const child = spawn(process.execPath, [pnpm, 'install', '--ignore-scripts', '--ignore-pnpmfile', '--ignore-workspace', '--config.node-linker=hoisted', '--config.manage-package-manager-versions=false', '--config.verify-store-integrity=true', '--engine-strict', '--registry=https://registry.npmjs.org', `--store-dir=${cache}`, '--reporter=silent'], { cwd: root, env, windowsHide: true, stdio: 'ignore', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000) });
    child.once('error', () => { failed = true; });
    // Wait for close, including after abort, before the staging tree is removed.
    child.once('close', code => !failed && code === 0 ? done() : reject(new Error('MCP 安装未完成，请检查网络与 Node 版本要求。')));
  });
}

export class McpMarket {
  readonly root: string;
  private state: McpMarketSnapshot = { schemaVersion: 2, archives: [], automatic: true, checkedAt: '', message: '可查看固定来源，并选择需要的工具。', nextEpoch: 1, candidates: [], installations: [], selections: [] };
  private readonly grants: DatabaseSync;
  private checking?: Promise<McpMarketSnapshot>;
  private installing = new Set<McpId>();
  private automaticRunning?: Promise<void>;
  private readonly downloadAttempts = new Map<string, number>();
  constructor(root: string, private readonly fetcher: typeof fetch = fetch, private readonly installer = installDependencies) {
    mkdirSync(root, { recursive: true }); this.root = realpathSync.native(root);
    this.grants = new DatabaseSync(join(this.root, 'session-grants.sqlite'));
    try {
      const schema = this.grants.prepare('PRAGMA user_version').get()!.user_version;
      if (schema !== 0 && schema !== 1) throw new Error('MCP 授权记录版本较新，请保留数据并恢复兼容程序。');
      this.grants.exec('CREATE TABLE IF NOT EXISTS grants (session_id TEXT NOT NULL, id TEXT NOT NULL, epoch INTEGER NOT NULL, PRIMARY KEY(session_id,id,epoch)); PRAGMA user_version=1');
      const file = join(this.root, 'market.json');
      if (existsSync(file)) {
        if (statSync(file).size > MAX_STATE_BYTES) throw new Error('MCP 状态文件过大。');
        this.state = mcpMarketSnapshotSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
        // Only a previously reviewed pending version activates across Host start.
        for (const selected of this.state.selections) if (selected.pending) { selected.active = selected.pending; selected.pending = ''; selected.enabled = true; selected.epoch = this.state.nextEpoch++; }
      }
      // Metadata is written before moving a program. Recover orphaned backup
      // records after interruption without executing or trusting their files.
      const quarantine = join(this.root, 'quarantine'); ownedPath(this.root, quarantine);
      if (existsSync(quarantine)) for (const name of readdirSync(quarantine).slice(0, 101)) {
        if (!/^[a-f0-9-]{36}$/.test(name) || this.state.archives.some(item => item.archiveId === name)) continue;
        const file = join(quarantine, name, 'record.json');
        try {
          ownedPath(this.root, file); if (statSync(file).size > 16384) continue;
          const record = mcpArchiveSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
          if (record.archiveId !== name || this.state.archives.length >= 100) continue;
          if (!existsSync(join(quarantine, name, 'program'))) { record.programRetained = false; record.verified = false; }
          this.state.archives.push(record);
        } catch { /* Preserve an unknown record; never follow or execute it. */ }
      }
      if (existsSync(file) || this.state.archives.length) this.save();
    } catch (error) { this.grants.close(); throw error; }
  }
  snapshot(): McpMarketSnapshot { return structuredClone(this.state); }
  isMaintaining(id: McpId): boolean { return this.installing.has(id); }
  close(): void { this.grants.close(); }
  grant(sessionId: string, id: McpId): void {
    if (!sessionId || sessionId.length > 200) throw new Error('当前会话标识无效。');
    const selected = this.state.selections.find(item => item.id === id && item.enabled);
    if (!selected) throw new Error('MCP 连接已停用。');
    this.grants.prepare('INSERT OR IGNORE INTO grants VALUES (?,?,?)').run(sessionId, id, selected.epoch);
  }
  hasSessionGrants(sessionId: string): boolean { return !!this.grants.prepare('SELECT 1 FROM grants WHERE session_id=? LIMIT 1').get(sessionId); }
  assertSession(sessionId: string, workspace: string): void {
    const scope = canonicalMcpWorkspace(workspace);
    for (const grant of this.grants.prepare('SELECT id, epoch FROM grants WHERE session_id=?').all(sessionId)) {
      const selected = this.state.selections.find(item => item.id === grant.id);
      if (!selected?.enabled || selected.epoch !== grant.epoch || selected.workspace !== scope) throw new Error('此会话包含已停用、已更新或其他项目的 MCP 结果。请新建会话后继续。');
    }
  }
  private save(): void { mcpMarketSnapshotSchema.parse(this.state); const content = JSON.stringify(this.state) + '\n'; if (Buffer.byteLength(content) > MAX_STATE_BYTES) throw new Error('MCP 状态文件过大。'); const file = join(this.root, 'market.json'); ownedPath(this.root, file); ownedPath(this.root, file + '.tmp'); writeFileSync(file + '.tmp', content, { mode: 0o600 }); renameSync(file + '.tmp', file); }
  setAutomatic(enabled: boolean): void { this.state.automatic = enabled; this.save(); }
  private directory(id: McpId, version: string): string {
    mcpReleaseSchema.shape.version.parse(version);
    const path = join(this.root, 'packages', id, version); ownedPath(this.root, path); return path;
  }
  async check(signal?: AbortSignal): Promise<McpMarketSnapshot> {
    if (this.checking) return this.checking;
    const pending = (async () => {
      const ids = Object.keys(MCP_RECIPES) as McpId[];
      const candidates = await Promise.allSettled(ids.map(id => inspectMcpRelease(id, 'latest', this.fetcher, signal)));
      if (signal?.aborted) return this.snapshot();
      const notices: string[] = [];
      for (const [index, result] of candidates.entries()) {
        if (result.status !== 'fulfilled') { notices.push(mcpUpdateNotice(ids[index]!, result.reason)); continue; }
        const release = result.value;
        const known = [this.state.candidates.find(item => item.id === release.id && item.version === release.version), ...this.state.installations.map(item => item.release).filter(item => item.id === release.id && item.version === release.version)].filter(Boolean);
        if (known.some(item => item!.integrity !== release.integrity || item!.gitHead !== release.gitHead || item!.node !== release.node || item!.license !== release.license)) { notices.push(`${MCP_RECIPES[release.id].title}：此版本的校验信息发生变化，保留原记录。`); continue; }
        this.state.candidates = [...this.state.candidates.filter(item => item.id !== release.id), release];
        if (!mcpNodeCompatible(release.node)) notices.push(`${MCP_RECIPES[release.id].title} ${release.version}：新版本需要 Node ${release.node}，当前 ${process.versions.node}`.slice(0, 120));
      }
      this.state.checkedAt = new Date().toISOString(); this.state.message = notices.length ? `${notices.join('；')}。已保留当前版本与连接，也可选择页面中的固定版本。` : '已读取更新候选。安装固定版本前会核对 Node 要求和依赖。'; this.save(); return this.snapshot();
    })();
    this.checking = pending; try { return await pending; } finally { if (this.checking === pending) this.checking = undefined; }
  }
  async automaticCheck(signal?: AbortSignal): Promise<void> {
    if (this.automaticRunning) return this.automaticRunning;
    if (!this.state.automatic) return;
    const task = (async () => {
      if (!this.state.checkedAt || Date.now() - Date.parse(this.state.checkedAt) > 86400000) await this.check(signal);
      // Prepare only already trusted, enabled sources. Download never selects a
      // release or changes its active process. Incompatible candidates stay metadata.
      for (const selected of this.active()) {
        if (!this.state.automatic || signal?.aborted) break;
        const candidate = this.state.candidates.find(item => item.id === selected.id);
        if (!candidate || !mcpNodeCompatible(candidate.node) || this.state.installations.some(item => item.release.id === candidate.id && item.release.version === candidate.version)) continue;
        const key = `${candidate.id}@${candidate.version}:${candidate.integrity}`;
        if (Date.now() - (this.downloadAttempts.get(key) ?? 0) < 86400000) continue;
        this.downloadAttempts.set(key, Date.now());
        try { await this.install(candidate.id, candidate.version, candidate.integrity, signal); this.state.message = '兼容的 MCP 更新候选已下载，审阅后可安排下次 Host 启动。'; }
        catch { this.state.message = '部分 MCP 更新下载未完成，当前连接保留；可稍后手动重试。'; }
        if (!signal?.aborted) this.save();
      }
    })();
    this.automaticRunning = task;
    try { await task; } finally { if (this.automaticRunning === task) this.automaticRunning = undefined; }
  }
  private removeStage(path: string): void {
    if (!path) return;
    ownedPath(this.root, path);
    const absolute = resolve(path), parent = join(this.root, 'staging');
    if (!inside(parent, absolute) || absolute === parent) throw new Error('MCP 暂存清理范围无效。');
    if (existsSync(absolute)) rmSync(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  private async prepareProgram(release: McpRelease, signal?: AbortSignal): Promise<{ stage: string; installed: McpInstallation }> {
    const recipe = MCP_RECIPES[release.id];
    const license = await readPublic(`https://raw.githubusercontent.com/modelcontextprotocol/servers/${release.gitHead}/LICENSE`, this.fetcher, signal, 32768);
    const stage = join(this.root, 'staging', randomUUID()); ownedPath(this.root, stage); mkdirSync(stage, { recursive: true });
    try {
      writeFileSync(join(stage, '.npmrc'), 'registry=https://registry.npmjs.org\nignore-scripts=true\nignore-pnpmfile=true\nnode-linker=hoisted\nmanage-package-manager-versions=false\nverify-store-integrity=true\n');
      writeFileSync(join(stage, 'package.json'), JSON.stringify({ name: `dsh-zhen-mcp-${release.id}`, version: '1.0.0', private: true, dependencies: { [recipe.package]: release.version }, ...(release.node ? { engines: { node: release.node } } : {}) }) + '\n');
      writeFileSync(join(stage, 'SOURCE-LICENSE.txt'), license);
      await this.installer(stage, join(this.root, 'package-cache'), signal);
      signal?.throwIfAborted();
      const lock = parse(readFileSync(join(stage, 'pnpm-lock.yaml'), 'utf8'));
      if (lock.packages?.[`${recipe.package}@${release.version}`]?.resolution?.integrity !== release.integrity) throw new Error('MCP 下载摘要与审阅版本不一致。');
      const pkg = JSON.parse(readFileSync(join(stage, 'node_modules', recipe.package, 'package.json'), 'utf8'));
      if (pkg.name !== recipe.package || pkg.version !== release.version) throw new Error('MCP 程序身份校验失败。');
      return { stage, installed: { release, ...inspectMcpInstallation(stage), installedAt: new Date().toISOString() } };
    } catch (error) { this.removeStage(stage); throw error; }
  }
  private archiveDirectory(id: string): string {
    const archiveId = mcpArchiveSchema.shape.archiveId.parse(id), path = join(this.root, 'quarantine', archiveId);
    ownedPath(this.root, path); return path;
  }
  private replaceProgram(id: McpId, version: string, from: string, installed: McpInstallation, message: string, restored?: McpArchive): void {
    if (this.state.archives.length >= 100) throw new Error('保留副本数量达到上限，请先整理隔离副本。');
    const before = this.snapshot(), restoredBefore = restored ? structuredClone(restored) : undefined, destination = this.directory(id, version), prior = this.state.installations.find(item => item.release.id === id && item.release.version === version);
    if (existsSync(destination) && !prior) throw new Error('目标程序目录未登记，不能覆盖。');
    ownedPath(this.root, from); ownedPath(this.root, destination);
    const archiveId = randomUUID(), directory = this.archiveDirectory(archiveId), retained = !!prior && existsSync(destination);
    let verified = false;
    if (retained) { try { verified = inspectMcpInstallation(destination).digest === prior!.digest; } catch { /* Preserve damaged bytes without trusting them. */ } }
    const backup: McpArchive | undefined = prior ? { archiveId, installation: prior, retainedAt: new Date().toISOString(), programRetained: retained, verified } : undefined;
    if (backup) { mkdirSync(directory, { recursive: true }); ownedPath(this.root, directory); writeFileSync(join(directory, 'record.json'), JSON.stringify(backup) + '\n', { mode: 0o600 }); }
    let oldMoved = false, newMoved = false;
    try {
      mkdirSync(dirname(destination), { recursive: true }); ownedPath(this.root, destination);
      if (retained) { renameSync(destination, join(directory, 'program')); oldMoved = true; }
      renameSync(from, destination); newMoved = true;
      this.state.installations = [...this.state.installations.filter(item => !(item.release.id === id && item.release.version === version)), installed];
      if (backup) this.state.archives.push(backup);
      if (restored) {
        const consumed = this.state.archives.find(item => item.archiveId === restored.archiveId)!; consumed.programRetained = false; consumed.verified = false;
        writeFileSync(join(this.archiveDirectory(restored.archiveId), 'record.json'), JSON.stringify(consumed) + '\n', { mode: 0o600 });
      }
      this.state.message = message;
      this.save();
    } catch (error) {
      this.state = before;
      // In-process failure restores the prior file layout; code never touches
      // project files or the separate memory data directory.
      if (newMoved) { ownedPath(this.root, destination); ownedPath(this.root, from); renameSync(destination, from); }
      if (oldMoved) { ownedPath(this.root, join(directory, 'program')); ownedPath(this.root, destination); renameSync(join(directory, 'program'), destination); }
      if (restoredBefore) { try { writeFileSync(join(this.archiveDirectory(restoredBefore.archiveId), 'record.json'), JSON.stringify(restoredBefore) + '\n'); } catch { /* Keep the original snapshot and bytes; report failure. */ } }
      throw error;
    }
  }
  /** Re-download an existing root version; transitive resolution may change.
   * Always leaves this connection disabled for a new explicit trust decision. */
  async repair(idInput: string, version: string, quiesce: () => Promise<void>, signal?: AbortSignal): Promise<void> {
    const id = mcpId.parse(idInput), prior = this.state.installations.find(item => item.release.id === id && item.release.version === version);
    if (!prior || this.installing.has(id)) throw new Error('请等待当前维护结束，并选择已登记的程序版本。');
    this.installing.add(id); let stage = '';
    try {
      this.disable(id); await quiesce(); signal?.throwIfAborted();
      const release = await inspectMcpRelease(id, version, this.fetcher, signal);
      if (!mcpNodeCompatible(release.node) || ['id','version','integrity','gitHead','node','license'].some(key => release[key as keyof McpRelease] !== prior.release[key as keyof McpRelease])) throw new Error('同版本发布身份变化，不能修复。');
      const prepared = await this.prepareProgram(release, signal); stage = prepared.stage;
      this.replaceProgram(id, version, stage, prepared.installed, '程序已重新下载并校验；连接保持停用，请核对新的完整程序摘要后重新信任启用。'); stage = '';
    } catch { throw new Error('MCP 修复未完成，连接保持停用。项目数据与保留副本不会被清空，请检查来源、网络和目录。'); }
    finally { this.installing.delete(id); this.removeStage(stage); }
  }
  async restoreArchive(archiveId: string, quiesce: () => Promise<void>): Promise<void> {
    const archive = this.state.archives.find(item => item.archiveId === archiveId);
    if (!archive?.programRetained || !archive.verified) throw new Error('此隔离记录没有通过原摘要核对的程序副本。');
    const { release } = archive.installation, id = release.id;
    if (this.installing.has(id)) throw new Error('此工具正在维护，请等待完成。');
    this.installing.add(id);
    try {
      const program = join(this.archiveDirectory(archiveId), 'program'); ownedPath(this.root, program);
      if (!mcpNodeCompatible(release.node) || inspectMcpInstallation(program).digest !== archive.installation.digest) throw new Error('隔离程序不再匹配保留摘要。');
      this.disable(id); await quiesce();
      if (inspectMcpInstallation(program).digest !== archive.installation.digest) throw new Error('等待期间隔离程序发生变化。');
      this.replaceProgram(id, release.version, program, structuredClone(archive.installation), '已还原保留的程序副本；连接保持停用，请重新信任后在新会话中使用。', archive);
    } catch { throw new Error('MCP 副本还原未完成；请检查程序摘要与目录。已停用的连接不会自动恢复。'); }
    finally { this.installing.delete(id); }
  }
  /** Download/resolve with lifecycle hooks disabled. Does not execute the server. */
  async install(idInput: string, version: string, integrity: string, signal?: AbortSignal): Promise<McpInstallation> {
    const id = mcpId.parse(idInput), recipe = MCP_RECIPES[id];
    if (this.installing.has(id)) throw new Error('此工具正在安装，请等待完成。');
    this.installing.add(id);
    let stage = '';
    try {
      const release = await inspectMcpRelease(id, version, this.fetcher, signal);
      if (!mcpNodeCompatible(release.node)) throw new Error('当前 Node 不满足此 MCP 的要求。');
      const candidate = this.state.candidates.find(item => item.id === id && item.version === version);
      const expected = version === recipe.version ? recipe.integrity : candidate?.integrity;
      if (!expected || release.integrity !== expected || integrity !== expected) throw new Error('MCP 版本或发布摘要已变化，请重新检查。');
      const expectedHead = version === recipe.version ? recipe.gitHead : candidate?.gitHead;
      if (release.gitHead !== expectedHead || candidate && (candidate.node !== release.node || candidate.license !== release.license)) throw new Error('MCP 来源或运行要求已变化，请重新检查。');
      const prior = this.state.installations.find(item => item.release.id === id && item.release.version === version);
      if (prior) { if (prior.release.integrity !== integrity) throw new Error('相同 MCP 版本的发布摘要发生变化。'); this.launch(id, version); return prior; }
      if (this.state.installations.length >= 100) throw new Error('保留版本数量已达到上限。');
      const destination = this.directory(id, version);
      if (existsSync(destination)) throw new Error('MCP 安装目录已存在但未登记，请保留并检查该目录。');
      const prepared = await this.prepareProgram(release, signal); stage = prepared.stage;
      mkdirSync(dirname(destination), { recursive: true });
      if (!inside(this.root, realpathSync(dirname(destination))) || !inside(this.root, realpathSync(stage))) throw new Error('MCP 目标目录发生变化。');
      renameSync(stage, destination); stage = '';
      const installed = prepared.installed;
      this.state.installations.push(installed); this.save(); return structuredClone(installed);
    } catch { throw new Error('MCP 安装或校验未完成；原连接与版本保持不变。请核对来源、Node 要求与网络。'); }
    finally {
      this.installing.delete(id);
      this.removeStage(stage);
    }
  }
  select(idInput: string, version: string, workspace: string): McpSelection {
    const id = mcpId.parse(idInput), scope = canonicalMcpWorkspace(workspace);
    if (this.installing.has(id)) throw new Error('此工具正在安装或维护，请等待完成。');
    this.launch(id, version);
    const current = this.state.selections.find(item => item.id === id);
    if (current && current.workspace !== scope) throw new Error('请先停用并移除此连接配置，再绑定其他项目。');
    if (current?.active && current.active !== version) current.pending = version;
    else if (current) { if (!current.enabled) current.epoch = this.state.nextEpoch++; current.enabled = true; current.pending = ''; }
    else this.state.selections.push({ id, active: version, pending: '', enabled: true, workspace: scope, epoch: this.state.nextEpoch++ });
    this.save(); return structuredClone(this.state.selections.find(item => item.id === id)!);
  }
  disable(idInput: string): void { const id = mcpId.parse(idInput), item = this.state.selections.find(item => item.id === id); if (item) { item.enabled = false; item.pending = ''; this.save(); } }
  forget(idInput: string): void { const id = mcpId.parse(idInput); if (this.state.selections.some(item => item.id === id && item.enabled)) throw new Error('请先停用连接。'); this.state.selections = this.state.selections.filter(item => item.id !== id); this.save(); }
  launch(idInput: string, version: string): { directory: string; entry: string; digest: string } {
    const id = mcpId.parse(idInput), installed = this.state.installations.find(item => item.release.id === id && item.release.version === version);
    if (!installed) throw new Error('请先安装并校验此 MCP 版本。');
    const directory = this.directory(id, version), closure = inspectMcpInstallation(directory);
    if (!mcpNodeCompatible(installed.release.node)) throw new Error('当前 Node 不满足此 MCP 的要求。');
    if (closure.digest !== installed.digest) throw new Error('MCP 程序或依赖发生变化，请重新安装并审阅。');
    const entry = join(directory, 'node_modules', MCP_RECIPES[id].package, MCP_RECIPES[id].entry);
    if (!inside(realpathSync(directory), realpathSync(entry))) throw new Error('MCP 程序入口无效。');
    return { directory, entry, digest: installed.digest };
  }
  active(): McpSelection[] { return this.state.selections.filter(item => item.enabled).map(item => ({ ...item })); }
  dataPath(id: McpId, workspace: string): string { const directory = join(this.root, 'data', id, hash(workspace)); mkdirSync(directory, { recursive: true }); return join(directory, 'memory.jsonl'); }
}
