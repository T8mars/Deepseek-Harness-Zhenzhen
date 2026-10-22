import type { DatabaseSync } from 'node:sqlite';
import {openOwnedDatabase} from './owned-store-source.ts';
import type {OwnedDatabaseSource} from './owned-store-source.ts';
import { mkdirSync, realpathSync, lstatSync, statSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { copyFile, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { downloadMedia, MediaDownloadError } from './media-download.ts';
import { gatewayMediaTicketSchema, gatewayMediaReceiptSchema } from './gateway-media-schema.ts';
import type { GatewayMediaTicket, GatewayMediaReceipt } from './gateway-media-schema.ts';

export class GatewayMediaError extends Error { constructor(readonly code: 'UNAVAILABLE' | 'EXPIRED' | 'BUSY' | 'DIRECTORY' | 'FILE' | 'LIMIT' | 'CANCELLED') { super(code); this.name = 'GatewayMediaError'; } }
type Ticket = { view: GatewayMediaTicket; url: string; generation: number };
const inside = (root: string, path: string): boolean => { const value = relative(root, path); return !!value && !isAbsolute(value) && value !== '..' && !value.startsWith('../') && !value.startsWith('..\\'); };
const identity = (path: string): string => { const info = statSync(path, { bigint: true }); return `${info.dev}:${info.ino}`; };

/** Explicit exports only. Source capabilities live in memory; receipts retain
 * the user's output path/hash but never the URL or a copy of generated content.
 */
export class GatewayMedia {
  private readonly root: string;
  private readonly rootIdentity: string;
  private readonly db: DatabaseSync;
  private readonly backupSource:OwnedDatabaseSource|null;
  private readonly tickets = new Map<string, Ticket>();
  private readonly completed = new Map<string, GatewayMediaReceipt>();
  private active?: { id: string; folder: string; controller: AbortController; promise: Promise<GatewayMediaReceipt> };
  private generation = 0;
  private closed = false;
  constructor(root: string, private readonly sources: (id: string) => Promise<string[]>, private readonly taskExists: (id: string) => boolean, private readonly now = Date.now) {
    mkdirSync(root, { recursive: true }); this.root = realpathSync.native(root); this.rootIdentity = identity(this.root);
    const opened=openOwnedDatabase(this.owned(join(this.root,'receipts.sqlite')));this.db=opened.db;this.backupSource=opened.source;this.db.exec('PRAGMA busy_timeout=3000');
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    if (version > 1) { this.db.close(); throw new GatewayMediaError('UNAVAILABLE'); }
    this.db.exec('CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,receipt TEXT NOT NULL); PRAGMA user_version=1;');
  }
  backupSourceIdentity():OwnedDatabaseSource|null{return this.backupSource?{...this.backupSource}:null;}
  private owned(path: string): string {
    const target = resolve(path);
    if (!inside(this.root, target) || lstatSync(this.root).isSymbolicLink() || identity(this.root) !== this.rootIdentity) throw new GatewayMediaError('FILE');
    for (let cursor = target; cursor !== this.root; cursor = dirname(cursor)) {
      let info; try { info = lstatSync(cursor); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      if (info.isSymbolicLink() || !inside(this.root, realpathSync.native(cursor))) throw new GatewayMediaError('FILE');
    }
    return target;
  }
  list(): GatewayMediaReceipt[] {
    if (this.closed) return [];
    return this.db.prepare('SELECT receipt FROM receipts ORDER BY rowid DESC LIMIT 100').all().map(row => { if (typeof row.receipt !== 'string' || row.receipt.length > 32768) throw new GatewayMediaError('FILE'); return gatewayMediaReceiptSchema.parse(JSON.parse(row.receipt)); });
  }
  receipt(id: string): GatewayMediaReceipt | undefined {
    if (this.closed) return;
    const cached = this.completed.get(id); if (cached) return { ...cached };
    const row = this.db.prepare('SELECT receipt FROM receipts WHERE id=?').get(id); if (!row) return;
    if (typeof row.receipt !== 'string' || row.receipt.length > 32768) throw new GatewayMediaError('FILE');
    const receipt = gatewayMediaReceiptSchema.parse(JSON.parse(row.receipt)); if (receipt.id !== id) throw new GatewayMediaError('FILE'); return receipt;
  }
  forget(id: string): void { this.db.prepare('DELETE FROM receipts WHERE id=?').run(id); this.completed.delete(id); }
  async preview(taskRecordId: string): Promise<GatewayMediaTicket[]> {
    if (this.closed || this.active || !this.taskExists(taskRecordId)) throw new GatewayMediaError('UNAVAILABLE');
    const generation = this.generation, sources = await this.sources(taskRecordId);
    if (this.closed || generation !== this.generation || !this.taskExists(taskRecordId)) throw new GatewayMediaError('UNAVAILABLE');
    for (const [id, ticket] of this.tickets) if (ticket.view.taskRecordId === taskRecordId || Date.parse(ticket.view.expiresAt) <= this.now()) this.tickets.delete(id);
    if (sources.length > 100 || this.tickets.size + sources.length > 300) throw new GatewayMediaError('LIMIT');
    return sources.map((url, index) => {
      let parsed; try { parsed = new URL(url); } catch { throw new GatewayMediaError('UNAVAILABLE'); }
      const view = gatewayMediaTicketSchema.parse({ id: randomUUID(), taskRecordId, ordinal: index + 1, sourceHost: parsed.hostname, expiresAt: new Date(this.now() + 300000).toISOString() });
      this.tickets.set(view.id, { view, url, generation }); return view;
    });
  }
  save(id: string, folder: string): Promise<GatewayMediaReceipt> {
    if (this.closed) return Promise.reject(new GatewayMediaError('UNAVAILABLE'));
    if (folder.startsWith('"') && folder.endsWith('"')) folder = folder.slice(1, -1);
    if (!isAbsolute(folder) || /^(?:\\\\|\/\/)/.test(folder) || process.platform === 'win32' && !/^[A-Za-z]:[\\/]/.test(folder) || folder.includes('\0')) return Promise.reject(new GatewayMediaError('DIRECTORY'));
    const stored = this.db.prepare('SELECT receipt FROM receipts WHERE id=?').get(id);
    const completed = this.completed.get(id) ?? (typeof stored?.receipt === 'string' ? gatewayMediaReceiptSchema.parse(JSON.parse(stored.receipt)) : undefined);
    if (completed) {
      try { if (!existsSync(completed.path) || realpathSync.native(folder) !== dirname(completed.path)) throw new GatewayMediaError('FILE'); return Promise.resolve(completed); }
      catch { return Promise.reject(new GatewayMediaError('FILE')); }
    }
    if (this.active?.id === id && this.active.folder === folder) return this.active.promise;
    if (this.active) return Promise.reject(new GatewayMediaError('BUSY'));
    const ticket = this.tickets.get(id);
    if (!ticket || ticket.generation !== this.generation || Date.parse(ticket.view.expiresAt) <= this.now() || !this.taskExists(ticket.view.taskRecordId)) return Promise.reject(new GatewayMediaError('EXPIRED'));
    const controller = new AbortController(), promise = this.export(ticket, folder, controller.signal);
    this.active = { id, folder, controller, promise };
    void promise.finally(() => { if (this.active?.promise === promise) this.active = undefined; }).catch(() => {}); return promise;
  }
  private async export(ticket: Ticket, folder: string, signal: AbortSignal): Promise<GatewayMediaReceipt> {
    let stage: string | undefined;
    try {
      if (folder.length > 4096) throw new GatewayMediaError('DIRECTORY');
      try { const info = lstatSync(folder); if (!info.isDirectory() || info.isSymbolicLink()) throw new GatewayMediaError('DIRECTORY'); }
      catch { throw new GatewayMediaError('DIRECTORY'); }
      const destination = realpathSync.native(folder), destinationIdentity = identity(destination);
      const check = (): void => { if (lstatSync(folder).isSymbolicLink() || realpathSync.native(folder) !== destination || identity(destination) !== destinationIdentity) throw new GatewayMediaError('DIRECTORY'); };
      if (Number(this.db.prepare('SELECT COUNT(*) AS count FROM receipts').get()?.count) >= 500) throw new GatewayMediaError('LIMIT');
      const staging = this.owned(join(this.root, 'staging')); mkdirSync(staging, { recursive: true });
      if (readdirSync(staging).length >= 10) throw new GatewayMediaError('LIMIT');
      stage = mkdtempSync(this.owned(join(staging, 'transfer-'))); const temporary = this.owned(join(stage, 'content.part'));
      const result = await downloadMedia(ticket.url, temporary, signal, undefined, () => { this.owned(temporary); });
      if (signal.aborted || this.closed || ticket.generation !== this.generation || !this.taskExists(ticket.view.taskRecordId)) throw new GatewayMediaError('CANCELLED');
      check(); this.owned(temporary); if (!lstatSync(temporary).isFile() || lstatSync(temporary).isSymbolicLink()) throw new GatewayMediaError('FILE');
      const path = join(destination, `dsh-zhen-${ticket.view.id}.${result.extension}`);
      await copyFile(temporary, path, constants.COPYFILE_EXCL); check();
      const before = lstatSync(path, { bigint: true }); if (!before.isFile() || before.isSymbolicLink() || Number(before.size) !== result.bytes) throw new GatewayMediaError('FILE');
      const handle = await open(path, 'r'), digest = createHash('sha256'); let size = 0;
      try {
        const opened = await handle.stat({ bigint: true }); if (opened.dev !== before.dev || opened.ino !== before.ino) throw new GatewayMediaError('FILE');
        for await (const chunk of handle.createReadStream({ autoClose: false })) { size += chunk.length; if (size > result.bytes) throw new GatewayMediaError('FILE'); digest.update(chunk); }
        const after = await handle.stat({ bigint: true }); if (after.size !== before.size || after.mtimeNs !== before.mtimeNs) throw new GatewayMediaError('FILE');
      } finally { await handle.close(); }
      check(); if (size !== result.bytes || digest.digest('hex') !== result.sha256) throw new GatewayMediaError('FILE');
      const receipt = gatewayMediaReceiptSchema.parse({ id: ticket.view.id, taskRecordId: ticket.view.taskRecordId, ordinal: ticket.view.ordinal, path, bytes: result.bytes, sha256: result.sha256, mime: result.mime, savedAt: new Date(this.now()).toISOString(), recorded: true });
      try { this.db.prepare('INSERT INTO receipts VALUES(?,?)').run(receipt.id, JSON.stringify(receipt)); }
      catch { receipt.recorded = false; }
      this.completed.set(receipt.id, receipt); while (this.completed.size > 100) this.completed.delete(this.completed.keys().next().value!);
      this.tickets.delete(receipt.id); return receipt;
    } catch (error) { throw error instanceof GatewayMediaError || error instanceof MediaDownloadError ? error : new GatewayMediaError((error as NodeJS.ErrnoException).code === 'EEXIST' ? 'FILE' : 'UNAVAILABLE'); }
    finally { if (stage && existsSync(stage)) rmSync(this.owned(stage), { recursive: true, force: true }); }
  }
  cancel(id: string): void { if (this.active?.id === id) this.active.controller.abort(); }
  revokeTask(id: string): void { for (const [key, ticket] of this.tickets) if (ticket.view.taskRecordId === id) { this.cancel(key); this.tickets.delete(key); } }
  invalidate(): void { this.generation++; this.tickets.clear(); this.active?.controller.abort(); }
  async close(): Promise<void> { if (this.closed) return; this.closed = true; this.invalidate(); await this.active?.promise.catch(() => {}); this.completed.clear(); this.db.close(); }
}
