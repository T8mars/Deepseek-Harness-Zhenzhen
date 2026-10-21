import { createRequire } from 'node:module';
import {readCanvasActiveContext} from './canvas-active-context.ts';
import {assertCanvasTargetConnection,canvasTargetRuntime} from './canvas-target-binding.ts';
import { createHash, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { canvasPlanRequest, canvasInspectionRequest, canvasInspectionResultSchema, canvasToolCatalogSchema, projectCanvasSurfaces, sameCanvasCatalog, canvasPlanResultSchema } from './canvas-contract.ts';
import type { CanvasPlanRequest, CanvasInspectionRequest, CanvasToolCatalog } from './canvas-contract.ts';
import {canvasConnectionCheckSchema} from './canvas-setup-schema.ts';
import type {CanvasConnectionCheck} from './canvas-setup-schema.ts';

export interface CanvasConfig { root: string; digest: string; instance: string; }
export interface CanvasConnection { configured: boolean; root: string; digest: string; instance?: string; connected: boolean; code: string; message: string; compat: unknown; }
type Instance = { instanceId: string; origin: string; appVersion?: string };
type CliClient = { selectInstance(id: string, options?: {discoveryOptions?: {fetch?: typeof globalThis.fetch}}): Promise<Instance>; requestAgentControl(instance: Instance, path: string, options?: { accessToken?: string; method?: 'POST'; body?: unknown; timeoutMs?: number; fetch?: typeof globalThis.fetch }): Promise<{ data: Record<string, unknown>; ok: boolean }> };
type CliDiscovery = { discoverInstances(options?: {fetch?: typeof globalThis.fetch}): Promise<Instance[]> };
type CliStore = { loadSession(id: string): { accessToken: string; expiresAt: string } | null };
export interface CanvasPairingRuntime {
  instance: Instance;
  client: CliClient;
  store: {
    configuredInstances(): { pending: Array<{ instanceId: string; origin: string; pairingId: string; userCode: string; expiresAt: string }> };
    loadPending(id: string): { origin: string; pairingId: string; pollSecret: string; userCode: string; expiresAt: string } | null;
    storePending(instance: Instance, pairing: Record<string, unknown>): unknown;
    deletePending(id: string, options?: { expectedPairingId: string; expectedOrigin: string }): unknown;
    loadSession(id: string): { origin?: string; sessionId?: string; accessToken: string; expiresAt: string } | null;
    storeSession(instance: Instance, session: Record<string, unknown>): unknown;
  };
}
export interface CanvasWorkflowRuntime {
  instance: Instance; client: CliClient; accessToken: string; sessionId: string; actorId: string; scopes: string[];
  store: CanvasPairingRuntime['store'] & {
    storeApproval(instance: Instance, approval: Record<string, unknown>): unknown;
    loadApproval(instanceId: string, approvalId: string): Record<string, unknown> | null;
    deleteApproval(instanceId: string, approvalId: string): unknown;
  };
}
export type CanvasOperation = 'status' | 'capabilities' | 'workspaces' | 'active-context' | 'models' | 'capability-graph' | 'capability-tools' | 'task' | 'creator-session';
const loadedCliDigests = new Map<string, string>();
// These public CLI fetch hooks only send loopback GET/POST JSON. A fresh Agent
// avoids even borrowing an idle socket left in a shared fetch pool. Preserve the
// CLI's auth/protocol/response checks and its abort signal; never retry a POST.
const canvasControlFetch: typeof globalThis.fetch = async (input, options) => {
  if (!(typeof input === 'string' || input instanceof URL) || (options?.body != null && typeof options.body !== 'string')) throw new TypeError('Canvas transport input refused.');
  const url = new URL(String(input)), method = options?.method ?? 'GET';
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || !['GET','POST'].includes(method) || options?.redirect !== 'error') throw new TypeError('Canvas transport destination refused.');
  const headers = new Headers(options?.headers); headers.set('connection', 'close'); headers.set('accept-encoding', 'identity');
  return new Promise<Response>((resolve, reject) => {
    const request = httpRequest(url, { method, headers: Object.fromEntries(headers), agent: false, signal: options?.signal ?? undefined }, response => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status > 599 || ([301,302,303,307,308].includes(status) && response.headers.location)) { response.destroy(); reject(new TypeError('Canvas transport response refused.')); return; }
      const parts: Buffer[] = []; let bytes = 0, settled = false;
      const finish = () => {
        if (settled) return; settled = true;
        try {
          const resultHeaders = new Headers(); for (const [key,value] of Object.entries(response.headers)) if (value !== undefined) resultHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
          resolve(new Response([204,205,304].includes(status) ? null : Buffer.concat(parts), { status, headers: resultHeaders }));
        } catch { response.destroy(); reject(new TypeError('Canvas transport response refused.')); }
      };
      response.on('data', (chunk: Buffer) => {
        // Return at most one byte over the original CLI limit so its existing
        // length check reports the native error before attempting JSON parsing.
        const remaining = 256 * 1024 + 1 - bytes;
        if (remaining > 0) { const part = chunk.subarray(0, remaining); parts.push(part); bytes += part.length; }
        if (bytes > 256 * 1024) { finish(); response.destroy(); }
      });
      response.once('end', finish); response.once('error', reject);
    });
    request.once('error', reject);
    request.once('upgrade', (_response, socket) => { socket.destroy(); reject(new TypeError('Canvas transport upgrade refused.')); });
    request.end(options?.body ?? undefined);
  });
};

export class CanvasError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

/** Fingerprint a user-selected, already installed CLI, including its complete resource closure. */
export function inspectCanvasCli(path: string, instance = ''): CanvasConfig {
  if (!isAbsolute(path) || path.length > 4096 || !/^[A-Za-z0-9._-]{0,128}$/.test(instance)) throw new CanvasError('CLI_PATH_INVALID', '请选择本机 zcanvas-cli 的绝对目录。');
  const root = realpathSync.native(path);
  const manifestPath = join(root, 'manifest.json');
  if (lstatSync(manifestPath).size > 65536) throw new CanvasError('CLI_MANIFEST_INVALID', 'CLI 清单过大。');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.schema !== 't8-zcanvas-manifest-v1' || manifest.controlProtocol !== 't8-agent-control-v1') throw new CanvasError('CLI_MANIFEST_INVALID', '请选择受支持的画布 CLI 目录。');
  const hash = createHash('sha256');
  let files = 0, bytes = 0;
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const full = join(directory, name), stat = lstatSync(full);
      if (stat.isSymbolicLink()) throw new CanvasError('CLI_LINK_REFUSED', 'CLI 目录含符号链接，请选择完整的已安装版本。');
      if (stat.isDirectory()) { if (name === 'node_modules' || name === '.git') throw new CanvasError('CLI_DIRECTORY_INVALID', '请选择 zcanvas-cli 子目录。'); walk(full); }
      else if (stat.isFile()) {
        if (++files > 512 || (bytes += stat.size) > 40 * 1024 * 1024) throw new CanvasError('CLI_DIRECTORY_INVALID', 'CLI 文件超出支持范围。');
        const data = readFileSync(full);
        hash.update(relative(root, full).replaceAll('\\', '/')).update('\0').update(String(data.length)).update('\0').update(data);
      } else throw new CanvasError('CLI_DIRECTORY_INVALID', 'CLI 文件类型不支持。');
    }
  };
  walk(root);
  for (const file of ['src/agentClient.cjs', 'src/discovery.cjs', 'src/secureStore.cjs']) if (!lstatSync(join(root, file)).isFile()) throw new CanvasError('CLI_INCOMPLETE', 'CLI 安装不完整。');
  return { root, digest: hash.digest('hex'), instance };
}

/** Thin adapter: reuse the official CLI discovery, exact handshake and secureStore. */
export class CanvasBridge {
  private modules?: { client: CliClient; discovery: CliDiscovery; store: CliStore };
  constructor(readonly config: CanvasConfig) {}
  private load(): { client: CliClient; discovery: CliDiscovery; store: CliStore } {
    const current = inspectCanvasCli(this.config.root, this.config.instance);
    if (current.root !== this.config.root || current.digest !== this.config.digest) throw new CanvasError('CLI_CHANGED', '画布 CLI 已变化，请在连接页审阅并重新连接。');
    if (!this.modules) {
      const require = createRequire(import.meta.url);
      if (loadedCliDigests.get(current.root) !== current.digest) {
        // Reconnection after a reviewed update must not reuse old CommonJS
        // code with new resources. Evict only this CLI's own cached modules.
        for (const filename of Object.keys(require.cache)) {
          let canonical = filename;
          try { canonical = realpathSync.native(filename); } catch { /* deleted old CLI module */ }
          const rel = relative(current.root, canonical);
          if (rel && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel)) delete require.cache[filename];
        }
        loadedCliDigests.set(current.root, current.digest);
      }
      const nativeClient = require(join(current.root, 'src/agentClient.cjs')) as CliClient;
      const nativeDiscovery = require(join(current.root, 'src/discovery.cjs')) as CliDiscovery;
      this.modules = { client: {
        selectInstance: id => nativeClient.selectInstance(id, { discoveryOptions: { fetch: canvasControlFetch } }),
        requestAgentControl: (instance, path, options) => nativeClient.requestAgentControl(instance, path, { ...options, fetch: canvasControlFetch }),
      }, discovery: { discoverInstances: () => nativeDiscovery.discoverInstances({ fetch: canvasControlFetch }) }, store: require(join(current.root, 'src/secureStore.cjs')) };
    }
    return this.modules;
  }
  private async paired(): Promise<{ client: CliClient; instance: Instance; accessToken: string }> {
    const { client, store } = this.load();
    const instance = await client.selectInstance(this.config.instance); // CLI exact digest handshake
    const session = store.loadSession(instance.instanceId); // never env or raw settings
    if (!session?.accessToken || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) throw new CanvasError('PAIRING_REQUIRED', '请先在连接页配对，并在画布窗口批准所需权限。');
    return { client, instance, accessToken: session.accessToken };
  }
  /** Host connection UI only. This is never registered as an Agent/MCP tool. */
  async pairingRuntime(): Promise<CanvasPairingRuntime> {
    const { client, store } = this.load();
    for (const method of ['configuredInstances', 'loadPending', 'storePending', 'deletePending', 'loadSession', 'storeSession']) {
      if (typeof (store as unknown as Record<string, unknown>)[method] !== 'function') throw new CanvasError('CLI_PAIRING_UNSUPPORTED', '当前画布工具不支持界面配对，请在画布设置中更新 Agent 工具。');
    }
    const instance = await client.selectInstance(this.config.instance);
    return { client, store: store as CanvasPairingRuntime['store'], instance };
  }
  /** Explicit Host UI only; never exposed through Canvas MCP. */
  async workflowRuntime(): Promise<CanvasWorkflowRuntime> {
    const { client, store, instance } = await this.pairingRuntime();
    const session = store.loadSession(instance.instanceId);
    if (!session?.accessToken || !session.sessionId || session.origin !== instance.origin || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) throw new CanvasError('PAIRING_REQUIRED', '请先完成有效的画布窗口配对。');
    for (const method of ['storeApproval', 'loadApproval', 'deleteApproval']) if (typeof (store as unknown as Record<string, unknown>)[method] !== 'function') throw new CanvasError('CLI_APPROVAL_UNSUPPORTED', '请更新画布 Agent 工具后使用窗口审批。');
    const result = (await client.requestAgentControl(instance, '/api/agent-control/v1/session', { accessToken: session.accessToken })).data;
    if (result.sessionId !== session.sessionId || typeof result.actorId !== 'string' || !result.actorId || result.actorId.length > 256 || !Array.isArray(result.scopes) || !result.scopes.every(scope => typeof scope === 'string') || !result.scopes.includes('canvas:read')) throw new CanvasError('PAIRING_SESSION_INVALID', '画布配对身份或读取权限不一致。');
    return { instance, client, store: store as CanvasWorkflowRuntime['store'], sessionId: session.sessionId, actorId: result.actorId, accessToken: session.accessToken, scopes: result.scopes as string[] };
  }
  private localCatalog(): CanvasToolCatalog {
    // Fixed documented file only: no manifest-controlled arbitrary path.
    const file = join(this.config.root, 'generated/creative-capability-surfaces.json');
    if (!lstatSync(file).isFile() || lstatSync(file).size > 1024 * 1024) throw new CanvasError('CAPABILITY_CATALOG_INVALID', '画布能力文件缺失或超出支持范围，请更新 CLI。');
    return projectCanvasSurfaces(JSON.parse(readFileSync(file, 'utf8')));
  }
  private async checkedCatalog(connection: Awaited<ReturnType<CanvasBridge['paired']>>): Promise<CanvasToolCatalog> {
    const expected = this.localCatalog();
    const actual = canvasToolCatalogSchema.parse((await connection.client.requestAgentControl(connection.instance, '/api/agent-control/v1/capability-tools', { accessToken: connection.accessToken })).data);
    if (!sameCanvasCatalog(expected, actual)) throw new CanvasError('CAPABILITY_CATALOG_CHANGED', '画布高层能力与已审阅 CLI 不一致，请更新并重新连接。');
    return actual;
  }
  async inspect(input: CanvasInspectionRequest,expectedConnection?:string): Promise<Record<string, unknown>> {
    const parsed = canvasInspectionRequest.parse(input), request = { ...parsed, requestId: parsed.requestId ?? randomUUID() };
    const connection=expectedConnection===undefined?await this.paired():canvasTargetRuntime(this.config,await this.workflowRuntime(),expectedConnection);assertCanvasTargetConnection(expectedConnection,this.config,connection as CanvasWorkflowRuntime);
    const {client,instance,accessToken}=connection;
    // The existing /tools controller admits only eight bounded read/simulation
    // operations. No generic route, approval or provider submission is exposed.
    const data = canvasInspectionResultSchema.parse((await client.requestAgentControl(instance, '/api/agent-control/v1/tools', { accessToken, method: 'POST', body: request })).data);
    if (data.tool !== request.tool || data.requestId !== request.requestId || data.projectId !== request.projectId || data.canvasId !== request.canvasId) throw new CanvasError('INSPECTION_RESULT_MISMATCH', '画布检查结果与当前项目、画布或请求不一致。');
    if(expectedConnection!==undefined)assertCanvasTargetConnection(expectedConnection,this.config,await this.workflowRuntime());
    return data;
  }
  async plan(input: CanvasPlanRequest): Promise<Record<string, unknown>> {
    const request = canvasPlanRequest.parse(input), connection = await this.paired();
    const catalog = await this.checkedCatalog(connection), tool = catalog.tools.find(tool => tool.name === request.tool);
    if (!tool || tool.version !== request.version || !tool.directOperations.includes(request.operation)) throw new CanvasError('CAPABILITY_OPERATION_REFUSED', '该能力或版本未开放此规划操作，请先读取当前能力清单。');
    const policy = tool.operations.find(policy => policy.operation === request.operation);
    if (!policy || policy.riskLevel !== 'L0' || policy.approvalRequired) throw new CanvasError('CAPABILITY_OPERATION_REFUSED', '写入和付费执行必须使用专门的审批流程。');
    const { client, instance, accessToken } = connection;
    // Exactly one POST through the original CLI; no retry or alternate route.
    const data = canvasPlanResultSchema.parse((await client.requestAgentControl(instance, '/api/agent-control/v1/capability-tools/invoke', {
      accessToken, method: 'POST', body: { schema: 't8-versioned-creative-tool-request-v1', ...request },
    })).data);
    if (data.tool.name !== request.tool || data.tool.version !== request.version || data.tool.capabilityId !== tool.capabilityId || data.tool.operation !== request.operation || data.request.projectId !== request.projectId || data.request.canvasId !== request.canvasId || data.request.clientRequestId !== (request.clientRequestId ?? null) || data.contract.capabilityManifestDigest !== catalog.capabilityManifestDigest || data.contract.capabilityGraphDigest !== catalog.capabilityGraphDigest || JSON.stringify(data.contract.requiredScopes) !== JSON.stringify(policy.requiredScopes)) throw new CanvasError('CAPABILITY_RESULT_MISMATCH', '画布返回的规划引用与当前请求不一致，未开放执行。');
    return data;
  }
  async read(operation: CanvasOperation, id = '', scope?: { projectId: string; canvasId: string }): Promise<Record<string, unknown>> {
    if (operation === 'status') {
      const { client, discovery } = this.load();
      const instances = await discovery.discoverInstances();
      const selected = this.config.instance ? instances.find(item => item.instanceId === this.config.instance) : instances.length === 1 ? instances[0] : undefined;
      if (!selected) throw new CanvasError(instances.length > 1 ? 'APP_INSTANCE_AMBIGUOUS' : 'APP_NOT_RUNNING', instances.length > 1 ? '发现多个画布实例，请指定实例 ID。' : '尚未发现运行中的画布。');
      // Status itself is the compatibility report. Preserve its compat field exactly.
      return (await client.requestAgentControl(selected, '/api/agent-control/v1/status')).data;
    }
    const { client, instance, accessToken } = await this.paired();
    if(operation==='active-context'){const context=await readCanvasActiveContext({client,instance,accessToken});this.load();return context;}
    const paths: Record<Exclude<CanvasOperation, 'status'|'active-context'>, string> = {
      capabilities: '/capabilities', workspaces: '/workspaces', models: '/models', 'capability-graph': '/capability-graph', 'capability-tools': '/capability-tools',
      task: '/run-intents/', 'creator-session': '/creator-sessions/',
    };
    if (!(operation in paths)) throw new CanvasError('OPERATION_REFUSED', '当前适配器未开放此操作。');
    if ((operation === 'task' || operation === 'creator-session') && !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new CanvasError('INVALID_REFERENCE', '任务或会话引用格式无效。');
    const scoped = operation === 'task' || operation === 'creator-session';
    if (scoped && (!scope || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(scope.projectId) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(scope.canvasId))) throw new CanvasError('SCOPE_REQUIRED', '查询原任务或创作会话需要明确的项目和画布引用。');
    const suffix = scoped ? encodeURIComponent(id) + `?projectId=${encodeURIComponent(scope!.projectId)}&canvasId=${encodeURIComponent(scope!.canvasId)}` : '';
    if (operation === 'capability-tools') return this.checkedCatalog({ client, instance, accessToken }) as unknown as Record<string, unknown>;
    return (await client.requestAgentControl(instance, '/api/agent-control/v1' + paths[operation] + suffix, { accessToken })).data;
  }
  async status(): Promise<CanvasConnection> {
    try {
      const data = await this.read('status');
      // Native status is a flat compatibility report. Preserve legacy nested
      // reports too, including an explicit null rather than replacing it.
      return { configured: true, root: this.config.root, digest: this.config.digest, instance: this.config.instance, connected: true, code: 'OK', message: '画布控制面已响应；业务操作仍需兼容检查与现有配对。', compat: Object.hasOwn(data, 'compat') ? data.compat : data };
    } catch (error) {
      const safe = safeCanvasError(error);
      return { configured: true, root: this.config.root, digest: this.config.digest, instance: this.config.instance, connected: false, code: safe.code, message: safe.message, compat: null };
    }
  }
  /** Owner UI diagnosis only. Native exact handshake, no pairing or credential-store reads. */
  async connectionCheck():Promise<CanvasConnectionCheck>{
    let instances:CanvasConnectionCheck['instances']=[];
    const result=(state:CanvasConnectionCheck['state'],code:string,message:string)=>canvasConnectionCheckSchema.parse({binding:this.config,state,code,message,instances});
    try{
      const {client,discovery}=this.load(),live=await discovery.discoverInstances();
      for(const item of live.slice(0,16)){
        try{const value={id:item.instanceId,version:String(item.appVersion??'').slice(0,64),port:Number(new URL(item.origin).port)};
          const parsed=canvasConnectionCheckSchema.shape.instances.element.safeParse(value);if(parsed.success)instances.push(parsed.data);
        }catch{/* No untrusted discovery detail is returned. */}
      }
      if(live.length>16)return result('error','TOO_MANY_INSTANCES','检测到过多画布窗口。请关闭不使用的画布后重新检测。');
      if(!live.length)return result('not-running','APP_NOT_RUNNING','尚未找到运行中的画布。请启动桌面画布，再点击“重新检测”。');
      if(this.config.instance&&!live.some(item=>item.instanceId===this.config.instance))return result('choose-instance','INSTANCE_CHANGED','原先连接的画布已关闭或重启，请从下方选择当前窗口。');
      if(!this.config.instance&&live.length>1)return result('choose-instance','APP_INSTANCE_AMBIGUOUS','检测到多个运行中的画布，请选择本次要使用的窗口。无需填写实例 ID。');
      this.load();await client.selectInstance(this.config.instance);this.load();
      return result('ready','COMPATIBLE','画布版本与连接工具匹配，可以在下方完成窗口配对。');
    }catch(error){
      const safe=safeCanvasError(error);
      if(safe.code==='CLI_CHANGED'||safe.code==='ENOENT')return result('needs-review',safe.code,'连接工具已更新或移动。请重新检测，选择正在运行的桌面画布并连接。');
      if(safe.code.endsWith('_MISMATCH')||safe.code==='APP_VERSION_INCOMPATIBLE')return result('incompatible',safe.code,'当前连接工具与画布版本不同。请点击“重新检测”，优先连接“正在运行的桌面画布”。');
      return result(safe.code==='APP_NOT_RUNNING'?'not-running':'error',safe.code,safe.message);
    }
  }
}

export function safeCanvasError(error: unknown): CanvasError {
  if (error instanceof CanvasError) return error;
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'CANVAS_UNAVAILABLE';
  const messages: Record<string, string> = {
    APP_NOT_RUNNING:'尚未找到运行中的画布，请启动桌面画布后在画布连接页重新检测。',
    APP_INSTANCE_AMBIGUOUS:'检测到多个画布，请在画布连接页选择要使用的窗口。',
    AGENT_CONTROL_TIMEOUT:'连接画布超时，请确认画布仍在运行，再在画布连接页重新检测。',
    APP_CONNECTION_FAILED:'画布暂时无法响应，请在画布连接页重新检测。',
    PAIRING_REQUIRED:'画布尚未完成配对，请在画布连接页连接，并在桌面画布窗口批准。',
    CREDENTIAL_STORE_BUSY: '另一进程正在更新画布配对，请稍后重试。',
    PAIRING_PROGRESS_CHANGED: '配对进度已被其他进程更新，请检查当前配对。',
    PAIRING_ALREADY_PENDING: '画布已有待确认连接，请先在画布窗口处理。',
  };
  if(/^[A-Z][A-Z0-9_]{0,80}$/.test(code)&&code.endsWith('_MISMATCH'))return new CanvasError(code,'画布与连接工具的版本不匹配。请在画布连接页重新检测，连接正在运行的桌面画布；不要重复发起配对。');
  if (/^[A-Z][A-Z0-9_]{0,80}$/.test(code)) return new CanvasError(code, messages[code] ?? '画布操作未完成，请检查应用、配对与 CLI 兼容状态。');
  return new CanvasError('CANVAS_UNAVAILABLE', '画布操作未完成，请检查应用与连接设置。');
}
