import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { realpath, lstat, open, opendir } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, extname, join } from 'node:path';
import {HarnessError} from '@deepseek-ai/dsh-llm';
import { extractPdfPages } from './pdf-text.ts';
import {extractDocxText} from './docx-text.ts';
import {documentFailure, documentFailureCodes} from './document-error.ts';
import type {DocumentFailureCode} from './document-error.ts';
import type {KnowledgeImportReport, KnowledgeImportIssue} from './knowledge-import-schema.ts';

export interface KnowledgeCollection { id: string; project: string; name: string; root: string; epoch: number; enabled: boolean; cloudProvider: string; agentEnabled: boolean; documents: number; }
export interface KnowledgeHit { id: string; collectionId: string; collectionName: string; path: string; line: number; text: string; epoch: number; page?: number; }
export interface KnowledgeSource { anchorId: string; sections: KnowledgeHit[]; firstSection: number; totalSections: number; earlierId: string | null; laterId: string | null; }
export interface ImportResult { indexed: number; skipped: number; failed: number; }
export interface KnowledgeBinding { project: string; root: string; epoch: number; }
export interface KnowledgeRetrievalScope { readonly project:string;readonly root:string;readonly bindingEpoch:number;readonly collections:readonly {readonly id:string;readonly epoch:number}[]; }
export interface KnowledgeSelection { readonly id:string;readonly epoch:number; }
export interface KnowledgeIndexPage{items:KnowledgeHit[];next:string|null;}
interface CollectionRow { id: string; project: string; name: string; root: string; epoch: number; enabled: number; cloud_provider: string; agent_enabled: number; }
const allowedExtensions = new Set(['.md', '.txt', '.csv', '.json', '.pdf', '.docx']);
const excludedDirectories = new Set(['node_modules', 'vendor', 'dist', 'lib', 'coverage']);
const maxFileBytes = 2 * 1024 * 1024;

/** NFKC text + Chinese character/bigram and Latin word terms, encoded for an FTS grammar-safe query. */
export function lexicalTerms(text: string): string[] {
  const terms = new Set<string>();
  for (const token of text.normalize('NFKC').toLowerCase().replace(/([\p{Script=Han}]+)/gu, ' $1 ').match(/[\p{Script=Han}]+|[\p{L}\p{N}_]+/gu) ?? []) {
    if (/\p{Script=Han}/u.test(token)) {
      const chars = [...token];
      for (let i = 0; i < chars.length; i++) { terms.add(chars[i]!); if (i + 1 < chars.length) terms.add(chars[i]! + chars[i + 1]!); }
    } else terms.add(token);
  }
  return [...terms].map(term => 't' + Buffer.from(term).toString('hex'));
}

function queryTerms(text: string): string[] {
  const terms: string[] = [];
  for (const token of text.normalize('NFKC').toLowerCase().replace(/([\p{Script=Han}]+)/gu, ' $1 ').match(/[\p{Script=Han}]+|[\p{L}\p{N}_]+/gu) ?? []) {
    if (/\p{Script=Han}/u.test(token) && [...token].length > 1) { const chars = [...token]; for (let i = 0; i < chars.length - 1; i++) terms.push(chars[i]! + chars[i + 1]!); }
    else terms.push(token);
  }
  return [...new Set(terms)].slice(0, 80).map(term => 't' + Buffer.from(term).toString('hex'));
}

const questionWords = new Set(['如何','怎么','怎样','什么','为什么','请问','能否','是否','有没有','能不能','应该','可以','能够','才能','请','问','帮','帮助','一下','一些','吗','呢','吧','啊','的','地','得','了','着','是','有','要','会','和','与','或','及','以及','我','你','他','她','它','我们','这个','那个','这些','那些','这','那','一','一个','个','场','篇','段','种','类','些','里','中','上','下','用','在','把','让','给','从','对','到','为']);
const questionSegmenter = typeof Intl.Segmenter === 'function' && Intl.Segmenter.supportedLocalesOf(['zh-Hans']).length ? new Intl.Segmenter('zh-Hans', { granularity: 'word' }) : undefined;
function questionSegments(query: string, compoundExists: (word: string) => boolean): { segment: string; index: number; isWordLike?: boolean }[] {
  if (!questionSegmenter) return [];
  const source = [...questionSegmenter.segment(query)], runs: { segment: string; index: number; isWordLike?: boolean }[] = [];
  const single = (part: typeof runs[number]): boolean => !!part.isWordLike && /^\p{Script=Han}$/u.test(part.segment) && !questionWords.has(part.segment);
  // ICU may split a compound into individual Han characters. Form contiguous
  // runs first, so a later two-character word is not attached to an earlier one.
  // Punctuation, whitespace and stop words remain explicit boundaries.
  for (let i = 0; i < source.length; i++) {
    const part = { segment: source[i]!.segment, index: source[i]!.index, isWordLike: source[i]!.isWordLike };
    if (single(part)) while (i + 1 < source.length && [...part.segment].length < 4 && single(source[i + 1]!) && part.index + part.segment.length === source[i + 1]!.index && compoundExists(part.segment + source[i + 1]!.segment)) part.segment += source[++i]!.segment;
    runs.push(part);
  }
  const parts: typeof runs = [];
  for (const part of runs) {
    const previous = parts.at(-1), length = previous ? [...previous.segment].length : 0;
    // Attach only an isolated suffix; never glue a single-character prefix to
    // the following word. No domain dictionary or document/path preference.
    if (single(part) && previous?.isWordLike && length >= 2 && length < 4 && /^[\p{Script=Han}]+$/u.test(previous.segment) && !questionWords.has(previous.segment) && previous.index + previous.segment.length === part.index && compoundExists(previous.segment + part.segment)) previous.segment += part.segment;
    else parts.push(part);
  }
  return parts;
}
/** Only recognized Chinese questions get a lexical fallback; keyword AND stays exact. */
function questionGroups(query: string, compoundExists: (word: string) => boolean): { groups: string[][]; adjacent: string[] } {
  const empty = { groups: [], adjacent: [] };
  if (!questionSegmenter || !/\p{Script=Han}/u.test(query) || !/(?:如何|怎么|怎样|什么|为什么|请问|能否|是否|应该|[？?])/u.test(query)) return empty;
  const groups: string[][] = [], seen = new Set<string>(), adjacent = new Set<string>();
  let previous = '';
  for (const part of questionSegments(query.normalize('NFKC').toLowerCase(), compoundExists)) {
    if (!part.isWordLike || questionWords.has(part.segment)) { previous = ''; continue; }
    if (previous) {
      const boundary = [...previous].at(-1)! + [...part.segment][0]!;
      if (/^[\p{Script=Han}]{2}$/u.test(boundary)) for (const term of queryTerms(boundary)) adjacent.add(term);
    }
    previous = part.segment;
    const terms = queryTerms(part.segment), key = terms.join(' ');
    if (terms.length && !seen.has(key)) { groups.push(terms); seen.add(key); }
  }
  return groups.length <= 24 && groups.flat().length <= 80 ? { groups, adjacent: [...adjacent] } : empty;
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../'));
}

/** Own local index only. Collection authorization is evaluated on every search and citation read. */
export class KnowledgeStore {
  private readonly db: DatabaseSync;
  private readonly importReports = new Map<string, KnowledgeImportReport>();
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    if (version > 3) { this.db.close(); throw new Error('知识库由更新版本创建，请升级应用后再打开。'); }
    this.db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
    try {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, project TEXT NOT NULL, name TEXT NOT NULL, root TEXT NOT NULL, epoch INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, cloud_provider TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE, path TEXT NOT NULL, digest TEXT NOT NULL, UNIQUE(collection_id,path));
      CREATE TABLE IF NOT EXISTS chunks(id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, line INTEGER NOT NULL, text TEXT NOT NULL, page INTEGER NOT NULL DEFAULT 0);
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(chunk_id UNINDEXED, terms);
      CREATE TABLE IF NOT EXISTS workspace_bindings(project TEXT PRIMARY KEY, root TEXT NOT NULL UNIQUE, epoch INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS binding_revisions(id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE IF NOT EXISTS session_grants(session_id TEXT NOT NULL, project TEXT NOT NULL, collection_id TEXT NOT NULL, epoch INTEGER NOT NULL, binding_epoch INTEGER NOT NULL, root TEXT NOT NULL, PRIMARY KEY(session_id,collection_id,epoch,binding_epoch));
      `);
    if (!(this.db.prepare('PRAGMA table_info(collections)').all() as { name: string }[]).some(column => column.name === 'agent_enabled')) this.db.exec('ALTER TABLE collections ADD COLUMN agent_enabled INTEGER NOT NULL DEFAULT 0');
    if (!(this.db.prepare('PRAGMA table_info(chunks)').all() as { name: string }[]).some(column => column.name === 'page')) this.db.exec('ALTER TABLE chunks ADD COLUMN page INTEGER NOT NULL DEFAULT 0');
    this.db.exec('PRAGMA user_version=3; COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
  }
  close(): void { this.importReports.clear(); this.db.close(); }
  /** Local owner diagnostics only; never return stale paths after an epoch change. */
  importReport(project: string, id: string): KnowledgeImportReport | null {
    const collection = this.collection(project, id, true), report = this.importReports.get(id);
    if (!collection.enabled || report?.epoch !== collection.epoch) { this.importReports.delete(id); return null; }
    return report ? structuredClone(report) : null;
  }
  binding(project: string): KnowledgeBinding | null {
    const row = this.db.prepare('SELECT * FROM workspace_bindings WHERE project=?').get(project);
    return row ? { project: String(row.project), root: String(row.root), epoch: Number(row.epoch) } : null;
  }
  async bind(project: string, directory: string): Promise<KnowledgeBinding | null> {
    if (!project.trim() || project.length > 200) throw new Error('请填写有效资料空间。');
    if (!directory.trim()) { this.db.prepare('DELETE FROM workspace_bindings WHERE project=?').run(project); return null; }
    if (!isAbsolute(directory)) throw new Error('工作目录必须是绝对路径。');
    const physical = await realpath(directory);
    if (!(await lstat(physical)).isDirectory()) throw new Error('请选择会话使用的工作目录。');
    const root = process.platform === 'win32' ? physical.toLowerCase() : physical;
    // An explicit replacement must not make old references valid again.
    const previous = this.binding(project);
    if (previous?.root === root) return previous;
    const other = this.db.prepare('SELECT project FROM workspace_bindings WHERE root=? AND project<>?').get(root, project);
    if (other) throw new Error('该工作目录已绑定其他资料空间，请先解除旧绑定。');
    const nextEpoch = Number(this.db.prepare('INSERT INTO binding_revisions DEFAULT VALUES').run().lastInsertRowid);
    this.db.prepare('INSERT INTO workspace_bindings(project,root,epoch) VALUES(?,?,?) ON CONFLICT(project) DO UPDATE SET root=excluded.root,epoch=excluded.epoch').run(project, root, nextEpoch);
    return this.binding(project);
  }
  hasSessionGrants(sessionId: string): boolean { return !!this.db.prepare('SELECT 1 FROM session_grants WHERE session_id=? LIMIT 1').get(sessionId); }
  /** Check every historical agent-retrieval grant before another provider request. */
  async assertSessionAllowed(sessionId: string, provider: string, directory: string): Promise<void> {
    const rows = this.db.prepare(`SELECT g.*,c.enabled,c.cloud_provider,c.agent_enabled,c.epoch AS current_epoch,b.epoch AS current_binding,b.root AS current_root FROM session_grants g
      LEFT JOIN collections c ON c.id=g.collection_id AND c.project=g.project LEFT JOIN workspace_bindings b ON b.project=g.project WHERE session_id=?`).all(sessionId);
    if (!rows.length) return;
    const physical = await realpath(directory);
    const root = process.platform === 'win32' ? physical.toLowerCase() : physical;
    if (provider !== 'seedance' || rows.some(row => row.enabled !== 1 || row.agent_enabled !== 1 || row.cloud_provider !== provider || row.current_epoch !== row.epoch || row.current_binding !== row.binding_epoch || row.current_root !== row.root || row.root !== root)) throw new Error('此会话引用的资料授权或工作目录已变化。请新建会话，或恢复原有权限后再继续。');
  }
  private async retrievalScope(sessionId:string,provider:string,directory:string):Promise<KnowledgeRetrievalScope|null>{
    if (!sessionId || provider !== 'seedance') throw new Error('当前知识库只允许向已授权的 Seedance 会话提供片段。');
    const physical = await realpath(directory);
    const root = process.platform === 'win32' ? physical.toLowerCase() : physical;
    await this.assertSessionAllowed(sessionId, provider, root);
    return this.scopeAt(root,provider);
  }
  private scopeAt(root:string,provider:string):KnowledgeRetrievalScope|null{
    const binding=this.db.prepare('SELECT * FROM workspace_bindings WHERE root=?').get(root);if(!binding)return null;
    const collections=this.db.prepare('SELECT id,epoch FROM collections WHERE project=? AND enabled=1 AND agent_enabled=1 AND cloud_provider=? ORDER BY id').all(binding.project,provider).map(row=>Object.freeze({id:String(row.id),epoch:Number(row.epoch)}));
    return Object.freeze({project:String(binding.project),root,bindingEpoch:Number(binding.epoch),collections:Object.freeze(collections)});
  }
  /** Query-scoped pages for trusted local index builders; scanning does not grant model access. */
  async retrievalPage(sessionId:string,provider:string,directory:string,scope:KnowledgeRetrievalScope,after:string|null):Promise<KnowledgeIndexPage>{
    if(after!==null&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(after))throw new HarnessError('检索后端返回了无效或未获授权的资料编号，本次结果未采用。','RAG_INVALID_RESULT');
    const changed=()=>new HarnessError('资料授权或工作目录已变化，请重新检索。','RAG_ACCESS_CHANGED');
    const current=await this.retrievalScope(sessionId,provider,directory);if(JSON.stringify(current)!==JSON.stringify(scope))throw changed();
    this.db.exec('BEGIN');
    try{
      if(JSON.stringify(this.scopeAt(scope.root,provider))!==JSON.stringify(scope))throw changed();
      const rows=this.db.prepare(`SELECT ch.id,c.id AS collection_id,c.name,d.path,ch.line,ch.page,ch.text,c.epoch FROM chunks ch JOIN documents d ON ch.document_id=d.id JOIN collections c ON d.collection_id=c.id
        WHERE c.project=? AND c.enabled=1 AND c.agent_enabled=1 AND c.cloud_provider=? AND (? IS NULL OR ch.id>?) ORDER BY ch.id LIMIT 33`).all(scope.project,provider,after,after);
      const allowed=new Map(scope.collections.map(item=>[item.id,item.epoch]));
      const items=rows.slice(0,32).map(row=>{if(allowed.get(String(row.collection_id))!==Number(row.epoch))throw changed();return{id:String(row.id),collectionId:String(row.collection_id),collectionName:String(row.name),path:String(row.path),line:Number(row.line),...(Number(row.page)>0?{page:Number(row.page)}:{}),text:String(row.text),epoch:Number(row.epoch)};});
      this.db.exec('COMMIT');return{items,next:rows.length>32?items.at(-1)!.id:null};
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  /** A backend selects identifiers only. Canonical content and grants stay in this authority. */
  async retrieveForAgent(sessionId: string, provider: string, directory: string, query: string,select?:(scope:KnowledgeRetrievalScope)=>Promise<readonly KnowledgeSelection[]>): Promise<KnowledgeHit[]> {
    const scope=await this.retrievalScope(sessionId,provider,directory);if(!scope||!scope.collections.length)return [];
    const selected=select?await select(scope):this.search(scope.project,query,provider).map(hit=>({id:hit.id,epoch:hit.epoch}));
    const current=await this.retrievalScope(sessionId,provider,directory);
    if(JSON.stringify(current)!==JSON.stringify(scope))throw Error('资料授权或会话绑定已变化，请重新检索。');
    const invalid=()=>new HarnessError('检索后端返回了无效或未获授权的资料编号，本次结果未采用。','RAG_INVALID_RESULT');
    if(!Array.isArray(selected)||selected.length>12)throw invalid();
    this.db.exec('BEGIN IMMEDIATE');
    try{
    if(JSON.stringify(this.scopeAt(scope.root,provider))!==JSON.stringify(scope))throw Error('资料授权或会话绑定已变化，请重新检索。');
    const allowed=new Map(scope.collections.map(item=>[item.id,item.epoch])),seen=new Set<string>();
    const hits=selected.map(item=>{
      if(!item||typeof item.id!=='string'||!Number.isSafeInteger(item.epoch)||item.epoch<1||seen.has(item.id))throw invalid();seen.add(item.id);
      let hit:KnowledgeHit;try{hit=this.citation(scope.project,item.id,item.epoch,provider);}catch{throw invalid();}
      if(allowed.get(hit.collectionId)!==hit.epoch)throw invalid();return hit;
    });
    // Nothing is granted until every selected identifier passed the same current snapshot.
    for(const hit of hits)this.db.prepare('INSERT OR IGNORE INTO session_grants VALUES(?,?,?,?,?,?)').run(sessionId,scope.project,hit.collectionId,hit.epoch,scope.bindingEpoch,scope.root);
    this.db.exec('COMMIT');return hits;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  private collection(project: string, id: string, allowDisabled = false): CollectionRow {
    const row = this.db.prepare('SELECT * FROM collections WHERE id=? AND project=?').get(id, project) as unknown as CollectionRow | undefined;
    if (!row || (!allowDisabled && row.enabled !== 1)) throw new Error('资料集合不可访问。');
    return row;
  }
  async create(project: string, name: string, folder: string): Promise<KnowledgeCollection> {
    if (!project.trim() || project.length > 200 || !name.trim() || name.length > 100) throw new Error('请填写有效项目和集合名称。');
    const root = await realpath(resolve(folder));
    if (!(await lstat(root)).isDirectory()) throw new Error('请选择资料文件夹。');
    const id = randomUUID();
    this.db.prepare('INSERT INTO collections(id,project,name,root) VALUES(?,?,?,?)').run(id, project, name.trim(), root);
    return this.list(project).find(item => item.id === id)!;
  }
  list(project: string): KnowledgeCollection[] {
    const rows = this.db.prepare('SELECT c.*, (SELECT COUNT(*) FROM documents d WHERE d.collection_id=c.id) AS documents FROM collections c WHERE project=? ORDER BY name').all(project);
    return rows.map(row => ({ id: String(row.id), project: String(row.project), name: String(row.name), root: String(row.root), epoch: Number(row.epoch), enabled: row.enabled === 1, cloudProvider: String(row.cloud_provider), agentEnabled: row.agent_enabled === 1, documents: Number(row.documents) }));
  }
  setAccess(project: string, id: string, enabled: boolean, cloudProvider: string): void {
    this.collection(project, id, true);
    if (!['', 'seedance'].includes(cloudProvider)) throw new Error('不支持该外发目标。');
    this.db.prepare("UPDATE collections SET enabled=?,cloud_provider=?,agent_enabled=CASE WHEN ?=1 AND ?='seedance' THEN agent_enabled ELSE 0 END,epoch=epoch+1 WHERE id=?").run(enabled ? 1 : 0, cloudProvider, enabled ? 1 : 0, cloudProvider, id);
    this.importReports.delete(id);
  }
  setAgentAccess(project: string, id: string, enabled: boolean): void {
    const collection = this.collection(project, id);
    if (enabled && (collection.cloud_provider !== 'seedance' || !this.binding(project))) throw new Error('请先绑定工作目录，并允许该集合向 Seedance 提供引用。');
    this.db.prepare('UPDATE collections SET agent_enabled=?,epoch=epoch+1 WHERE id=?').run(enabled ? 1 : 0, id);
    this.importReports.delete(id);
  }
  async index(project: string, id: string): Promise<ImportResult> {
    const collection = this.collection(project, id);
    this.importReports.delete(id);
    const root = await realpath(collection.root);
    if (root !== collection.root) throw new Error('资料根目录已变化，请重新授权。');
    const files: string[] = [];
    let examined = 0;
    let skipped = 0;
    let failed = 0;
    const issues: KnowledgeImportIssue[] = [];
    const issue = (file: string, outcome: KnowledgeImportIssue['outcome'], code: KnowledgeImportIssue['code']): void => {
      if (outcome === 'skipped') skipped++; else failed++;
      if (issues.length >= 50) return;
      const path = relative(root, file).replaceAll('\\', '/');
      let end = Math.min(path.length, 4096);
      if (end < path.length && /[\uD800-\uDBFF]/.test(path[end - 1]!)) end--;
      issues.push({path: path.slice(0, end), pathTruncated: end < path.length, outcome, code});
    };
    const walk = async (directory: string): Promise<void> => {
      const entries = await opendir(directory);
      for await (const entry of entries) {
        if (++examined > 5000) throw new Error('资料条目超过 5000 个，请选择更小的文件夹。');
        const path = join(directory, entry.name);
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) { issue(path, 'skipped', 'HIDDEN_OR_LINK'); continue; }
        if (entry.isDirectory()) { if (!excludedDirectories.has(entry.name)) await walk(path); else issue(path, 'skipped', 'EXCLUDED_DIRECTORY'); }
        else if (entry.isFile() && allowedExtensions.has(extname(entry.name).toLowerCase())) files.push(path);
        else issue(path, 'skipped', 'UNSUPPORTED_FORMAT');
      }
    };
    await walk(root);
    const documents: Array<{ path: string; digest: string; sections: Array<{text:string;page?:number}> }> = [];
    let totalBytes = 0;
    let extractedBytes = 0;
    for (const file of files) {
      // Authorization may be revoked while an async import is in progress.
      if (this.collection(project, id).epoch !== collection.epoch) throw new Error('资料权限已变化，本次导入已停止。');
      try {
        const physical = await realpath(file);
        if (!inside(root, physical) || (await lstat(file)).isSymbolicLink()) { issue(file, 'skipped', 'SOURCE_CHANGED'); continue; }
        const handle = await open(physical, 'r');
        try {
          const stat = await handle.stat({bigint: true});
          if (!stat.isFile()) { issue(file, 'skipped', 'UNSUPPORTED_FORMAT'); continue; }
          if (stat.size > BigInt(maxFileBytes)) { issue(file, 'skipped', 'FILE_TOO_LARGE'); continue; }
          // Fixed buffer also bounds a file that grows after fstat.
          const buffer = Buffer.alloc(maxFileBytes + 1);
          let size = 0;
          while (size < buffer.length) { const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null); if (!bytesRead) break; size += bytesRead; }
          if (size > maxFileBytes) { issue(file, 'skipped', 'FILE_TOO_LARGE'); continue; }
          const after = await lstat(file, {bigint: true});
          if (await realpath(file) !== physical || after.isSymbolicLink() || !after.isFile() || after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size || BigInt(size) !== stat.size || after.mtimeNs !== stat.mtimeNs || after.ctimeNs !== stat.ctimeNs) { issue(file, 'skipped', 'SOURCE_CHANGED'); continue; }
          totalBytes += size;
          if (totalBytes > 32 * 1024 * 1024) throw new Error('IMPORT_BUDGET');
          const bytes = buffer.subarray(0, size);
          let sections:Array<{text:string;page?:number}>;
          if (extname(file).toLowerCase() === '.pdf') {
            sections = await extractPdfPages(bytes, () => { if (this.collection(project,id).epoch !== collection.epoch) throw new Error('资料权限已变化，本次导入已停止。'); });
            if (!sections.length) { issue(file, 'skipped', 'NO_TEXT'); continue; }
          } else if(extname(file).toLowerCase()==='.docx') {
            const text=await extractDocxText(bytes,()=>{if(this.collection(project,id).epoch!==collection.epoch)throw Error('资料权限已变化，本次导入已停止。');});
            if(!text.trim()){issue(file, 'skipped', 'NO_TEXT');continue;}sections=[{text}];
          } else {
            let text: string;
            try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
            catch { throw documentFailure('TEXT_ENCODING', '文本不是有效的 UTF-8 编码。'); }
            if (text.includes('\0')) { issue(file, 'skipped', 'NON_TEXT'); continue; }
            sections = [{text}];
          }
          extractedBytes += sections.reduce((size,section)=>size+Buffer.byteLength(section.text),0);
          if (extractedBytes > 32 * 1024 * 1024) throw new Error('IMPORT_BUDGET');
          documents.push({ path: relative(root, file).replaceAll('\\', '/'), digest: createHash('sha256').update(bytes).digest('hex'), sections });
        } finally { await handle.close(); }
      } catch (error) {
        if (error instanceof Error && error.message === 'IMPORT_BUDGET') throw new Error('本次导入超过 32 MiB，请拆分资料集合。');
        const code = error && typeof error === 'object' && 'documentFailureCode' in error ? error.documentFailureCode : undefined;
        issue(file, 'failed', documentFailureCodes.includes(code as DocumentFailureCode) ? code as DocumentFailureCode : 'FILE_READ_FAILED');
      }
    }
    if (this.collection(project, id).epoch !== collection.epoch) throw new Error('资料权限已变化，本次导入已停止。');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM search_index WHERE chunk_id IN (SELECT ch.id FROM chunks ch JOIN documents d ON ch.document_id=d.id WHERE d.collection_id=?)').run(id);
      this.db.prepare('DELETE FROM documents WHERE collection_id=?').run(id);
      for (const document of documents) {
        const documentId = randomUUID();
        this.db.prepare('INSERT INTO documents(id,collection_id,path,digest) VALUES(?,?,?,?)').run(documentId, id, document.path, document.digest);
        for (const section of document.sections) for (let offset = 0; offset < section.text.length; offset += 1400) {
          // Preserve complete Unicode scalars at overlapping excerpt edges.
          const low=(position:number)=>section.text.charCodeAt(position)>=0xdc00&&section.text.charCodeAt(position)<=0xdfff;
          const high=(position:number)=>section.text.charCodeAt(position)>=0xd800&&section.text.charCodeAt(position)<=0xdbff;
          const start=offset>0&&low(offset)&&high(offset-1)?offset-1:offset;
          let end=Math.min(section.text.length,start+1600);if(end<section.text.length&&high(end-1)&&low(end))end--;
          const text = section.text.slice(start, end);
          const chunkId = randomUUID();
          const line = section.text.slice(0, start).split('\n').length;
          this.db.prepare('INSERT INTO chunks(id,document_id,line,text,page) VALUES(?,?,?,?,?)').run(chunkId, documentId, line, text, section.page ?? 0);
          this.db.prepare('INSERT INTO search_index(chunk_id,terms) VALUES(?,?)').run(chunkId, lexicalTerms(text).join(' '));
        }
      }
      this.db.prepare('UPDATE collections SET epoch=epoch+1 WHERE id=?').run(id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    const result = { indexed: documents.length, skipped, failed };
    this.importReports.set(id, {project, collectionId: id, epoch: collection.epoch + 1, createdAt: new Date().toISOString(), examined, ...result, issues, omitted: skipped + failed - issues.length});
    while (this.importReports.size > 32) this.importReports.delete(this.importReports.keys().next().value!);
    return result;
  }
  search(project: string, query: string, provider = ''): KnowledgeHit[] {
    if (query.length > 200) throw new Error('检索内容请控制在 200 字以内。');
    if (provider !== '' && provider !== 'seedance') throw new Error('未授权此模型服务。');
    const terms = queryTerms(query);
    if (!terms.length) return [];
    // Materialize scores before the window: FTS5 auxiliary functions cannot run
    // in the window's evaluation context. Keep text out of the intermediate set.
    // Authorization precedes ranking and diversity; an inaccessible document
    // must never consume a position in the user's result window.
    const rows = this.db.prepare(`WITH matched AS MATERIALIZED (
      SELECT ch.id,ch.document_id,ch.line,d.path,bm25(search_index) AS score
      FROM search_index f JOIN chunks ch ON ch.id=f.chunk_id JOIN documents d ON d.id=ch.document_id JOIN collections c ON c.id=d.collection_id
      WHERE search_index MATCH ? AND c.project=? AND c.enabled=1 AND (?='' OR (c.cloud_provider=? AND c.agent_enabled=1))
    ), diversified AS (
      SELECT *,row_number() OVER (PARTITION BY document_id ORDER BY score,line,id) AS document_position FROM matched
    ) SELECT ch.id,c.id AS collection_id,c.name,ch.page,ch.line,ch.text,c.epoch,d.path
      FROM diversified result JOIN chunks ch ON ch.id=result.id JOIN documents d ON d.id=ch.document_id JOIN collections c ON c.id=d.collection_id
      ORDER BY result.document_position,result.score,d.path,ch.line,ch.id LIMIT 12`).all(terms.join(' AND '), project, provider, provider);
    if (!rows.length) {
      const compounds = new Map<string, boolean>();
      const plan = questionGroups(query, word => {
        if (compounds.has(word)) return compounds.get(word)!;
        if (compounds.size >= 32) return false;
        // The vocabulary must come from the same authorized index as results.
        // Exact text confirms continuity; encoded FTS terms narrow the lookup.
        const exists = !!this.db.prepare(`SELECT 1 FROM search_index f JOIN chunks ch ON ch.id=f.chunk_id JOIN documents d ON d.id=ch.document_id JOIN collections c ON c.id=d.collection_id
          WHERE search_index MATCH ? AND instr(ch.text,?)>0 AND c.project=? AND c.enabled=1 AND (?='' OR (c.cloud_provider=? AND c.agent_enabled=1)) LIMIT 1`).get(queryTerms(word).join(' AND '), word, project, provider, provider);
        compounds.set(word, exists);
        return exists;
      });
      if (plan.groups.length) return this.questionSearch(project, plan, provider);
    }
    return rows.map(row => ({ id: String(row.id), collectionId: String(row.collection_id), collectionName: String(row.name), path: String(row.path), line: Number(row.line), ...(Number(row.page)>0?{page:Number(row.page)}:{}), text: String(row.text), epoch: Number(row.epoch) }));
  }
  private questionSearch(project: string, { groups, adjacent }: { groups: string[][]; adjacent: string[] }, provider: string): KnowledgeHit[] {
    // Hex-encoded terms alone form the FTS grammar. Filter authority before the
    // bounded, source-diverse candidate window; only then load indexed terms.
    const match = groups.map(group => '(' + group.join(' AND ') + ')').join(' OR ');
    const rows = this.db.prepare(`WITH matched AS MATERIALIZED (
      SELECT ch.id,ch.document_id,ch.line,d.path,c.epoch,f.rowid AS search_rowid,bm25(search_index) AS score
      FROM search_index f JOIN chunks ch ON ch.id=f.chunk_id JOIN documents d ON d.id=ch.document_id JOIN collections c ON c.id=d.collection_id
      WHERE search_index MATCH ? AND c.project=? AND c.enabled=1 AND (?='' OR (c.cloud_provider=? AND c.agent_enabled=1))
    ), diversified AS (
      SELECT *,row_number() OVER (PARTITION BY document_id ORDER BY score,line,id) AS document_position FROM matched
    ), selected AS MATERIALIZED (
      SELECT * FROM diversified ORDER BY document_position,score,path,line,id LIMIT 512
    ) SELECT selected.*,f.terms FROM selected JOIN search_index f ON f.rowid=selected.search_rowid`).all(match, project, provider, provider);
    if (!rows.length) return [];
    const candidates = rows.map(row => {
      const terms = new Set(String(row.terms).split(' '));
      return { id: String(row.id), document: String(row.document_id), path: String(row.path), line: Number(row.line), epoch: Number(row.epoch), score: Number(row.score), matches: groups.map(group => group.every(term => terms.has(term))), adjacent: adjacent.map(term => terms.has(term)), coverage: 0, relevance: 0, position: 0 };
    });
    const documents = new Set(candidates.map(item => item.document)).size;
    const weights = groups.map((_group, i) => Math.log((documents + 1) / (new Set(candidates.filter(item => item.matches[i]).map(item => item.document)).size + 1)) + 1);
    const total = weights.reduce((sum, value) => sum + value, 0);
    const phraseWeights = adjacent.map((_term, i) => { const frequency = new Set(candidates.filter(item => item.adjacent[i]).map(item => item.document)).size; return frequency ? Math.log((documents + 1) / (frequency + 1)) + 1 : 0; });
    const phraseTotal = phraseWeights.reduce((sum, value) => sum + value, 0);
    const ranked = candidates.filter(item => {
      item.coverage = item.matches.reduce((sum, found, i) => sum + (found ? weights[i]! : 0), 0) / total;
      const phraseCoverage = phraseTotal ? item.adjacent.reduce((sum, found, i) => sum + (found ? phraseWeights[i]! : 0), 0) / phraseTotal : item.coverage;
      item.relevance = .7 * item.coverage + .3 * phraseCoverage;
      return item.matches.filter(Boolean).length >= Math.min(2, groups.length) && item.coverage >= 0.55;
    });
    const compare = (a: typeof candidates[number], b: typeof candidates[number]): number => b.relevance - a.relevance || a.score - b.score || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || a.line - b.line || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    ranked.sort(compare);
    const positions = new Map<string, number>();
    for (const item of ranked) { item.position = positions.get(item.document) ?? 0; positions.set(item.document, item.position + 1); }
    ranked.sort((a, b) => a.position - b.position || compare(a, b));
    const chosen = ranked.slice(0, 12);
    if (!chosen.length) return [];
    // Recheck current authority/epochs when fetching the final results; another
    // connection can revoke or rebuild a collection between these SQL statements.
    const current = this.db.prepare(`SELECT ch.id,c.id AS collection_id,c.name,ch.page,ch.line,ch.text,c.epoch,d.path
      FROM chunks ch JOIN documents d ON d.id=ch.document_id JOIN collections c ON c.id=d.collection_id
      WHERE c.project=? AND c.enabled=1 AND (?='' OR (c.cloud_provider=? AND c.agent_enabled=1)) AND ch.id IN (${chosen.map(() => '?').join(',')})`).all(project, provider, provider, ...chosen.map(item => item.id));
    const found = new Map(current.map(row => [String(row.id), row]));
    return chosen.flatMap(item => {
      const row = found.get(item.id);
      return row && Number(row.epoch) === item.epoch ? [{ id: String(row.id), collectionId: String(row.collection_id), collectionName: String(row.name), path: String(row.path), line: Number(row.line), ...(Number(row.page)>0?{page:Number(row.page)}:{}), text: String(row.text), epoch: Number(row.epoch) }] : [];
    });
  }
  /** Read a bounded window of the authorized local index, without a cloud grant. */
  source(project: string, hitId: string, epoch: number): KnowledgeSource {
    const anchor = this.db.prepare(`SELECT ch.id,ch.document_id,ch.rowid AS ordinal,ch.page,ch.line,ch.text,c.id AS collection_id,c.name,c.epoch,d.path
      FROM chunks ch JOIN documents d ON d.id=ch.document_id JOIN collections c ON c.id=d.collection_id
      WHERE ch.id=? AND c.project=? AND c.enabled=1 AND c.epoch=?`).get(hitId, project, epoch);
    if (!anchor) throw new Error('资料引用已过期、已撤回，或不属于当前资料空间。');
    // Own index rows are inserted in source order. rowid breaks ties when many
    // overlapping chunks begin on the same physical line; no source file opens.
    const before = this.db.prepare('SELECT id,page,line,text,rowid AS ordinal FROM chunks WHERE document_id=? AND rowid<? ORDER BY rowid DESC LIMIT 2').all(anchor.document_id!, anchor.ordinal!);
    const after = this.db.prepare('SELECT id,page,line,text,rowid AS ordinal FROM chunks WHERE document_id=? AND rowid>? ORDER BY rowid LIMIT 2').all(anchor.document_id!, anchor.ordinal!);
    const rows = [...before.slice(0, 1), anchor, ...after.slice(0, 1)];
    const sections = rows.map(row => ({ id: String(row.id), collectionId: String(anchor.collection_id), collectionName: String(anchor.name), path: String(anchor.path), line: Number(row.line), ...(Number(row.page)>0?{page:Number(row.page)}:{}), text: String(row.text), epoch: Number(anchor.epoch) }));
    const firstSection = Number(this.db.prepare('SELECT count(*) AS n FROM chunks WHERE document_id=? AND rowid<?').get(anchor.document_id!, rows[0]!.ordinal!)?.n) + 1;
    const totalSections = Number(this.db.prepare('SELECT count(*) AS n FROM chunks WHERE document_id=?').get(anchor.document_id!)?.n);
    if (this.collection(project, String(anchor.collection_id)).epoch !== epoch) throw new Error('资料引用已变化，请重新检索。');
    return { anchorId: hitId, sections, firstSection, totalSections, earlierId: before[1] ? String(before[1].id) : null, laterId: after[1] ? String(after[1].id) : null };
  }
  /** Model reads require a previous retrieval grant in this exact bound session. */
  async sourceForAgent(sessionId: string, provider: string, directory: string, hitId: string, epoch: number): Promise<KnowledgeSource> {
    if (!sessionId || provider !== 'seedance') throw new Error('当前会话未获准读取此资料引用。');
    const physical = await realpath(directory);
    const root = process.platform === 'win32' ? physical.toLowerCase() : physical;
    await this.assertSessionAllowed(sessionId, provider, root);
    const allowed = this.db.prepare(`SELECT c.project FROM chunks ch JOIN documents d ON d.id=ch.document_id
      JOIN collections c ON c.id=d.collection_id JOIN workspace_bindings b ON b.project=c.project
      JOIN session_grants g ON g.collection_id=c.id AND g.project=c.project AND g.epoch=c.epoch AND g.binding_epoch=b.epoch AND g.root=b.root
      WHERE ch.id=? AND c.epoch=? AND c.enabled=1 AND c.agent_enabled=1 AND c.cloud_provider=? AND b.root=? AND g.session_id=?`).get(hitId, epoch, provider, root, sessionId);
    if (!allowed) throw new Error('请先在当前会话检索已授权资料；引用也可能已过期或撤回。');
    return this.source(String(allowed.project), hitId, epoch);
  }
  /** Revalidate a selected citation at use time. Caller must separately obtain cloud-send permission. */
  citation(project: string, hitId: string, epoch: number, provider: string): KnowledgeHit {
    const row = this.db.prepare(`SELECT ch.id,c.id AS collection_id,c.name,ch.page,ch.line,ch.text,c.epoch,c.cloud_provider,d.path
      FROM chunks ch JOIN documents d ON d.id=ch.document_id JOIN collections c ON c.id=d.collection_id
      WHERE ch.id=? AND c.project=? AND c.enabled=1`).get(hitId, project);
    if (!row || row.epoch !== epoch || row.cloud_provider !== provider || provider !== 'seedance') throw new Error('引用已过期、已撤回，或尚未允许发送给该模型服务。');
    return { id: String(row.id), collectionId: String(row.collection_id), collectionName: String(row.name), path: String(row.path), line: Number(row.line), ...(Number(row.page)>0?{page:Number(row.page)}:{}), text: String(row.text), epoch: Number(row.epoch) };
  }
}
