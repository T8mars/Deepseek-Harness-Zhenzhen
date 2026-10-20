import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PreparedLlmCall } from '@deepseek-ai/dsh-llm';
import { GATEWAY_CHECK_POLICY, GATEWAY_CHECK_MODEL, GATEWAY_CHECK_PROMPT, gatewayCheckCodeSchema, gatewayCheckReceiptSchema } from './gateway-check-schema.ts';
import type { GatewayCheckReceipt, GatewayCheckPreview } from './gateway-check-schema.ts';

const MAX_RECEIPTS = 100;
const finiteCount = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
type Prepare = (signal: AbortSignal) => Promise<PreparedLlmCall>;
type Pending = { prepared: PreparedLlmCall; expires: number };

/** One explicit short paid check, never a background task or an Agent tool.
 * Receipts contain fixed request facts and counts, never credentials/replies.
 */
export class GatewayChecks {
  private readonly db: DatabaseSync;
  private readonly owner = randomUUID();
  private readonly pending = new Map<string, Pending>();
  private readonly active = new Map<string, { controller: AbortController; task: Promise<GatewayCheckReceipt> }>();
  private generation = 0;
  private preparing = false;
  private closing = false;
  constructor(file: string, private readonly prepare: Prepare, private readonly now = Date.now) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    if (version > 1) { this.db.close(); throw new Error('请升级应用后再读取连接检查记录。'); }
    this.db.exec('CREATE TABLE IF NOT EXISTS checks(id TEXT PRIMARY KEY,owner TEXT NOT NULL,created INTEGER NOT NULL,state TEXT NOT NULL,receipt TEXT NOT NULL); PRAGMA user_version=1;');
  }
  private save(receipt: GatewayCheckReceipt, insert = false): void {
    const text = JSON.stringify(gatewayCheckReceiptSchema.parse(receipt));
    if (insert) this.db.prepare('INSERT INTO checks VALUES(?,?,?,?,?)').run(receipt.id, this.owner, this.now(), receipt.state, text);
    else this.db.prepare('UPDATE checks SET state=?,receipt=? WHERE id=? AND owner=?').run(receipt.state, text, receipt.id, this.owner);
  }
  private get(id: string): GatewayCheckReceipt {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('检查记录无效。');
    const row = this.db.prepare('SELECT owner,receipt FROM checks WHERE id=?').get(id);
    if (!row || typeof row.receipt !== 'string' || row.receipt.length > 4096) throw new Error('检查记录不可用。');
    const value = gatewayCheckReceiptSchema.parse(JSON.parse(row.receipt));
    if (value.state === 'running' && (row.owner !== this.owner || !this.active.has(id))) return { ...value, state: 'untracked' };
    if (value.state === 'preview' && (row.owner !== this.owner || !this.pending.has(id) || this.now() >= Date.parse(value.expiresAt))) {
      this.pending.delete(id);
      return { ...value, state: 'expired' };
    }
    return value;
  }
  list(): GatewayCheckReceipt[] {
    return this.db.prepare('SELECT id FROM checks ORDER BY created DESC,id DESC LIMIT 10').all().map(row => this.get(String(row.id)));
  }
  async preview(): Promise<GatewayCheckPreview> {
    if (this.closing || this.preparing || this.active.size) throw new Error('请先等待或停止当前连接检查。');
    this.preparing = true;
    const generation = this.generation;
    try {
      for (const [id, value] of this.pending) if (value.expires <= this.now()) this.pending.delete(id);
      if (this.pending.size >= 10) throw new Error('尚有未确认的检查，请先取消旧检查。');
      const prepared = await this.prepare(AbortSignal.timeout(10000));
      if (this.closing || generation !== this.generation) throw new Error('连接配置已变化，请重新准备检查。');
      if (prepared.config.provider !== 'seedance' || prepared.config.model !== GATEWAY_CHECK_MODEL || prepared.config.maxTokens !== 32) throw new Error('检查路由与固定请求不匹配。');
      const receipt: GatewayCheckReceipt = { id: randomUUID(), policy: GATEWAY_CHECK_POLICY, provider: 'seedance', model: GATEWAY_CHECK_MODEL, maxTokens: 32,
        createdAt: new Date(this.now()).toISOString(), expiresAt: new Date(this.now() + 300000).toISOString(), finishedAt: '', state: 'preview', code: '', textDeltas: 0, inputTokens: null, outputTokens: null };
      // Delete only this component's oldest metadata; never a user conversation.
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.prepare("UPDATE checks SET state='expired',receipt=json_set(receipt,'$.state','expired') WHERE state='preview' AND created<=?").run(this.now() - 300000);
        this.db.prepare(`DELETE FROM checks WHERE id IN (SELECT id FROM checks WHERE state NOT IN ('preview','running') ORDER BY created DESC,id DESC LIMIT -1 OFFSET 80)`).run();
        if (Number(this.db.prepare('SELECT COUNT(*) AS n FROM checks').get()?.n) >= MAX_RECEIPTS) throw new Error('检查记录已达上限，请联系维护者处理记录。');
        this.save(receipt, true); this.db.exec('COMMIT');
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
      this.pending.set(receipt.id, { prepared, expires: Date.parse(receipt.expiresAt) });
      return { receipt, prompt: GATEWAY_CHECK_PROMPT };
    } finally { this.preparing = false; }
  }
  async run(id: string, confirmation: string): Promise<GatewayCheckReceipt> {
    if (confirmation !== GATEWAY_CHECK_POLICY || this.closing) throw new Error('请先阅读并确认这次短消息检查。');
    const receipt = this.get(id);
    if (receipt.state !== 'preview') return receipt; // A consumed receipt can never dispatch again.
    if (this.active.size) throw new Error('已有连接检查正在进行。');
    const pending = this.pending.get(id);
    if (!pending || pending.expires <= this.now()) return { ...receipt, state: 'expired' };
    const claimed = { ...receipt, state: 'running' as const };
    // Persist the claim BEFORE dispatch. Failure means no request. A crash after
    // this point leaves a spent, untracked receipt, never a retryable preview.
    this.save(claimed);
    this.pending.delete(id);
    const controller = new AbortController();
    const task = this.execute(claimed, pending.prepared, controller);
    this.active.set(id, { controller, task });
    try { return await task; } finally { this.active.delete(id); }
  }
  private async execute(receipt: GatewayCheckReceipt, prepared: PreparedLlmCall, controller: AbortController): Promise<GatewayCheckReceipt> {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]);
    let result = { ...receipt };
    let chars = 0, payloadChars = 0, events = 0, finished = false;
    try {
      for await (const chunk of prepared.stream({ ...prepared.config, messages: [{ role: 'user', content: [{ type: 'text', text: GATEWAY_CHECK_PROMPT }] }], signal })) {
        signal.throwIfAborted();
        if (++events > 4096) { result.code = 'RESPONSE_LIMIT'; controller.abort(); break; }
        if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') {
          payloadChars += chunk.text.length;
          if (payloadChars > 4096) { result.code = 'RESPONSE_LIMIT'; controller.abort(); break; }
        }
        if (chunk.type === 'text-delta') {
          chars += chunk.text.length;
          result.textDeltas++;
          if (chars > 4096 || result.textDeltas > 2048) { result.textDeltas = Math.min(result.textDeltas, 2048); result.code = 'RESPONSE_LIMIT'; controller.abort(); break; }
        } else if (chunk.type === 'usage') {
          result.inputTokens = finiteCount(chunk.usage.inputTokens); result.outputTokens = finiteCount(chunk.usage.outputTokens);
        } else if (chunk.type === 'finish') {
          finished = true;
          if (chunk.reason.kind === 'stop' && chars > 0) { result.state = 'passed'; result.code = ''; }
          else if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
            const code = gatewayCheckCodeSchema.safeParse(chunk.reason.failure.code);
            result.state = 'failed'; result.code = code.success && code.data ? code.data : 'UNAVAILABLE';
          } else { result.state = 'incomplete'; result.code = 'INCOMPLETE'; }
          break;
        }
      }
      if (!finished && result.code !== 'RESPONSE_LIMIT') { result.state = 'incomplete'; result.code = 'INCOMPLETE'; }
    } catch (error) {
      result.state = 'failed';
      const code = gatewayCheckCodeSchema.safeParse(error && typeof error === 'object' && 'code' in error ? error.code : '');
      if (result.code !== 'RESPONSE_LIMIT') result.code = code.success && code.data ? code.data : 'UNAVAILABLE';
    }
    if (result.code === 'RESPONSE_LIMIT') result.state = 'failed';
    else if (controller.signal.aborted) { result.state = 'cancelled'; result.code = 'CANCELLED'; }
    else if (signal.aborted) { result.state = 'failed'; result.code = 'TIMEOUT'; }
    result.finishedAt = new Date(this.now()).toISOString();
    this.save(result);
    return result;
  }
  cancel(id: string): GatewayCheckReceipt {
    const receipt = this.get(id);
    const running = this.active.get(id);
    if (running) { running.controller.abort(); return { ...receipt, state: 'running' }; }
    if (receipt.state === 'preview') {
      this.pending.delete(id);
      const cancelled = { ...receipt, state: 'cancelled' as const, code: 'CANCELLED' as const, finishedAt: new Date(this.now()).toISOString() };
      this.save(cancelled); return cancelled;
    }
    return receipt;
  }
  invalidate(): void {
    this.generation++;
    for (const id of [...this.pending.keys()]) this.cancel(id);
    for (const item of this.active.values()) item.controller.abort();
  }
  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true; this.invalidate();
    await Promise.allSettled([...this.active.values()].map(item => item.task));
    this.db.close();
  }
}
