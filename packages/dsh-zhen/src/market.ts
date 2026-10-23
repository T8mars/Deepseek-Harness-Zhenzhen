import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { SkillCandidate, SkillDefinition, SkillProvider } from '@deepseek-ai/dsh-skill';
import { skillPackageSchema } from './market-schema.ts';
import type { MarketItem, SkillPackage, SkillAutoPolicy } from './market-schema.ts';
import {validateMarketBackupState} from './market-backup-state.ts';
import {BackupError} from './backup-archive.ts';
import {backupJsonString} from './backup-data.ts';
import {managedSkillInvocationKey} from './managed-skill-invocation.ts';
import type {ManagedSkillInvocationGate,ManagedSkillInvocationRow} from './managed-skill-invocation.ts';

export function verifySkill(input: unknown): SkillPackage {
  const item = skillPackageSchema.parse(input);
  if (Buffer.byteLength(item.content, 'utf8') > 65536 || item.content.includes('\0')) throw new Error('技能正文超出支持范围。');
  const digest = createHash('sha256').update(item.content).digest('hex');
  if (digest !== item.manifest.digest) throw new Error('技能摘要校验失败，未安装。');
  const prefix = `---\nname: ${item.manifest.id}\ndescription: ${JSON.stringify(item.manifest.description)}\n---\n`;
  if (!item.content.startsWith(prefix)) throw new Error('技能正文与目录信息不一致。');
  return item;
}

export function readBundledCatalog(): SkillPackage[] {
  const bytes = readFileSync(new URL('../catalog/skills.json', import.meta.url));
  if (bytes.length > 2 * 1024 * 1024) throw new Error('技能目录过大。');
  const values: unknown = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(values) || values.length > 100) throw new Error('技能目录格式不支持。');
  const items = values.map(verifySkill);
  if (new Set(items.map(x => x.manifest.id)).size !== items.length || items.some(x => x.manifest.source !== 'bundled')) throw new Error('技能目录存在重复或未知来源。');
  return items;
}

type Selection = { id: string; active: string; pending: string; enabled: number; pending_mode: '' | 'manual' | 'automatic'; pending_revision: string; auto_paused: number; skipped: string };
export interface MarketBackupState {
  schemaVersion:3;
  versions:Array<{key:string;package:SkillPackage}>;
  selections:Selection[];
  preferences:{id:number;enabled:number;scope:string;verified_revision:string;verified_digest:string};
  bundled:SkillPackage[];catalog:SkillPackage[];
}

function compareVersion(left: string, right: string): number {
  const a = left.split('.').map(value => BigInt(value));
  const b = right.split('.').map(value => BigInt(value));
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index]! > b[index]! ? 1 : -1;
  return 0;
}
function versionKey(item: SkillPackage): string { return createHash('sha256').update(JSON.stringify(item)).digest('hex'); }
function automaticTextPackage(item: SkillPackage): boolean {
  // Keep the persisted first-party-text-v1 scope narrower than any future
  // manual package support. Resource/license/permission expansions need a new policy.
  return Object.keys(item).sort().join(',') === 'content,manifest' && item.manifest.source === 'bundled' && item.manifest.id.startsWith('zhen-') && item.manifest.license === 'MIT' && item.manifest.dependencies.length === 0 && item.manifest.permissions.length === 0;
}

/** Own immutable instruction store. Never writes upstream skill or session directories. */
export class SkillMarket {
  private readonly db: DatabaseSync;
  private readonly catalog: Map<string, SkillPackage>;
  private readonly bundled: Map<string, SkillPackage>;
  private listeners = new Set<() => void>();
  private backupStateRestored=false;
  private restoringBackup=false;
  private readonly reviewOnly:boolean;

  constructor(filename: string, catalog: SkillPackage[],options?:{candidateState:MarketBackupState}) {
    const restored=options?validateMarketBackupState(options.candidateState,verifySkill):undefined;this.reviewOnly=!!restored;
    if(restored&&(!existsSync(filename)||catalog.length))throw new BackupError('BACKUP_MARKET_STATE_MISMATCH');
    this.catalog = new Map((restored?.catalog??catalog).map(input => { const item = verifySkill(input); return [item.manifest.id, item]; }));
    if (this.catalog.size !== (restored?.catalog??catalog).length) throw new Error('技能目录存在重复标识。');
    this.bundled = new Map((restored?.bundled??catalog).map(input=>{const item=verifySkill(input);return[item.manifest.id,item];}));
    mkdirSync(dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename,{readOnly:this.reviewOnly});
    try {
    const version = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    if(restored){if(backupJsonString(this.readBackupState())!==backupJsonString(restored))throw new BackupError('BACKUP_MARKET_STATE_MISMATCH');return;}
    if (version.user_version > 3) { this.db.close(); throw new Error('技能数据库版本较新，请升级应用。'); }
    this.db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS versions (digest TEXT PRIMARY KEY, id TEXT NOT NULL, version TEXT NOT NULL, package TEXT NOT NULL, UNIQUE(id,version));
      CREATE TABLE IF NOT EXISTS selections (id TEXT PRIMARY KEY, active TEXT NOT NULL DEFAULT '', pending TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1);
      `);
    if (version.user_version === 1) {
      // Schema 1 keyed versions by body digest. Two releases can legitimately
      // share their body, so schema 2 keys the complete validated package.
      const old = this.db.prepare('SELECT digest,package FROM versions').all() as { digest: string; package: string }[];
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec('CREATE TABLE versions_v2 (digest TEXT PRIMARY KEY, id TEXT NOT NULL, version TEXT NOT NULL, package TEXT NOT NULL, UNIQUE(id,version))');
        for (const row of old) {
          const item = verifySkill(JSON.parse(row.package)), key = versionKey(item);
          this.db.prepare('INSERT INTO versions_v2 VALUES(?,?,?,?)').run(key, item.manifest.id, item.manifest.version, JSON.stringify(item));
          this.db.prepare('UPDATE selections SET active=? WHERE active=?').run(key, row.digest);
          this.db.prepare('UPDATE selections SET pending=? WHERE pending=?').run(key, row.digest);
        }
        this.db.exec('DROP TABLE versions; ALTER TABLE versions_v2 RENAME TO versions; PRAGMA user_version=2; COMMIT');
      } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
    } else if (version.user_version === 0) this.db.exec('PRAGMA user_version=2');
    if (version.user_version < 3) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.exec(`ALTER TABLE selections ADD COLUMN pending_mode TEXT NOT NULL DEFAULT '' CHECK(pending_mode IN ('','manual','automatic'));
          ALTER TABLE selections ADD COLUMN pending_revision TEXT NOT NULL DEFAULT '';
          ALTER TABLE selections ADD COLUMN auto_paused INTEGER NOT NULL DEFAULT 0 CHECK(auto_paused IN (0,1));
          ALTER TABLE selections ADD COLUMN skipped TEXT NOT NULL DEFAULT '';
          UPDATE selections SET pending_mode='manual' WHERE pending<>'';
          CREATE TABLE update_preferences (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), scope TEXT NOT NULL CHECK(scope='first-party-text-v1'), verified_revision TEXT NOT NULL DEFAULT '', verified_digest TEXT NOT NULL DEFAULT '');
          INSERT INTO update_preferences VALUES(1,0,'first-party-text-v1','','');
          PRAGMA user_version=3; COMMIT;`);
      } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
    }
    // Activation only crosses a Host restart. Automatic selections additionally
    // recheck the persisted user policy, enabled state, exact release and scope.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of this.db.prepare("SELECT * FROM selections WHERE pending<>''").all() as Selection[]) {
        const target = this.stored(row.pending), active = row.active ? this.stored(row.active) : undefined;
        const receipt = this.db.prepare('SELECT verified_revision FROM update_preferences WHERE id=1').get() as { verified_revision: string } | undefined;
        const allowed = !!target && target.manifest.id === row.id && (row.pending_mode === 'manual' || row.pending_mode === 'automatic' && this.automaticEnabled() && row.enabled === 1 && !row.auto_paused && row.skipped !== row.pending && /^[a-f0-9]{40}$/.test(row.pending_revision) && receipt?.verified_revision === row.pending_revision && !!active && automaticTextPackage(active) && automaticTextPackage(target) && compareVersion(target.manifest.version, active.manifest.version) > 0);
        if (allowed) this.db.prepare("UPDATE selections SET active=pending, pending='', pending_mode='', pending_revision='', enabled=1 WHERE id=?").run(row.id);
        else this.db.prepare("UPDATE selections SET pending='', pending_mode='', pending_revision='' WHERE id=?").run(row.id);
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
    } catch(error) { try{this.db.close();}catch{}throw error; }
  }
  close(): void { this.listeners.clear(); this.db.close(); }
  private writable():void{if(this.reviewOnly)throw new Error('恢复的技能管理操作仍暂停；调用许可可在“恢复来源审阅”设置。下载和更新需先完成整个恢复应用的启用。');}
  /** A read transaction over every retained version, including records hidden
   * by UI history limits. No startup activation or update staging occurs. */
  backupState(): MarketBackupState {
    this.db.exec('BEGIN');
    try {
      const state=this.readBackupState();this.db.exec('COMMIT');return state;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  private readBackupState():MarketBackupState{
      if(this.db.prepare('PRAGMA user_version').get()?.user_version!==3)throw new BackupError('BACKUP_MARKET_SCHEMA_UNSUPPORTED');
      for(const table of ['versions','selections'])if((this.db.prepare('SELECT COUNT(*) AS count FROM '+table).get() as {count:number}).count>40000)throw new Error('技能备份记录过多。');
      if((this.db.prepare('SELECT COALESCE(SUM(length(CAST(package AS BLOB))),0) AS bytes FROM versions').get() as {bytes:number}).bytes>64*1024**2)throw new Error('技能备份正文过大。');
      const versions=(this.db.prepare('SELECT digest,id,version,package FROM versions ORDER BY rowid').all() as Array<{digest:string;id:string;version:string;package:string}>).map(row=>{
        const item=verifySkill(JSON.parse(row.package));if(versionKey(item)!==row.digest||item.manifest.id!==row.id||item.manifest.version!==row.version)throw new Error('技能版本记录已变化。');return {key:row.digest,package:item};
      });
      const selections=(this.db.prepare('SELECT * FROM selections ORDER BY rowid').all() as Selection[]).map(row=>({...row}));
      const preferences=this.db.prepare('SELECT * FROM update_preferences WHERE id=1').get() as MarketBackupState['preferences']|undefined;
      if(!preferences)throw new Error('技能更新策略不可读取。');
      const state:MarketBackupState={schemaVersion:3,versions,selections,preferences:{...preferences},bundled:[...this.bundled.values()].map(verifySkill),catalog:[...this.catalog.values()].map(verifySkill)};
      return structuredClone(state);
  }
  /** Only a fresh unpublished empty market may import an authenticated backup.
   * Never reconstruct a normal market after import: its startup applies pending
   * updates. No listener/provider/feed is notified or started by this method. */
  async restoreBackupState(input:unknown,signal?:AbortSignal):Promise<void>{
    this.writable();
    signal?.throwIfAborted();if(this.db.prepare('PRAGMA user_version').get()?.user_version!==3)throw new BackupError('BACKUP_MARKET_SCHEMA_UNSUPPORTED');const state=validateMarketBackupState(input,verifySkill);
    const emptyPreferences={id:1,enabled:0,scope:'first-party-text-v1',verified_revision:'',verified_digest:''};
    if(this.backupStateRestored||this.restoringBackup||this.listeners.size||this.bundled.size||this.catalog.size||this.db.prepare('SELECT count(*) AS n FROM versions').get()?.n!==0||this.db.prepare('SELECT count(*) AS n FROM selections').get()?.n!==0||backupJsonString(this.db.prepare('SELECT * FROM update_preferences WHERE id=1').get())!==backupJsonString(emptyPreferences))throw new BackupError('BACKUP_MARKET_TARGET_NOT_EMPTY');
    const version=this.db.prepare('INSERT INTO versions(digest,id,version,package) VALUES(?,?,?,?)'),selection=this.db.prepare('INSERT INTO selections(id,active,pending,enabled,pending_mode,pending_revision,auto_paused,skipped) VALUES(?,?,?,?,?,?,?,?)');
    this.db.exec('BEGIN IMMEDIATE');this.restoringBackup=true;
    try{
      let count=0;for(const row of state.versions){signal?.throwIfAborted();version.run(row.key,row.package.manifest.id,row.package.manifest.version,JSON.stringify(row.package));if(++count%256===0)await new Promise<void>(resolve=>setImmediate(resolve));}
      for(const row of state.selections){signal?.throwIfAborted();selection.run(row.id,row.active,row.pending,row.enabled,row.pending_mode,row.pending_revision,row.auto_paused,row.skipped);if(++count%256===0)await new Promise<void>(resolve=>setImmediate(resolve));}
      const preferences=state.preferences;this.db.prepare('UPDATE update_preferences SET enabled=?,scope=?,verified_revision=?,verified_digest=? WHERE id=1').run(preferences.enabled,preferences.scope,preferences.verified_revision,preferences.verified_digest);
      for(const item of state.bundled)this.bundled.set(item.manifest.id,item);for(const item of state.catalog)this.catalog.set(item.manifest.id,item);
      if(backupJsonString(this.readBackupState())!==backupJsonString(state))throw new BackupError('BACKUP_MARKET_STATE_MISMATCH');
      signal?.throwIfAborted();this.db.exec('COMMIT');this.backupStateRestored=true;
    }catch(error){this.db.exec('ROLLBACK');this.bundled.clear();this.catalog.clear();signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_MARKET_RESTORE_FAILED');}
    finally{this.restoringBackup=false;}
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private changed(): void { for (const listener of this.listeners) listener(); }
  private selected(id: string): Selection | undefined { return this.db.prepare('SELECT * FROM selections WHERE id=?').get(id) as Selection | undefined; }
  private automaticEnabled(): boolean { return (this.db.prepare("SELECT enabled FROM update_preferences WHERE id=1 AND scope='first-party-text-v1'").get() as { enabled: number } | undefined)?.enabled === 1; }
  /** Internal receipt for bytes actually fetched through the fixed source.
   * This is local provenance bookkeeping, not a publisher signature. */
  recordVerifiedFeed(inputs: SkillPackage[], revision: string): void {
    this.writable();
    const items = this.validateRemoteCatalog(inputs);
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('更新来源提交无效。');
    this.db.prepare('UPDATE update_preferences SET verified_revision=?, verified_digest=? WHERE id=1').run(revision, createHash('sha256').update(JSON.stringify(items)).digest('hex'));
  }
  hasVerifiedFeed(inputs: SkillPackage[], revision: string): boolean {
    if (!/^[a-f0-9]{40}$/.test(revision)) return false;
    const receipt = this.db.prepare('SELECT verified_revision,verified_digest FROM update_preferences WHERE id=1').get() as { verified_revision: string; verified_digest: string } | undefined;
    return receipt?.verified_revision === revision && receipt.verified_digest === createHash('sha256').update(JSON.stringify(inputs.map(verifySkill))).digest('hex');
  }
  autoPolicy(): SkillAutoPolicy {
    const count = (this.db.prepare("SELECT COUNT(*) AS count FROM selections WHERE pending<>'' AND pending_mode='automatic'").get() as { count: number }).count;
    return { source: 'https://github.com/T8mars/Deepseek-Harness-Zhenzhen', enabled: this.automaticEnabled(), pendingAutomatic: count };
  }
  setAutoUpdates(enabled: boolean): void {
    this.writable();
    if (typeof enabled !== 'boolean') throw new Error('请选择明确的技能更新策略。');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('UPDATE update_preferences SET enabled=? WHERE id=1').run(enabled ? 1 : 0);
      if (!enabled) this.db.exec("UPDATE selections SET pending='', pending_mode='', pending_revision='' WHERE pending_mode='automatic'");
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  pauseAutoUpdate(id: string, paused: boolean): void {
    this.writable();
    const selected = this.selected(id), item = selected?.active ? this.stored(selected.active) : undefined;
    if (typeof paused !== 'boolean' || !item || item.manifest.source !== 'bundled' || !id.startsWith('zhen-')) throw new Error('只有已安装的发布源技能可以设置自动更新策略。');
    this.db.prepare("UPDATE selections SET auto_paused=?, pending=CASE WHEN ?=1 AND pending_mode='automatic' THEN '' ELSE pending END, pending_revision=CASE WHEN ?=1 AND pending_mode='automatic' THEN '' ELSE pending_revision END, pending_mode=CASE WHEN ?=1 AND pending_mode='automatic' THEN '' ELSE pending_mode END WHERE id=?").run(paused ? 1 : 0, paused ? 1 : 0, paused ? 1 : 0, paused ? 1 : 0, id);
  }
  /** Only the fixed, fully validated text feed can schedule this path. A user's
   * source policy replaces per-release confirmation, never tool authorization. */
  stageAutomaticUpdates(inputs: SkillPackage[], revision: string): number {
    this.writable();
    const items = this.validateRemoteCatalog(inputs);
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('自动更新缺少固定来源提交。');
    if (!this.automaticEnabled() || !this.hasVerifiedFeed(items, revision)) return 0;
    let staged = 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const available = new Set(items.map(item => item.manifest.id));
      for (const selected of this.db.prepare("SELECT id FROM selections WHERE pending_mode='automatic'").all() as { id: string }[]) if (!available.has(selected.id)) this.db.prepare("UPDATE selections SET pending='', pending_mode='', pending_revision='' WHERE id=?").run(selected.id);
      for (const item of items) {
        const selected = this.selected(item.manifest.id), active = selected?.active ? this.stored(selected.active) : undefined;
        const key = versionKey(item);
        if (!selected || selected.enabled !== 1 || selected.auto_paused || selected.skipped === key || !active || !automaticTextPackage(active) || !automaticTextPackage(item) || compareVersion(item.manifest.version, active.manifest.version) <= 0 || selected.pending && selected.pending_mode !== 'automatic') continue;
        if (selected.pending === key) { if (selected.pending_revision !== revision) this.db.prepare('UPDATE selections SET pending_revision=? WHERE id=?').run(revision, item.manifest.id); continue; }
        this.save(item);
        this.db.prepare("UPDATE selections SET pending=?, pending_mode='automatic', pending_revision=? WHERE id=?").run(key, revision, item.manifest.id);
        staged++;
      }
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return staged;
  }
  private stored(digest: string): SkillPackage | undefined {
    const row = this.db.prepare('SELECT package FROM versions WHERE digest=?').get(digest) as { package: string } | undefined;
    if (!row) return undefined;
    const item = verifySkill(JSON.parse(row.package));
    if (versionKey(item) !== digest) throw new Error('技能版本记录与完整包摘要不一致，未加载。');
    return item;
  }
  private save(item: SkillPackage): string {
    verifySkill(item);
    const previous = this.db.prepare('SELECT package FROM versions WHERE id=? AND version=?').get(item.manifest.id, item.manifest.version) as { package: string } | undefined;
    if (previous && JSON.stringify(verifySkill(JSON.parse(previous.package))) !== JSON.stringify(item)) throw new Error('相同版本的内容或清单已变化，必须由来源发布新版本。');
    const key = versionKey(item);
    this.db.prepare('INSERT OR IGNORE INTO versions VALUES(?,?,?,?)').run(key, item.manifest.id, item.manifest.version, JSON.stringify(item));
    return key;
  }
  /** Validate the entire first-party text feed before replacing any candidates.
   * No selection, running body or personal fork is changed by discovery. */
  validateRemoteCatalog(inputs: SkillPackage[]): SkillPackage[] {
    if (inputs.length > 100) throw new Error('远端技能目录过大。');
    const items = inputs.map(verifySkill);
    if (new Set(items.map(item => item.manifest.id)).size !== items.length) throw new Error('远端技能标识重复。');
    for (const item of items) {
      if (!item.manifest.id.startsWith('zhen-') || item.manifest.source !== 'bundled' || item.manifest.category === 'personal') throw new Error('远端技能来源不受支持。');
      const previous = this.catalog.get(item.manifest.id);
      const stored = this.db.prepare('SELECT package FROM versions WHERE id=? AND version=?').get(item.manifest.id, item.manifest.version) as { package: string } | undefined;
      if ((stored && JSON.stringify(verifySkill(JSON.parse(stored.package))) !== JSON.stringify(item)) || (previous?.manifest.version === item.manifest.version && JSON.stringify(previous) !== JSON.stringify(item))) throw new Error('远端相同版本的内容或清单发生变化。');
      const selection = this.selected(item.manifest.id);
      const installed = selection?.active ? this.stored(selection.active) : undefined;
      const pending = selection?.pending ? this.stored(selection.pending) : undefined;
      if ([previous, installed, pending].some(current => current && compareVersion(item.manifest.version, current.manifest.version) < 0)) throw new Error('远端目录版本回退，请保留本机版本。');
    }
    return items;
  }
  offerRemoteCatalog(inputs: SkillPackage[]): void {
    this.writable();
    const items = this.validateRemoteCatalog(inputs);
    const next = new Map(this.bundled);
    for (const item of items) next.set(item.manifest.id, item);
    this.catalog.clear();
    for (const [id, item] of next) this.catalog.set(id, item);
    // Discovery does not invalidate the running SkillProvider: its active bodies did not change.
  }
  list(): MarketItem[] {
    const ids = new Set(this.catalog.keys());
    for (const row of this.db.prepare('SELECT id FROM selections').all() as { id: string }[]) ids.add(row.id);
    return [...ids].map(id => {
      const selected = this.selected(id);
      const active = selected?.active ? this.stored(selected.active) : undefined;
      const pending = selected?.pending ? this.stored(selected.pending) : undefined;
      let latest = this.catalog.get(id) ?? active ?? pending;
      if (active && latest && compareVersion(active.manifest.version, latest.manifest.version) > 0) latest = active;
      if (!latest) return undefined;
      return { manifest: latest.manifest, installedVersion: active?.manifest.version ?? '', installedDigest: active?.manifest.digest ?? '',
        enabled: !!active && selected?.enabled === 1, pendingVersion: pending?.manifest.version ?? '', pendingDigest: pending?.manifest.digest ?? '',
        pendingMode: pending ? selected?.pending_mode ?? '' : '', pendingRevision: pending ? selected?.pending_revision ?? '' : '',
        automaticPaused: selected?.auto_paused === 1, automaticFollowing: !!active && active.manifest.source === 'bundled' && id.startsWith('zhen-') && selected?.enabled === 1 && selected.auto_paused !== 1 && this.automaticEnabled(),
        updateAvailable: !!active && versionKey(active) !== versionKey(latest) };
    }).filter((item): item is MarketItem => !!item).sort((a, b) => a.manifest.title.localeCompare(b.manifest.title, 'zh'));
  }
  preview(id: string, digest: string, version = ''): SkillPackage {
    const current = this.catalog.get(id);
    const matches = new Map<string, SkillPackage>();
    if (current?.manifest.digest === digest) matches.set(current.manifest.version, current);
    const rows = version ? this.db.prepare('SELECT package FROM versions WHERE id=? AND version=?').all(id, version) : this.db.prepare('SELECT package FROM versions WHERE id=?').all(id);
    for (const row of rows as { package: string }[]) {
      const stored = verifySkill(JSON.parse(row.package));
      if (stored.manifest.digest === digest) {
        const offered = matches.get(stored.manifest.version);
        if (offered && JSON.stringify(offered) !== JSON.stringify(stored)) throw new Error('相同版本的内容或清单已变化。');
        matches.set(stored.manifest.version, stored);
      }
    }
    if (!version && matches.size > 1) throw new Error('多个版本使用相同正文，请刷新目录并选择具体版本。');
    const item = version ? matches.get(version) : [...matches.values()][0];
    if (!item || item.manifest.id !== id) throw new Error('此技能版本不可用，请刷新目录。');
    return verifySkill(item);
  }
  select(id: string, digest: string, version = ''): void {
    this.writable();
    const item = this.preview(id, digest, version);
    const key = this.save(item);
    const selected = this.selected(id);
    const latest = this.catalog.get(id);
    const hold = selected?.auto_paused === 1 || !!selected?.active && !!latest && compareVersion(item.manifest.version, latest.manifest.version) < 0;
    if (selected?.active && selected.active !== key) {
      this.db.prepare("UPDATE selections SET pending=?, pending_mode='manual', pending_revision='', auto_paused=?, skipped='' WHERE id=?").run(key, hold ? 1 : 0, id);
    } else {
      this.db.prepare("INSERT INTO selections(id,active,enabled,auto_paused) VALUES(?,?,1,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active, enabled=1, pending='', pending_mode='', pending_revision='', auto_paused=excluded.auto_paused, skipped=''").run(id, key, hold ? 1 : 0);
    }
    this.changed();
  }
  disable(id: string): void {
    this.writable();
    this.db.prepare("UPDATE selections SET enabled=0, pending='', pending_mode='', pending_revision='' WHERE id=?").run(id);
    this.changed();
  }
  cancelPending(id: string): void { this.writable();this.db.prepare("UPDATE selections SET skipped=CASE WHEN pending<>'' THEN pending ELSE skipped END, pending='', pending_mode='', pending_revision='' WHERE id=?").run(id); this.changed(); }
  versions(id: string): SkillPackage[] {
    return (this.db.prepare('SELECT package FROM versions WHERE id=? ORDER BY rowid DESC LIMIT 50').all(id) as { package: string }[]).map(row => verifySkill(JSON.parse(row.package)));
  }
  fork(id: string, digest: string, body: string, version = ''): string {
    this.writable();
    const source = this.preview(id, digest, version);
    const name = `my-${id.slice(0, 40)}-${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const description = source.manifest.description;
    if (!body.trim()) throw new Error('请填写我的版本正文。');
    const content = `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body.trim()}\n`;
    const item = verifySkill({ manifest: { ...source.manifest, id: name, title: `${source.manifest.title.slice(0, 70)} · 我的版本`, version: '1.0.0', source: 'personal', category: 'personal', digest: createHash('sha256').update(content).digest('hex') }, content });
    const key = this.save(item);
    this.db.prepare('INSERT INTO selections(id,active) VALUES(?,?)').run(name, key);
    this.changed();
    return name;
  }
  recoveryInvocationRows():ManagedSkillInvocationRow[]{return (this.db.prepare('SELECT * FROM selections ORDER BY rowid').all() as Selection[]).map(row=>{const item=row.active?this.stored(row.active):undefined;return{kind:'market',id:row.id,key:managedSkillInvocationKey('market',row.id,row.active),name:item?.manifest.title??row.id,version:item?.manifest.version??'',location:null,enabled:row.enabled===1,eligible:row.enabled===1&&!!item};});}
  async verifyRecoveryInvocation(key:string):Promise<void>{const row=this.recoveryInvocationRows().find(row=>row.key===key);if(!row?.eligible)throw new BackupError('BACKUP_MANAGED_SKILL_SOURCE_CHANGED');}
  provider(gate?:ManagedSkillInvocationGate): SkillProvider {
    const summary = (item: SkillPackage) => ({ name: item.manifest.id, description: item.manifest.description,
      provider: 'dsh-zhen-market', source: item.manifest.source === 'personal' ? 'user-dsh' : 'bundled',
      invocation: { modelInvocable: true, userInvocable: true }, metadata: { version: item.manifest.version, digest: item.manifest.digest } });
    return { name: 'dsh-zhen-market',
      list: async options => {
        options.signal?.throwIfAborted();
        if(this.reviewOnly&&!gate)return [];
        return (this.db.prepare("SELECT * FROM selections WHERE enabled=1 AND active<>''").all() as Selection[]).filter(selected=>!this.reviewOnly||!!gate?.token(managedSkillInvocationKey('market',selected.id,selected.active))).map(selected => {
          const item = this.stored(selected.active)!;
          return { ...summary(item), rank: item.manifest.source === 'personal' ? 390 : 600, locator: { id: selected.id, digest: selected.active } } satisfies SkillCandidate;
        });
      },
      get: async (candidate, options): Promise<SkillDefinition | undefined> => {
        options.signal?.throwIfAborted();
        if(this.reviewOnly&&!gate)return undefined;
        const locator = candidate.locator as { id?: string; digest?: string } | undefined;
        if (!locator || locator.id !== candidate.name || typeof locator.digest !== 'string') return undefined;
        const selected = this.selected(candidate.name);
        if (!selected?.enabled || selected.active !== locator.digest) return undefined;
        if(this.reviewOnly&&!gate?.token(managedSkillInvocationKey('market',selected.id,selected.active)))return undefined;
        const item = this.stored(locator.digest);
        if (!item) return undefined;
        return { ...summary(item), content: skillBody(item.content) };
      },
    };
  }
}

export function skillBody(content: string): string { return content.slice(content.indexOf('\n---\n', 4) + 5).trim(); }
