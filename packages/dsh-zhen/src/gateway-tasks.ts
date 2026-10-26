import type { DatabaseSync } from 'node:sqlite';
import {openOwnedDatabase} from './owned-store-source.ts';
import type {OwnedDatabaseSource} from './owned-store-source.ts';
import { randomUUID } from 'node:crypto';
import { gatewayTaskSpecSchema, gatewayTaskRecordSchema, gatewayTaskObservationSchema, gatewayCurrencySchema } from './gateway-task-schema.ts';
import type { GatewayTaskSpec, GatewayTaskProtocol, GatewayTaskCode, GatewayTaskObservation, GatewayTaskRecord } from './gateway-task-schema.ts';

export class GatewayTaskError extends Error {
  constructor(readonly code: GatewayTaskCode, readonly retryMs = 0) { super(code); this.name = 'GatewayTaskError'; }
}
export const GATEWAY_TASK_PATHS: Readonly<Record<GatewayTaskProtocol, string>> = Object.freeze({ video: '/v1/videos/', 'legacy-video': '/v1/video/generations/', image: '/v1/image/generations/', audio: '/v1/audio/generations/', 'three-d': '/v1/3d/generations/', music: '/v1/music/tasks/', midjourney: '/v1/midjourney/tasks/', 'minimax-v2': '/v2/query/video_generation/' });
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const terminal = (status: GatewayTaskObservation['status']): boolean => ['succeeded', 'failed', 'cancelled'].includes(status);
const states: Readonly<Record<string, GatewayTaskObservation['status']>> = Object.freeze({ NOT_START: 'queued', SUBMITTED: 'queued', IN_PROGRESS: 'running', SUCCESS: 'succeeded', FAILURE: 'failed', queued: 'queued', pending: 'queued', submitted: 'queued', in_progress: 'running', processing: 'running', running: 'running', completed: 'succeeded', succeeded: 'succeeded', failed: 'failed', cancelled: 'cancelled' });
function retryAfter(response:Response,now:number):number{
  const value=response.headers.get('retry-after');if(!value||value.length>128)return 0;
  const wait=/^\d+$/.test(value)?Number(value)*1000:Date.parse(value)-now;
  return Number.isFinite(wait)&&wait>0?Math.min(wait,86400000):0;
}

/** Extract safe task facts only. Provider text, prompt, titles, lyrics, quota,
 * legacy cost fields and signed result URLs never enter public observations.
 */
export function parseGatewayTask(spec: GatewayTaskSpec, input: unknown, collect?: (sources: string[]) => void): GatewayTaskObservation {
  gatewayTaskSpecSchema.parse(spec);
  const body = object(input); if (!body) throw new GatewayTaskError('RESPONSE');
  if (body.code !== undefined && !['success', 'SUCCESS', 0, 1, 200].includes(body.code as string | number)) throw new GatewayTaskError('RESPONSE');
  const record = spec.protocol === 'minimax-v2' ? object(body.task) : ['video', 'midjourney'].includes(spec.protocol) ? body : object(body.data);
  if (!record) throw new GatewayTaskError('RESPONSE');
  // Generic TaskDto responses may carry an internal numeric row id alongside
  // the public task_id. The real image endpoint returns this shape (C141).
  // Accept that row id only in the generic envelope and only with the exact
  // requested public identity. String ids still have to agree with each other.
  const internalRowId = ['legacy-video', 'image', 'audio', 'three-d', 'music'].includes(spec.protocol)
    && Number.isSafeInteger(record.id) && Number(record.id) >= 0 && record.task_id === spec.taskId;
  const ids = [internalRowId ? undefined : record.id, record.task_id].filter(value => value !== undefined);
  if (!ids.length || ids.some(value => value !== spec.taskId) || typeof record.status !== 'string') throw new GatewayTaskError('RESPONSE');
  const status = states[record.status] ?? 'unknown';
  const rawProgress = typeof record.progress === 'string' && /^\d{1,3}(?:\.\d+)?%?$/.test(record.progress) ? Number(record.progress.replace(/%$/, '')) : record.progress;
  const progress = typeof rawProgress === 'number' && Number.isFinite(rawProgress) && rawProgress >= 0 && rawProgress <= 100 ? rawProgress : null;
  const rawUsage = object(record.usage);
  const usage = terminal(status) && rawUsage && typeof rawUsage.amount === 'number' && Number.isFinite(rawUsage.amount) && rawUsage.amount >= 0 && typeof rawUsage.currency === 'string' && gatewayCurrencySchema.safeParse(rawUsage.currency).success
    ? { amount: rawUsage.amount, currency: rawUsage.currency } : null;
  const urls = new Set<string>();
  function url(value: unknown): void {
    if (typeof value !== 'string' || value.length > 8192 || urls.size >= 100) return;
    try { const parsed = new URL(value); if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) urls.add(value); } catch {}
  }
  function urlsOf(value: unknown): void { if (Array.isArray(value)) value.slice(0, 100).forEach(url); }
  if (status === 'succeeded') {
    const nested = object(record.data), content = object(nested?.content), result = object(record.result);
    url(record.result_url); url(object(record.metadata)?.url); url(object(record.content)?.url);
    for (const key of ['image_url', 'audio_url', 'video_url', 'file_url']) url(content?.[key]);
    for (const key of ['image_urls', 'audio_urls', 'video_urls', 'file_urls']) urlsOf(content?.[key]);
    if (Array.isArray(result?.music)) for (const item of result.music.slice(0, 100)) { const track = object(item); url(track?.audio_url); url(track?.video_url); }
    if (spec.protocol === 'midjourney') { url(record.imageUrl); url(record.videoUrl); }
  }
  const observation = gatewayTaskObservationSchema.parse({ status, progress, usage, resultCount: urls.size });
  collect?.([...urls]); return observation;
}

/** Fixed authenticated GETs only. No submit, retry-create, delete or media fetch. */
export async function readGatewayTask(spec: GatewayTaskSpec, key: string, fetcher: typeof fetch = fetch, signal?: AbortSignal, collect?: (sources: string[]) => void, timing?:{now?:()=>number;nextPoll?:(waitMs:number)=>void}): Promise<GatewayTaskObservation> {
  gatewayTaskSpecSchema.parse(spec);
  const abort = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]);
  let response: Response;
  try { response = await fetcher(`https://api.seedance.nz${GATEWAY_TASK_PATHS[spec.protocol]}${encodeURIComponent(spec.taskId)}`, { method: 'GET', redirect: 'error', signal: abort, headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } }); }
  catch { throw new GatewayTaskError(abort.aborted && signal?.aborted ? 'CANCELLED' : 'NETWORK'); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    const retryMs = retryAfter(response,(timing?.now??Date.now)());
    throw new GatewayTaskError([401, 403].includes(response.status) ? 'AUTH' : response.status === 404 ? 'NOT_FOUND' : response.status === 429 ? 'RATE_LIMIT' : response.status >= 500 ? 'SERVER' : 'RESPONSE', retryMs);
  }
  const reader = response.body?.getReader(); if (!reader) throw new GatewayTaskError('RESPONSE');
  const parts: Uint8Array[] = []; let size = 0, decoding = false;
  try {
    while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > 1048576) throw new GatewayTaskError('RESPONSE'); parts.push(item.value); }
    abort.throwIfAborted(); decoding = true;
    const observation=parseGatewayTask(spec, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts))), collect);
    if(observation.status==='queued'||observation.status==='running')timing?.nextPoll?.(retryAfter(response,(timing.now??Date.now)()));
    return observation;
  } catch (error) { throw error instanceof GatewayTaskError ? error : new GatewayTaskError(signal?.aborted ? 'CANCELLED' : decoding ? 'RESPONSE' : 'NETWORK'); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

type ResolveKey = () => Promise<string | undefined>;
/** Owned status metadata. No generated media, response bodies or signed URLs.
 * Explicit tracking may resume after restart; each GET resolves ctx.credentials.
 */
export class GatewayTasks {
  private readonly db: DatabaseSync;
  private readonly backupSource:OwnedDatabaseSource|null;
  private active?: { id: string; controller: AbortController; promise: Promise<GatewayTaskRecord> };
  private closed = false;
  private generation = 0;
  private readonly media = new Map<string, { sources: string[]; expires: number }>();
  constructor(file: string, private readonly resolveKey: ResolveKey, private readonly fetcher: typeof fetch = fetch, private readonly now = Date.now) {
    const opened=openOwnedDatabase(file);this.db=opened.db;this.backupSource=opened.source;this.db.exec('PRAGMA busy_timeout=3000');
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    if (version > 1) { this.db.close(); throw new GatewayTaskError('UNAVAILABLE'); }
    this.db.exec('CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,protocol TEXT NOT NULL,task_id TEXT NOT NULL,record TEXT NOT NULL,UNIQUE(protocol,task_id)); PRAGMA user_version=1;');
  }
  backupSourceIdentity():OwnedDatabaseSource|null{return this.backupSource?{...this.backupSource}:null;}
  private get(id: string): GatewayTaskRecord {
    if (!/^[a-f0-9-]{36}$/.test(id) || this.closed) throw new GatewayTaskError('UNAVAILABLE');
    const row = this.db.prepare('SELECT record FROM tasks WHERE id=?').get(id);
    if (!row || typeof row.record !== 'string' || row.record.length > 4096) throw new GatewayTaskError('NOT_FOUND');
    const value = gatewayTaskRecordSchema.parse(JSON.parse(row.record));
    return { ...value, querying: this.active?.id === id };
  }
  private save(value: GatewayTaskRecord): GatewayTaskRecord {
    const text = JSON.stringify(gatewayTaskRecordSchema.parse({ ...value, querying: false }));
    this.db.prepare('UPDATE tasks SET record=? WHERE id=?').run(text, value.id); return this.get(value.id);
  }
  list(): GatewayTaskRecord[] {
    if (this.closed) return [];
    return this.db.prepare('SELECT id FROM tasks ORDER BY rowid DESC LIMIT 100').all().map(row => this.get(String(row.id)));
  }
  add(input: GatewayTaskSpec): GatewayTaskRecord {
    const spec = gatewayTaskSpecSchema.parse(input);
    const old = this.list().find(item => item.protocol === spec.protocol && item.taskId === spec.taskId); if (old) return old;
    if (this.list().length >= 100) throw new GatewayTaskError('UNAVAILABLE');
    const value: GatewayTaskRecord = { id: randomUUID(), ...spec, createdAt: new Date(this.now()).toISOString(), checkedAt: '', nextCheckAt: '', tracking: false, querying: false, code: '', failures: 0, status: 'unknown', progress: null, resultCount: 0, usage: null };
    this.db.prepare('INSERT INTO tasks VALUES(?,?,?,?)').run(value.id, value.protocol, value.taskId, JSON.stringify(value)); return value;
  }
  tracking(id: string, enabled: boolean): GatewayTaskRecord { const value = this.get(id); return this.save({ ...value, tracking: enabled }); }
  remove(id: string): void { this.get(id); this.media.delete(id); if (this.active?.id === id) this.active.controller.abort(); this.db.prepare('DELETE FROM tasks WHERE id=?').run(id); }
  async mediaSources(id: string): Promise<string[]> {
    this.get(id); let cached = this.media.get(id);
    if (!cached || cached.expires <= this.now()) { await this.refresh(id); cached = this.media.get(id); }
    if (!cached || cached.expires <= this.now() || this.get(id).status !== 'succeeded') throw new GatewayTaskError('UNAVAILABLE');
    return [...cached.sources];
  }
  refresh(id: string): Promise<GatewayTaskRecord> {
    if (this.active?.id === id) return this.active.promise;
    if (this.active || this.closed) return Promise.reject(new GatewayTaskError('BUSY'));
    const record = this.get(id);
    if (record.nextCheckAt && this.now() < Date.parse(record.nextCheckAt)) return Promise.resolve(record);
    const controller = new AbortController(), generation = this.generation;
    const promise = this.query(record, controller.signal, generation).then(value => ({ ...value, querying: false }));
    this.active = { id, controller, promise };
    void promise.finally(() => { if (this.active?.promise === promise) this.active = undefined; }).catch(() => {});
    return promise;
  }
  private async query(record: GatewayTaskRecord, signal: AbortSignal, generation: number): Promise<GatewayTaskRecord> {
    try {
      let key; try { key = await this.resolveKey(); } catch { throw new GatewayTaskError('MISSING_CREDENTIAL'); }
      if (signal.aborted || generation !== this.generation) throw new GatewayTaskError('CONFIG_CHANGED');
      if (!key) throw new GatewayTaskError('MISSING_CREDENTIAL');
      let sources: string[] = [],retryMs=0;
      const observation = await readGatewayTask({ protocol: record.protocol, taskId: record.taskId }, key, this.fetcher, signal, value => { sources = value; },{now:this.now,nextPoll:wait=>{retryMs=wait;}});
      if (signal.aborted || generation !== this.generation || this.closed) throw new GatewayTaskError('CONFIG_CHANGED');
      const current = this.get(record.id);
      this.media.delete(record.id);
      if (observation.status === 'succeeded' && sources.length) this.media.set(record.id, { sources, expires: this.now() + 300000 });
      while (this.media.size > 10) this.media.delete(this.media.keys().next().value!);
      const wait=Math.max(record.protocol==='image'?2000:5000,retryMs);
      return this.save({ ...current, ...observation, checkedAt: new Date(this.now()).toISOString(), nextCheckAt: new Date(this.now() + wait).toISOString(), failures: 0, code: observation.status === 'unknown' ? 'UNRECOGNIZED_STATUS' : '', tracking: current.tracking && !terminal(observation.status) && observation.status !== 'unknown' });
    } catch (error) {
      this.media.delete(record.id);
      if (this.closed) throw new GatewayTaskError('UNAVAILABLE');
      const current = this.get(record.id), code = generation !== this.generation ? 'CONFIG_CHANGED' : error instanceof GatewayTaskError ? error.code : 'UNAVAILABLE';
      const failures = Math.min(current.failures + 1, 10), delay = Math.max(5000 * 2 ** Math.min(failures, 6), error instanceof GatewayTaskError ? error.retryMs : 0);
      return this.save({ ...current, code, failures, checkedAt: new Date(this.now()).toISOString(), nextCheckAt: new Date(this.now() + delay).toISOString(), tracking: current.tracking && !['AUTH', 'MISSING_CREDENTIAL', 'CONFIG_CHANGED', 'UNAVAILABLE', 'RESPONSE'].includes(code) });
    }
  }
  async automatic(): Promise<void> {
    if (this.active || this.closed) return;
    const next = this.list().filter(item => item.tracking && (!item.nextCheckAt || this.now() >= Date.parse(item.nextCheckAt))).sort((a, b) => a.checkedAt.localeCompare(b.checkedAt))[0];
    if (next) await this.refresh(next.id);
  }
  invalidate(): void {
    this.generation++; this.media.clear(); this.active?.controller.abort();
    for (const item of this.list()) if (item.tracking) this.save({ ...item, tracking: false });
  }
  async close(): Promise<void> { if (this.closed) return; this.closed = true; this.media.clear(); this.active?.controller.abort(); await this.active?.promise.catch(() => {}); this.db.close(); }
}
