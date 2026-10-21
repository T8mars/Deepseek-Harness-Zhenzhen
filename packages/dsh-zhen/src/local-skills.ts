import { randomUUID, createHash } from 'node:crypto';
import { watchFile, unwatchFile, realpathSync, existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { lstat, opendir, open, realpath } from 'node:fs/promises';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { parseDocument } from 'yaml';
import type { SkillProvider } from '@deepseek-ai/dsh-skill';
import { skillId } from './market-schema.ts';
import { LOCAL_SKILL_POLICY, localSkillMode, localSkillEntrySchema, localSkillStateSchema } from './local-skills-schema.ts';
import type { LocalSkillDraft, LocalSkillEntry, LocalSkillBody, LocalSkillMode, LocalSkillRecord, LocalSkillView } from './local-skills-schema.ts';

const digest = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const inside = (root: string, target: string): boolean => { const value = relative(root, target); return !isAbsolute(value) && value !== '..' && !value.startsWith('../') && !value.startsWith('..\\'); };
const identity = (value: { dev: number | bigint; ino: number | bigint }): string => `${value.dev}:${value.ino}`;
const childName = (value: string): boolean => value.length <= 200 && !value.startsWith('.') && !/[\\/:\0]/.test(value);
type Scan = { draft: LocalSkillDraft; watches: string[] };

/** Local mutable sources, separate from immutable published market releases.
 * Only SKILL.md is read; resources retain their original paths. No install hook,
 * dependency, program or provider action is executed by connection/discovery.
 */
export class LocalSkills {
  private sources: LocalSkillRecord[] = [];
  private serialized = '';
  private readonly listeners = new Set<() => void>();
  private readonly watches = new Map<string, () => void>();
  private closed = false;
  private generation = 0;
  constructor(private readonly file: string, private readonly pollMs = 1000) { this.reload(); }
  private reload(): void {
    const text = existsSync(this.file) ? (() => { if (statSync(this.file).size > 131072) throw new Error('本地技能配置过大。'); return readFileSync(this.file, 'utf8'); })() : '';
    if (text === this.serialized) return;
    const records = text ? localSkillStateSchema.parse(JSON.parse(text)).sources : [];
    if (new Set(records.map(item => item.id)).size !== records.length || new Set(records.map(item => `${item.mode}:${item.root}`)).size !== records.length) throw new Error('本地技能目录配置重复。');
    this.sources = records; this.serialized = text; this.generation++;
  }
  private save(records: LocalSkillRecord[]): void {
    const disk = existsSync(this.file) ? readFileSync(this.file, 'utf8') : '';
    if (disk !== this.serialized) throw new Error('本地技能配置已被其他 Host 修改，请刷新后重试。');
    const text = JSON.stringify(localSkillStateSchema.parse({ schemaVersion: 1, sources: records })) + '\n';
    if (Buffer.byteLength(text) > 131072) throw new Error('本地技能配置过大。');
    mkdirSync(dirname(this.file), { recursive: true }); writeFileSync(this.file + '.tmp', text, { mode: 0o600 }); renameSync(this.file + '.tmp', this.file);
    this.sources = records; this.serialized = text; this.generation++; this.changed();
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private changed(): void { if (!this.closed) for (const listener of this.listeners) listener(); }
  private async root(folder: string): Promise<{ root: string; identity: string }> {
    if (!isAbsolute(folder) || folder.length > 4096) throw new Error('请选择本机的绝对技能目录。');
    const path = realpathSync.native(folder), info = await lstat(path, { bigint: true });
    if (!info.isDirectory()) throw new Error('请选择技能文件夹。');
    return { root: path, identity: identity(info) };
  }
  private async read(root: string, directory: string): Promise<LocalSkillBody> {
    if (directory && !childName(directory)) throw new Error('技能子目录无效。');
    const folder = directory ? join(root, directory) : root;
    if (!inside(root, folder) || (await lstat(folder)).isSymbolicLink() || !inside(root, await realpath(folder))) throw new Error('技能目录包含外部链接。');
    const file = join(folder, 'SKILL.md');
    if ((await lstat(file)).isSymbolicLink() || !inside(root, await realpath(file))) throw new Error('SKILL.md 不得指向目录之外。');
    const handle = await open(file, 'r');
    let bytes: Buffer;
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.size > 131072) throw new Error('技能文件超过 128 KiB。');
      const buffer = Buffer.alloc(131073); let size = 0;
      while (size < buffer.length) { const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null); if (!bytesRead) break; size += bytesRead; }
      const after = await handle.stat(), current = await lstat(file);
      if (size > 131072 || current.isSymbolicLink() || !inside(root, await realpath(file)) || identity(before) !== identity(current) || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('技能读取时发生变化，请重新扫描。');
      bytes = buffer.subarray(0, size);
    } finally { await handle.close(); }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes!);
    if (text.includes('\0')) throw new Error('技能文件不是有效文本。');
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
    if (!match) throw new Error('技能需要 YAML frontmatter。');
    const document = parseDocument(match[1]!, { uniqueKeys: true });
    if (document.errors.length || document.warnings.length) throw new Error('技能 frontmatter 无效。');
    const fields = document.toJS({ maxAliasCount: 100 }) as Record<string, unknown>;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('技能 frontmatter 无效。');
    for (const key of ['disableModelInvocation', 'modelInvocable', 'userInvocable']) if (Object.hasOwn(fields, key)) throw new Error('请使用标准技能调用字段。');
    const boolean = (key: string): boolean | undefined => {
      const value = fields[key]; if (value === undefined) return undefined;
      if (typeof value === 'boolean') return value;
      if (value === 1 || typeof value === 'string' && /^(?:1|true|yes|on)$/i.test(value)) return true;
      if (value === 0 || typeof value === 'string' && /^(?:0|false|no|off)$/i.test(value)) return false;
      throw new Error('技能调用字段需要布尔值。');
    };
    const entry = localSkillEntrySchema.parse({ directory, name: skillId.parse(fields.name), description: fields.description,
      digest: digest(bytes!), bytes: bytes!.length, modelInvocable: boolean('disable-model-invocation') !== true, userInvocable: boolean('user-invocable') !== false });
    if (!match[2]!.trim()) throw new Error('技能正文不能为空。');
    return { entry, content: match[2]!.trim(), resourceRoot: realpathSync.native(folder) };
  }
  private async scan(folder: string, mode: LocalSkillMode, requiredIdentity = ''): Promise<Scan> {
    localSkillMode.parse(mode);
    const root = await this.root(folder);
    if (requiredIdentity && (root.root !== folder || root.identity !== requiredIdentity)) throw new Error('技能库目录已被替换，请重新预览并确认。');
    const entries: LocalSkillEntry[] = [], watches = [root.root]; let skipped = 0, problems = 0, size = 0;
    const read = async (directory: string): Promise<void> => {
      watches.push(join(root.root, directory, 'SKILL.md'));
      try { const body = await this.read(root.root, directory); size += body.entry.bytes; if (size > 8 * 1024 * 1024) throw new Error('SOURCE_BUDGET'); entries.push(body.entry); }
      catch (error) { if (error instanceof Error && error.message === 'SOURCE_BUDGET') throw error; problems++; }
    };
    if (mode === 'skill') await read('');
    else {
      let examined = 0, directories = 0;
      const directory = await opendir(root.root);
      for await (const entry of directory) {
        if (++examined > 512) throw new Error('技能库条目过多，请分成较小的目录。');
        if (!childName(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) { skipped++; continue; }
        if (++directories > 128) throw new Error('每个技能库最多扫描 128 个技能目录。');
        const child = join(root.root, entry.name); watches.push(child); await read(entry.name);
        if (entries.length > 128) throw new Error('每个技能库最多连接 128 项技能。');
      }
    }
    entries.sort((a, b) => a.directory.localeCompare(b.directory, 'en'));
    const counts = new Set<string>();
    for (const item of entries) { if (counts.has(item.name)) problems++; counts.add(item.name); }
    const after = await this.root(folder);
    if (after.root !== root.root || after.identity !== root.identity) throw new Error('扫描时技能目录发生变化，请重试。');
    const draft = { ...root, mode, entries, skipped, problems, digest: digest(JSON.stringify([root.root, root.identity, mode, entries])) };
    return { draft, watches };
  }
  async preview(folder: string, mode: LocalSkillMode): Promise<LocalSkillDraft> { return (await this.scan(folder, mode)).draft; }
  async body(folder: string, directory: string, expectedDigest: string): Promise<LocalSkillBody> {
    const root = await this.root(folder), value = await this.read(root.root, directory);
    if (value.entry.digest !== expectedDigest) throw new Error('技能正文已变化，请重新扫描。');
    return value;
  }
  async connect(folder: string, mode: LocalSkillMode, expectedDigest: string, policy: string): Promise<void> {
    this.reload(); const generation = this.generation;
    if (policy !== LOCAL_SKILL_POLICY) throw new Error('请先确认信任本机目录及后续修改。');
    const draft = await this.preview(folder, mode);
    if (!draft.entries.length || draft.digest !== expectedDigest || generation !== this.generation) throw new Error('技能清单已变化或没有可连接项，请重新扫描。');
    const previous = this.sources.find(item => item.root === draft.root && item.mode === mode);
    const source: LocalSkillRecord = { id: previous?.id ?? randomUUID(), root: draft.root, mode, identity: draft.identity, enabled: true, confirmedAt: new Date().toISOString(), policy: LOCAL_SKILL_POLICY };
    this.save(previous ? this.sources.map(item => item.id === previous.id ? source : item) : [...this.sources, source]);
  }
  disable(id: string): void { this.reload(); this.save(this.sources.map(item => item.id === id ? { ...item, enabled: false } : item)); this.syncWatches(new Set()); }
  disconnect(id: string): void { this.reload(); this.save(this.sources.filter(item => item.id !== id)); this.syncWatches(new Set()); }
  private syncWatches(paths: Set<string>): void {
    if (this.closed) return;
    for (const [path, callback] of this.watches) if (!paths.has(path)) { unwatchFile(path, callback); this.watches.delete(path); }
    for (const path of paths) if (!this.watches.has(path)) { const callback = (): void => { this.changed(); }; this.watches.set(path, callback); watchFile(path, { interval: this.pollMs, persistent: false }, callback); }
  }
  private async collect(): Promise<LocalSkillView[] | undefined> {
    this.reload(); const generation = this.generation, views: LocalSkillView[] = [], watches = new Set<string>([this.file]), seen = new Set<string>();
    for (const source of this.sources) {
      if (!source.enabled) { views.push({ source, state: 'disabled', entries: [], problems: 0, skipped: 0 }); continue; }
      try {
        const scan = await this.scan(source.root, source.mode, source.identity);
        for (const path of scan.watches) watches.add(path);
        const entries = scan.draft.entries.map(entry => { const shadowed = seen.has(entry.name); seen.add(entry.name); return { ...entry, shadowed }; });
        views.push({ source, state: 'ready', entries, problems: scan.draft.problems, skipped: scan.draft.skipped });
      } catch { watches.add(source.root); views.push({ source, state: 'unavailable', entries: [], problems: 1, skipped: 0 }); }
    }
    this.reload();
    if (generation !== this.generation || this.closed) return undefined;
    this.syncWatches(watches); return views;
  }
  async list(): Promise<LocalSkillView[]> { const views = await this.collect(); if (!views) throw new Error('目录状态已变化，请刷新。'); return views; }
  /** Host backup inventory includes disabled and unavailable roots, without a
   * provider winner filter, resource scan, watcher change or activation. */
  backupState(): {schemaVersion:1;sources:LocalSkillRecord[]} {
    if(this.closed)throw new Error('技能来源服务已关闭。');this.reload();
    return {schemaVersion:1,sources:structuredClone(this.sources)};
  }
  provider(): SkillProvider {
    return { name: 'dsh-zhen-local-skills',
      list: async options => {
        options.signal?.throwIfAborted(); const views = await this.collect(); options.signal?.throwIfAborted();
        if (!views) return { candidates: [], complete: false };
        return views.flatMap(view => view.entries.filter(entry => !entry.shadowed).map(entry => ({ name: entry.name, description: entry.description, provider: 'dsh-zhen-local-skills', source: 'custom', rank: 350,
          path: join(view.source.root, entry.directory, 'SKILL.md'), resourceBase: { kind: 'directory' as const, path: join(view.source.root, entry.directory) },
          invocation: { modelInvocable: entry.modelInvocable, userInvocable: entry.userInvocable }, locator: { sourceId: view.source.id, directory: entry.directory, digest: entry.digest } })));
      },
      get: async (candidate, options) => {
        options.signal?.throwIfAborted(); this.reload(); const generation = this.generation;
        const locator = candidate.locator as { sourceId?: string; directory?: string; digest?: string };
        const source = this.sources.find(item => item.id === locator?.sourceId && item.enabled);
        if (!source || typeof locator.directory !== 'string' || typeof locator.digest !== 'string') return undefined;
        try {
          const root = await this.root(source.root); if (root.root !== source.root || root.identity !== source.identity) return undefined;
          const body = await this.body(root.root, locator.directory, locator.digest); options.signal?.throwIfAborted();
          const after = await this.root(source.root);
          this.reload();
          if (body.entry.name !== candidate.name || this.closed || this.generation !== generation || after.root !== source.root || after.identity !== source.identity) return undefined;
          return { name: body.entry.name, description: body.entry.description, provider: 'dsh-zhen-local-skills', source: 'custom',
            invocation: { modelInvocable: body.entry.modelInvocable, userInvocable: body.entry.userInvocable }, path: join(body.resourceRoot, 'SKILL.md'), resourceBase: { kind: 'directory', path: body.resourceRoot }, content: body.content };
        } catch { options.signal?.throwIfAborted(); return undefined; }
      },
    };
  }
  close(): void { if (this.closed) return; for (const [path, callback] of this.watches) unwatchFile(path, callback); this.watches.clear(); this.listeners.clear(); this.closed = true; this.generation++; }
}
