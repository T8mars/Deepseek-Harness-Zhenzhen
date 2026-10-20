import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { realpath, lstat, open, opendir } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, extname, join } from 'node:path';

export interface KnowledgeCollection { id: string; project: string; name: string; root: string; epoch: number; enabled: boolean; cloudProvider: string; agentEnabled: boolean; documents: number; }
export interface KnowledgeHit { id: string; collectionId: string; collectionName: string; path: string; line: number; text: string; epoch: number; }
export interface KnowledgeSource { anchorId: string; sections: KnowledgeHit[]; firstSection: number; totalSections: number; earlierId: string | null; laterId: string | null; }
export interface ImportResult { indexed: number; skipped: number; failed: number; }
export interface KnowledgeBinding { project: string; root: string; epoch: number; }
interface CollectionRow { id: string; project: string; name: string; root: string; epoch: number; enabled: number; cloud_provider: string; agent_enabled: number; }
const allowedExtensions = new Set(['.md', '.txt', '.csv', '.json']);
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
/** Only recognized Chinese questions get a lexical fallback; keyword AND stays exact. */
function questionGroups(query: string): { groups: string[][]; adjacent: string[] } {
  const empty = { groups: [], adjacent: [] };
  if (!questionSegmenter || !/\p{Script=Han}/u.test(query) || !/(?:如何|怎么|怎样|什么|为什么|请问|能否|是否|应该|[？?])/u.test(query)) return empty;
  const groups: string[][] = [], seen = new Set<string>(), adjacent = new Set<string>();
  let previous = '';
  for (const part of questionSegmenter.segment(query.normalize('NFKC').toLowerCase())) {
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
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    if (version > 2) { this.db.close(); throw new Error('知识库由更新版本创建，请升级应用后再打开。'); }
    this.db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY, project TEXT NOT NULL, name TEXT NOT NULL, root TEXT NOT NULL, epoch INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, cloud_provider TEXT NOT NULL DEFAULT '');
      CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE, path TEXT NOT NULL, digest TEXT NOT NULL, UNIQUE(collection_id,path));
      CREATE TABLE IF NOT EXISTS chunks(id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, line INTEGER NOT NULL, text TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(chunk_id UNINDEXED, terms);
      CREATE TABLE IF NOT EXISTS workspace_bindings(project TEXT PRIMARY KEY, root TEXT NOT NULL UNIQUE, epoch INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS binding_revisions(id INTEGER PRIMARY KEY AUTOINCREMENT);
      CREATE TABLE IF NOT EXISTS session_grants(session_id TEXT NOT NULL, project TEXT NOT NULL, collection_id TEXT NOT NULL, epoch INTEGER NOT NULL, binding_epoch INTEGER NOT NULL, root TEXT NOT NULL, PRIMARY KEY(session_id,collection_id,epoch,binding_epoch));
      PRAGMA user_version=2;`);
    if (!(this.db.prepare('PRAGMA table_info(collections)').all() as { name: string }[]).some(column => column.name === 'agent_enabled')) this.db.exec('ALTER TABLE collections ADD COLUMN agent_enabled INTEGER NOT NULL DEFAULT 0');
  }
  close(): void { this.db.close(); }
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
  async retrieveForAgent(sessionId: string, provider: string, directory: string, query: string): Promise<KnowledgeHit[]> {
    if (!sessionId || provider !== 'seedance') throw new Error('当前知识库只允许向已授权的 Seedance 会话提供片段。');
    const physical = await realpath(directory);
    const root = process.platform === 'win32' ? physical.toLowerCase() : physical;
    const binding = this.db.prepare('SELECT * FROM workspace_bindings WHERE root=?').get(root);
    if (!binding) return [];
    await this.assertSessionAllowed(sessionId, provider, root);
    const hits = this.search(String(binding.project), query, provider);
    for (const hit of hits) {
      this.citation(String(binding.project), hit.id, hit.epoch, provider);
      this.db.prepare('INSERT OR IGNORE INTO session_grants VALUES(?,?,?,?,?,?)').run(sessionId, String(binding.project), hit.collectionId, hit.epoch, Number(binding.epoch), root);
    }
    return hits;
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
  }
  setAgentAccess(project: string, id: string, enabled: boolean): void {
    const collection = this.collection(project, id);
    if (enabled && (collection.cloud_provider !== 'seedance' || !this.binding(project))) throw new Error('请先绑定工作目录，并允许该集合向 Seedance 提供引用。');
    this.db.prepare('UPDATE collections SET agent_enabled=?,epoch=epoch+1 WHERE id=?').run(enabled ? 1 : 0, id);
  }
  async index(project: string, id: string): Promise<ImportResult> {
    const collection = this.collection(project, id);
    const root = await realpath(collection.root);
    if (root !== collection.root) throw new Error('资料根目录已变化，请重新授权。');
    const files: string[] = [];
    let examined = 0;
    let skipped = 0;
    const walk = async (directory: string): Promise<void> => {
      const entries = await opendir(directory);
      for await (const entry of entries) {
        if (++examined > 5000) throw new Error('资料条目超过 5000 个，请选择更小的文件夹。');
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) { skipped++; continue; }
        const path = join(directory, entry.name);
        if (entry.isDirectory()) { if (!excludedDirectories.has(entry.name)) await walk(path); else skipped++; }
        else if (entry.isFile() && allowedExtensions.has(extname(entry.name).toLowerCase())) files.push(path);
        else skipped++;
      }
    };
    await walk(root);
    const documents: Array<{ path: string; digest: string; text: string }> = [];
    let failed = 0;
    let totalBytes = 0;
    for (const file of files) {
      // Authorization may be revoked while an async import is in progress.
      if (this.collection(project, id).epoch !== collection.epoch) throw new Error('资料权限已变化，本次导入已停止。');
      try {
        const physical = await realpath(file);
        if (!inside(root, physical) || (await lstat(file)).isSymbolicLink()) { skipped++; continue; }
        const handle = await open(file, 'r');
        try {
          const stat = await handle.stat();
          if (!stat.isFile() || stat.size > maxFileBytes) { skipped++; continue; }
          // Fixed buffer also bounds a file that grows after fstat.
          const buffer = Buffer.alloc(maxFileBytes + 1);
          let size = 0;
          while (size < buffer.length) { const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null); if (!bytesRead) break; size += bytesRead; }
          if (size > maxFileBytes || !inside(root, await realpath(file))) { skipped++; continue; }
          totalBytes += size;
          if (totalBytes > 32 * 1024 * 1024) throw new Error('IMPORT_BUDGET');
          const bytes = buffer.subarray(0, size);
          const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          if (text.includes('\0')) { skipped++; continue; }
          documents.push({ path: relative(root, file).replaceAll('\\', '/'), digest: createHash('sha256').update(bytes).digest('hex'), text });
        } finally { await handle.close(); }
      } catch (error) { if (error instanceof Error && error.message === 'IMPORT_BUDGET') throw new Error('本次导入超过 32 MiB，请拆分资料集合。'); failed++; }
    }
    if (this.collection(project, id).epoch !== collection.epoch) throw new Error('资料权限已变化，本次导入已停止。');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM search_index WHERE chunk_id IN (SELECT ch.id FROM chunks ch JOIN documents d ON ch.document_id=d.id WHERE d.collection_id=?)').run(id);
      this.db.prepare('DELETE FROM documents WHERE collection_id=?').run(id);
      for (const document of documents) {
        const documentId = randomUUID();
        this.db.prepare('INSERT INTO documents(id,collection_id,path,digest) VALUES(?,?,?,?)').run(documentId, id, document.path, document.digest);
        for (let offset = 0; offset < document.text.length; offset += 1400) {
          const text = document.text.slice(offset, offset + 1600);
          const chunkId = randomUUID();
          const line = document.text.slice(0, offset).split('\n').length;
          this.db.prepare('INSERT INTO chunks(id,document_id,line,text) VALUES(?,?,?,?)').run(chunkId, documentId, line, text);
          this.db.prepare('INSERT INTO search_index(chunk_id,terms) VALUES(?,?)').run(chunkId, lexicalTerms(text).join(' '));
        }
      }
      this.db.prepare('UPDATE collections SET epoch=epoch+1 WHERE id=?').run(id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { indexed: documents.length, skipped, failed };
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
    ) SELECT ch.id,c.id AS collection_id,c.name,ch.line,ch.text,c.epoch,d.path
      FROM diversified result JOIN chunks ch ON ch.id=result.id JOIN documents d ON d.id=ch.document_id JOIN collections c ON c.id=d.collection_id
      ORDER BY result.document_position,result.score,d.path,ch.line,ch.id LIMIT 12`).all(terms.join(' AND '), project, provider, provider);
    if (!rows.length) {
      const plan = questionGroups(query);
      if (plan.groups.length) return this.questionSearch(project, plan, provider);
    }
    return rows.map(row => ({ id: String(row.id), collectionId: String(row.collection_id), collectionName: String(row.name), path: String(row.path), line: Number(row.line), text: String(row.text), epoch: Number(row.epoch) }));
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
    const current = this.db.prepare(`SELECT ch.id,c.id AS collection_id,c.name,ch.line,ch.text,c.epoch,d.path
      FROM chunks ch JOIN documents d ON d.id=ch.document_id JOIN collections c ON c.id=d.collection_id
      WHERE c.project=? AND c.enabled=1 AND (?='' OR (c.cloud_provider=? AND c.agent_enabled=1)) AND ch.id IN (${chosen.map(() => '?').join(',')})`).all(project, provider, provider, ...chosen.map(item => item.id));
    const found = new Map(current.map(row => [String(row.id), row]));
    return chosen.flatMap(item => {
      const row = found.get(item.id);
      return row && Number(row.epoch) === item.epoch ? [{ id: String(row.id), collectionId: String(row.collection_id), collectionName: String(row.name), path: String(row.path), line: Number(row.line), text: String(row.text), epoch: Number(row.epoch) }] : [];
    });
  }
  /** Read a bounded window of the authorized local index, without a cloud grant. */
  source(project: string, hitId: string, epoch: number): KnowledgeSource {
    const anchor = this.db.prepare(`SELECT ch.id,ch.document_id,ch.rowid AS ordinal,ch.line,ch.text,c.id AS collection_id,c.name,c.epoch,d.path
      FROM chunks ch JOIN documents d ON d.id=ch.document_id JOIN collections c ON c.id=d.collection_id
      WHERE ch.id=? AND c.project=? AND c.enabled=1 AND c.epoch=?`).get(hitId, project, epoch);
    if (!anchor) throw new Error('资料引用已过期、已撤回，或不属于当前资料空间。');
    // Own index rows are inserted in source order. rowid breaks ties when many
    // overlapping chunks begin on the same physical line; no source file opens.
    const before = this.db.prepare('SELECT id,line,text,rowid AS ordinal FROM chunks WHERE document_id=? AND rowid<? ORDER BY rowid DESC LIMIT 2').all(anchor.document_id!, anchor.ordinal!);
    const after = this.db.prepare('SELECT id,line,text,rowid AS ordinal FROM chunks WHERE document_id=? AND rowid>? ORDER BY rowid LIMIT 2').all(anchor.document_id!, anchor.ordinal!);
    const rows = [...before.slice(0, 1), anchor, ...after.slice(0, 1)];
    const sections = rows.map(row => ({ id: String(row.id), collectionId: String(anchor.collection_id), collectionName: String(anchor.name), path: String(anchor.path), line: Number(row.line), text: String(row.text), epoch: Number(anchor.epoch) }));
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
    const row = this.db.prepare(`SELECT ch.id,c.id AS collection_id,c.name,ch.line,ch.text,c.epoch,c.cloud_provider,d.path
      FROM chunks ch JOIN documents d ON d.id=ch.document_id JOIN collections c ON c.id=d.collection_id
      WHERE ch.id=? AND c.project=? AND c.enabled=1`).get(hitId, project);
    if (!row || row.epoch !== epoch || row.cloud_provider !== provider || provider !== 'seedance') throw new Error('引用已过期、已撤回，或尚未允许发送给该模型服务。');
    return { id: String(row.id), collectionId: String(row.collection_id), collectionName: String(row.name), path: String(row.path), line: Number(row.line), text: String(row.text), epoch: Number(row.epoch) };
  }
}
