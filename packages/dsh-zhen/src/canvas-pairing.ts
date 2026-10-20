import { mkdirSync, lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CanvasBridge, CanvasError, inspectCanvasCli } from './canvas.ts';
import type { CanvasConfig, CanvasPairingRuntime } from './canvas.ts';
import { canvasReadScopes, canvasHandoffScopes, canvasPairingSchema } from './canvas-pairing-schema.ts';
import type { CanvasPairingView } from './canvas-pairing-schema.ts';

const locatorSchema = z.object({ schemaVersion: z.literal(1), root: z.string().max(4096), digest: z.string().regex(/^[a-f0-9]{64}$/), configuredInstance: z.string().max(128), instanceId: z.string().max(128), origin: z.string().max(200), pairingId: z.uuid(), expiresAt: z.iso.datetime(), handoff: z.boolean(), writable: z.boolean().default(false), runnable: z.boolean().default(false), assetTransfer: z.boolean().default(false) }).strict();
type Locator = z.infer<typeof locatorSchema>;
const pendingSchema = z.object({ pairingId: z.uuid(), pollSecret: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/), userCode: z.string().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/), clientName: z.literal('DSH-zhen'), agentKind: z.literal('dsh-zhen'), requestedScopes: z.array(z.string()).max(7), expiresAt: z.iso.datetime(), status: z.literal('pending') }).strict();
const claimedSchema = z.object({ pairingId: z.uuid(), status: z.literal('approved'), accessToken: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/), sessionId: z.uuid(), expiresAt: z.iso.datetime() }).strict();
const publicScopes = (handoff: boolean, writable = false, runnable = false, assetTransfer = false): CanvasPairingView['scopes'] => [...canvasReadScopes, ...(handoff ? canvasHandoffScopes : assetTransfer ? ['asset:transfer' as const] : []), ...(writable ? ['canvas:write' as const] : []), ...(runnable ? ['run:execute' as const] : [])];
const view = (state: CanvasPairingView['state'], message: string, extra: Partial<CanvasPairingView> = {}): CanvasPairingView => canvasPairingSchema.parse({ state, message, userCode: '', expiresAt: '', scopes: [], ...extra });

/** A non-secret locator binds only this UI's pairing to the original CLI store.
 * Poll secrets and access tokens never enter this file, Remote results or MCP. */
export class CanvasPairing {
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private starting?: Promise<CanvasPairingView>;
  private completing?: Promise<CanvasPairingView>;
  constructor(private readonly file: string, private readonly configured: () => CanvasConfig | undefined) {}
  close(): void { this.closed = true; }
  private serial(work: () => Promise<CanvasPairingView>): Promise<CanvasPairingView> {
    const next = this.queue.catch(() => {}).then(work); this.queue = next; return next;
  }
  private current(config: CanvasConfig): void {
    const now = this.configured();
    if (this.closed || !now || now.root !== config.root || now.digest !== config.digest || now.instance !== config.instance) throw new CanvasError('CANVAS_CONFIG_CHANGED', '画布连接已变化，请重新检查配对。');
    if (inspectCanvasCli(now.root, now.instance).digest !== now.digest) throw new CanvasError('CLI_CHANGED', '画布 CLI 已变化，请重新审阅连接。');
  }
  private async binding(): Promise<{ config: CanvasConfig; runtime: CanvasPairingRuntime }> {
    const config = this.configured();
    if (!config) throw new CanvasError('CANVAS_NOT_CONFIGURED', '请先信任并连接本机画布工具。');
    this.current(config);
    const runtime = await new CanvasBridge(config).pairingRuntime();
    this.current(config);
    return { config, runtime };
  }
  private read(): Locator | undefined {
    try {
      const info = lstatSync(this.file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 16384) throw new Error('invalid');
      const bytes = readFileSync(this.file); if (bytes.length > 16384) throw new Error('invalid');
      return locatorSchema.parse(JSON.parse(bytes.toString('utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw new CanvasError('PAIRING_RECORD_INVALID', '本机配对进度记录不可用，请在画布处理已有配对后修复连接。');
    }
  }
  private save(locator: Locator): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify(locatorSchema.parse(locator)) + '\n', { mode: 0o600, flag: 'wx' }); renameSync(temporary, this.file); }
    finally { try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
  }
  private clear(locator: Locator): void {
    if (JSON.stringify(this.read()) !== JSON.stringify(locator)) throw new CanvasError('PAIRING_RECORD_CHANGED', '配对进度已变化，请重新检查。');
    unlinkSync(this.file);
  }
  private own(config: CanvasConfig, runtime: CanvasPairingRuntime): Locator | undefined {
    const locator = this.read();
    return locator && locator.root === config.root && locator.digest === config.digest && locator.configuredInstance === config.instance && locator.instanceId === runtime.instance.instanceId && locator.origin === runtime.instance.origin ? locator : undefined;
  }
  private pending(locator: Locator, runtime: CanvasPairingRuntime): CanvasPairingView | undefined {
    const pending = runtime.store.configuredInstances().pending.find(item => item.instanceId === locator.instanceId && item.origin === locator.origin && item.pairingId === locator.pairingId && item.expiresAt === locator.expiresAt);
    if (!pending) return undefined;
    return view('pending', '核对下方验证码，在画布窗口选择权限并批准，然后点击“完成配对”。', { userCode: pending.userCode, expiresAt: pending.expiresAt, scopes: publicScopes(locator.handoff, locator.writable, locator.runnable, locator.assetTransfer) });
  }
  private requirePending(locator: Locator, runtime: CanvasPairingRuntime) {
    const pending = runtime.store.loadPending(runtime.instance.instanceId);
    if (!pending || pending.pairingId !== locator.pairingId || pending.origin !== locator.origin || pending.expiresAt !== locator.expiresAt || !/^[A-Za-z0-9_-]{43,128}$/.test(pending.pollSecret)) throw new CanvasError('PAIRING_PROGRESS_CHANGED', 'CLI 中的配对进度已变化，未领取其他请求的凭据。');
    return pending;
  }
  private async session(config: CanvasConfig, runtime: CanvasPairingRuntime): Promise<CanvasPairingView> {
    const session = runtime.store.loadSession(runtime.instance.instanceId);
    if (!session || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) return view('none', '尚未保存有效配对，可从这里发起连接。');
    if (session.origin !== runtime.instance.origin) throw new CanvasError('PAIRING_ORIGIN_CHANGED', '保存的配对与当前画布地址不同，请在画布重新配对。');
    const result = await runtime.client.requestAgentControl(runtime.instance, '/api/agent-control/v1/session', { accessToken: session.accessToken });
    this.current(config);
    if (result.data.sessionId !== session.sessionId || result.data.agentKind === undefined) throw new CanvasError('PAIRING_SESSION_INVALID', '画布返回的配对身份不一致。');
    const scopes = z.array(canvasPairingSchema.shape.scopes.element).max(7).parse(result.data.scopes);
    return view('paired', '已通过画布验证配对。业务操作继续使用画布授予的权限。', { expiresAt: z.iso.datetime().parse(result.data.expiresAt), scopes });
  }
  snapshot(): Promise<CanvasPairingView> { return this.serial(async () => {
    const { config, runtime } = await this.binding(), locator = this.own(config, runtime);
    if (locator) { const pending = this.pending(locator, runtime); if (pending) return pending; }
    const session = await this.session(config, runtime);
    return session.state !== 'paired' && locator && Date.parse(locator.expiresAt) <= Date.now() ? view('expired', '配对验证码已过期，可重新发起配对。') : session;
  }); }
  begin(handoff = false, writable = false, runnable = false, assetTransfer = false): Promise<CanvasPairingView> {
    if (this.starting) return this.starting;
    const task = this.serial(async () => {
    const { config, runtime } = await this.binding(), locator = this.own(config, runtime);
    if (locator && Date.parse(locator.expiresAt) > Date.now()) {
      const pending = this.pending(locator, runtime); if (pending) return pending;
    }
    if (runtime.store.configuredInstances().pending.some(item => item.instanceId === runtime.instance.instanceId && Date.parse(item.expiresAt) > Date.now())) throw new CanvasError('PAIRING_ALREADY_PENDING', '画布已有另一项待确认配对，请先在画布完成或拒绝该请求。');
    const scopes = publicScopes(handoff, writable, runnable, assetTransfer);
    const result = await runtime.client.requestAgentControl(runtime.instance, '/api/agent-control/v1/pairings', { method: 'POST', body: { clientName: 'DSH-zhen', agentKind: 'dsh-zhen', requestedScopes: scopes } });
    this.current(config);
    const pairing = pendingSchema.parse(result.data);
    if (JSON.stringify(pairing.requestedScopes) !== JSON.stringify(scopes) || Date.parse(pairing.expiresAt) <= Date.now() || Date.parse(pairing.expiresAt) > Date.now() + 16 * 60 * 1000) throw new CanvasError('PAIRING_RESPONSE_INVALID', '画布返回的配对范围或有效期不一致。');
    if (runtime.store.configuredInstances().pending.some(item => item.instanceId === runtime.instance.instanceId && Date.parse(item.expiresAt) > Date.now())) throw new CanvasError('PAIRING_PROGRESS_CHANGED', '另一项配对同时到达，请先在画布处理待确认连接。');
    runtime.store.storePending(runtime.instance, pairing);
    this.save({ schemaVersion: 1, root: config.root, digest: config.digest, configuredInstance: config.instance, instanceId: runtime.instance.instanceId, origin: runtime.instance.origin, pairingId: pairing.pairingId, expiresAt: pairing.expiresAt, handoff, writable, runnable, assetTransfer });
    return view('pending', '核对验证码，并在画布窗口批准连接。', { userCode: pairing.userCode, expiresAt: pairing.expiresAt, scopes });
    });
    this.starting = task;
    void task.then(() => { if (this.starting === task) this.starting = undefined; }, () => { if (this.starting === task) this.starting = undefined; });
    return task;
  }
  complete(): Promise<CanvasPairingView> {
    if (this.completing) return this.completing;
    const task = this.serial(async () => {
    const { config, runtime } = await this.binding(), locator = this.own(config, runtime);
    if (!locator) return this.session(config, runtime);
    if (!runtime.store.loadPending(runtime.instance.instanceId)) {
      const session = await this.session(config, runtime);
      if (session.state === 'paired') { this.clear(locator); return session; }
    }
    if (Date.parse(locator.expiresAt) <= Date.now()) return view('expired', '配对验证码已过期，可重新发起配对。');
    const pending = this.requirePending(locator, runtime);
    const result = await runtime.client.requestAgentControl(runtime.instance, `/api/agent-control/v1/pairings/${encodeURIComponent(locator.pairingId)}/poll`, { method: 'POST', body: { pollSecret: pending.pollSecret } });
    this.current(config);
    if (result.data.pairingId !== locator.pairingId) throw new CanvasError('PAIRING_RESPONSE_INVALID', '画布返回的配对身份不一致。');
    if (result.data.status === 'pending') return this.pending(locator, runtime) ?? view('none', '配对进度已变化，请重新检查。');
    this.requirePending(locator, runtime);
    const expected = { expectedPairingId: locator.pairingId, expectedOrigin: locator.origin };
    if (result.data.status === 'denied') { runtime.store.deletePending(runtime.instance.instanceId, expected); this.clear(locator); return view('denied', '画布已拒绝此连接。需要时可重新发起配对。'); }
    if (result.data.status === 'issued') { runtime.store.deletePending(runtime.instance.instanceId, expected); this.clear(locator); return view('none', '配对凭据已领取或失效。可重新发起配对，并在画布重新确认。'); }
    if (result.data.status !== 'approved') throw new CanvasError('PAIRING_RESPONSE_INVALID', '画布返回的配对状态无法识别。');
    const claimed = claimedSchema.parse(result.data);
    if (Date.parse(claimed.expiresAt) <= Date.now()) throw new CanvasError('PAIRING_EXPIRED', '返回的配对已过期。');
    runtime.store.storeSession(runtime.instance, claimed);
    this.clear(locator);
    return this.session(config, runtime);
    });
    this.completing = task;
    void task.then(() => { if (this.completing === task) this.completing = undefined; }, () => { if (this.completing === task) this.completing = undefined; });
    return task;
  }
}
