import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { skillPackageSchema, skillFeedSnapshotSchema } from './market-schema.ts';
import type { SkillPackage, SkillFeedSnapshot } from './market-schema.ts';
import type { SkillMarket } from './market.ts';
import { readPublic } from './updates.ts';
import type { GithubAccess, GithubReadSession } from './github-access.ts';
import { githubReadMessage } from './github-access.ts';
import type {ManagedSkillRuntimePolicy} from './managed-skill-runtime-policy.ts';

const SOURCE = 'https://github.com/T8mars/Deepseek-Harness-Zhenzhen' as const;
const MAX_BYTES = 2 * 1024 * 1024;
export const skillFeedSchema = z.object({
  schemaVersion: z.literal(1), publisher: z.literal('T8mars/Deepseek-Harness-Zhenzhen'),
  skills: z.array(skillPackageSchema).max(100),
}).strict();
const cacheSchema = z.object({ status: skillFeedSnapshotSchema, catalog: z.array(skillPackageSchema).max(100) }).strict();

/** Fixed first-party instruction source. No arbitrary URLs,
 * program resources or dependency installation. Optional user-scoped scheduling
 * still waits for the next Host startup; this class never changes active bodies. */
export class SkillFeed {
  private status: SkillFeedSnapshot = { source: SOURCE, automatic: true, checkedAt: '', revision: '', state: 'idle', count: 0, message: '内置技能可离线使用；远端目录尚未检查。' };
  private catalog: SkillPackage[] = [];
  private pending?: Promise<SkillFeedSnapshot>;
  private runtimeCache?:string;
  constructor(private readonly filename: string, private readonly market: SkillMarket, private readonly fetcher: typeof fetch = fetch, private readonly github?: GithubAccess,private readonly options?:{candidateState:ReturnType<SkillFeed['backupState']>;reviewOnly?:boolean;runtime?:never}|{runtime:ManagedSkillRuntimePolicy;reviewOnly?:never;candidateState?:never}) {
    if(options?.candidateState){const live=cacheSchema.parse({status:options.candidateState.status,catalog:options.candidateState.catalog});if(live.status.count!==live.catalog.length)throw Error('Invalid restored feed.');this.status=structuredClone(live.status);this.catalog=structuredClone(live.catalog);return;}
    if (!existsSync(filename)) return;
    try {
      if (statSync(filename).size > MAX_BYTES) throw new Error();
      const text=readFileSync(filename,'utf8');if(this.options?.runtime)this.runtimeCache=text;
      const cache = cacheSchema.parse(JSON.parse(text));
      if ((cache.catalog.length && !cache.status.revision) || cache.status.count !== cache.catalog.length) throw new Error();
      if (cache.status.revision && !this.market.hasVerifiedFeed(cache.catalog, cache.status.revision)) {
        // A self-declared commit/body hash in a cache is not fetch evidence.
        // Legacy/unmatched candidates must be read from the fixed source once;
        // do not let them poison the trusted catalog's anti-rollback baseline.
        this.status = { ...cache.status, revision: '', checkedAt: '', count: 0, state: 'error', message: '此缓存需要重新检查来源；内置技能、已安装版本和个人副本继续保留。' };
        return;
      }
      if(this.options?.runtime){if(cache.status.revision)this.market.loadVerifiedRuntimeCatalog(cache.catalog,cache.status.revision);}else this.market.offerRemoteCatalog(cache.catalog);
      this.catalog = cache.catalog; this.status = cache.status;
    } catch {
      this.status = { ...this.status, automatic: false, state: 'error', message: '远端目录缓存无法校验，继续使用内置技能。可手动重新检查。' };
    }
    try { if (this.status.revision&&(!this.options?.runtime||this.options.runtime.automatic('market-updates'))) this.market.stageAutomaticUpdates(this.catalog, this.status.revision); }
    catch { this.status = { ...this.status, state: 'error', message: '目录已校验，但自动安排未完成，当前技能保留。可重新检查或手动选择。' }; }
  }
  /** Other profiles share data, but never check/activation receipts. Refresh
   * verified candidates in memory only; do not stage updates on a file change. */
  private refreshRuntime():void{
    if(!this.options?.runtime)return;
    try{
      if(!existsSync(this.filename)||statSync(this.filename).size>MAX_BYTES)throw Error();const text=readFileSync(this.filename,'utf8');if(text===this.runtimeCache&&this.status.state!=='error')return;this.runtimeCache=text;
      const cache=cacheSchema.parse(JSON.parse(text));if((cache.catalog.length&&!cache.status.revision)||cache.status.count!==cache.catalog.length||cache.status.revision&&!this.market.hasVerifiedFeed(cache.catalog,cache.status.revision))throw Error();
      if(cache.status.revision)this.market.loadVerifiedRuntimeCatalog(cache.catalog,cache.status.revision);this.catalog=cache.catalog;this.status=cache.status;
    }catch{this.status={...this.status,state:'error',message:'技能目录已变化或暂时无法校验，当前技能保留。请重新检查来源。'};}
  }
  snapshot(): SkillFeedSnapshot { this.refreshRuntime();return { ...this.status,...this.options?.runtime?{automatic:this.status.automatic&&this.options.runtime.automatic('market-checks')}:{}}; }
  private writable():void{if(this.options?.reviewOnly)throw new Error('恢复的技能管理操作仍暂停；调用许可可在“恢复来源审阅”设置。下载和更新请在“恢复后的技能管理”启用独立副本。');this.options?.runtime?.assertWritable();}
  /** Capture the running Host's exact offline candidates; never fetch or stage. */
  backupState(): {status:SkillFeedSnapshot;catalog:SkillPackage[];persisted:{present:boolean;cache?:{status:SkillFeedSnapshot;catalog:SkillPackage[]}}} {
    if(this.pending)throw new Error('技能目录检查进行中，请稍后备份。');
    this.refreshRuntime();
    const present=existsSync(this.filename);let cache;
    if(present){if(statSync(this.filename).size>MAX_BYTES)throw new Error('技能目录备份过大。');cache=cacheSchema.parse(JSON.parse(readFileSync(this.filename,'utf8')));}
    return structuredClone({status:this.status,catalog:this.catalog,persisted:{present,...cache?{cache}:{}}});
  }
  private save(status: SkillFeedSnapshot, catalog = this.catalog): void {
    this.writable();
    if(this.options?.runtime&&(existsSync(this.filename)?readFileSync(this.filename,'utf8'):undefined)!==this.runtimeCache)throw new Error('技能目录已被其他配置修改，请刷新后重试。');
    const content = JSON.stringify({ status, catalog }) + '\n';
    if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('Skill cache limit.');
    mkdirSync(dirname(this.filename), { recursive: true });
    writeFileSync(this.filename + '.tmp', content, { mode: 0o600 });
    renameSync(this.filename + '.tmp', this.filename);
    if(this.options?.runtime)this.runtimeCache=content;
    this.status = status; this.catalog = catalog;
  }
  setAutomatic(enabled: boolean): void {this.writable();this.refreshRuntime();if(typeof enabled!=='boolean')throw Error('请选择明确的目录检查策略。'); this.save({ ...this.status, automatic: enabled });this.options?.runtime?.setAutomatic('market-checks',enabled); }
  setAutoUpdates(enabled: boolean): void {
    this.writable();
    this.refreshRuntime();
    this.market.setAutoUpdates(enabled);
    if (enabled && this.status.revision) this.market.stageAutomaticUpdates(this.catalog, this.status.revision);
  }
  pauseAutoUpdate(id: string, paused: boolean): void {
    this.writable();
    this.refreshRuntime();
    this.market.pauseAutoUpdate(id, paused);
    if (!paused && this.status.revision) this.market.stageAutomaticUpdates(this.catalog, this.status.revision);
  }
  async check(signal?: AbortSignal): Promise<SkillFeedSnapshot> {
    this.writable();
    if (this.pending) return this.pending;
    const promise = (async () => {
      let source: GithubReadSession | undefined;
      try {
        source = await this.github?.begin(signal);
        const commit = JSON.parse(source ? await source.commit() : await readPublic('https://api.github.com/repos/T8mars/Deepseek-Harness-Zhenzhen/commits/main', this.fetcher, signal, 256 * 1024));
        if (typeof commit.sha !== 'string' || !/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error();
        const remote = skillFeedSchema.parse(JSON.parse(source ? await source.feed(commit.sha, MAX_BYTES - 4096) : await readPublic(`https://raw.githubusercontent.com/T8mars/Deepseek-Harness-Zhenzhen/${commit.sha}/market/skills.v1.json`, this.fetcher, signal, MAX_BYTES - 4096)));
        await source?.assertCurrent();
        signal?.throwIfAborted();
        this.refreshRuntime();
        const catalog = this.market.validateRemoteCatalog(remote.skills);
        const status = { ...this.status, checkedAt: new Date().toISOString(), revision: commit.sha, state: 'checked' as const, count: catalog.length, message: '已下载并校验候选正文，可按已选更新策略安排下次启动启用；当前加载的正文保持不变。' };
        this.save(status, catalog);
        this.market.recordVerifiedFeed(catalog, commit.sha);
        this.market.offerRemoteCatalog(catalog);
        this.market.stageAutomaticUpdates(catalog, commit.sha);
      } catch (error) {
        if (!signal?.aborted) this.save({ ...this.status, checkedAt: new Date().toISOString(), state: 'error', message: this.github ? githubReadMessage(error) : '远端目录暂不可用或校验未通过，保留已下载目录和当前技能。' });
      } finally { source?.close(); }
      return this.snapshot();
    })();
    this.pending = promise;
    try { return await promise; } finally { if (this.pending === promise) this.pending = undefined; }
  }
  async automaticCheck(signal?: AbortSignal): Promise<void> {
    if(this.options?.reviewOnly)return;
    if (this.snapshot().automatic && (!this.status.checkedAt || Date.now() - Date.parse(this.status.checkedAt) > 24 * 3600 * 1000)) await this.check(signal);
  }
}
