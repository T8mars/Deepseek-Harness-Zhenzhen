import type { Context } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { readWallet, GatewayError } from './gateway.ts';
import { DefaultArt } from './default-art.ts';
import type { DefaultArtInfo, DefaultArtChunkRequest, DefaultArtChunk } from './default-art-schema.ts';
import type { Wallet } from './gateway.ts';
import type {} from './remote.ts';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { KnowledgeStore } from './knowledge.ts';
import {ZhenRag} from './rag-service.ts';
import type {RagBackendStatus} from './rag-backend-schema.ts';
import {ragBackendMessages} from './rag-backend-schema.ts';
export {ZhenRag} from './rag-service.ts';
export type {RagSearchProvider,RagProviderScope,RagContext} from './rag-service.ts';
export type {RagBackendStatus} from './rag-backend-schema.ts';
import type { KnowledgeCollection, KnowledgeHit, KnowledgeSource, ImportResult } from './knowledge.ts';
import type {KnowledgeImportReport} from './knowledge-import-schema.ts';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-skill';
import { SkillMarket, readBundledCatalog } from './market.ts';
import { SkillFeed } from './skill-feed.ts';
import { GithubAccess } from './github-access.ts';
import { FIRST_PARTY_REPOSITORY, githubCredentialValue } from './github-access-schema.ts';
import type { GithubAccessInfo } from './github-access-schema.ts';
import type { MarketItem, SkillPackage, SkillAutoPolicy } from './market-schema.ts';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import { CanvasBridge, inspectCanvasCli, safeCanvasError } from './canvas.ts';
import type { CanvasConfig, CanvasConnection } from './canvas.ts';
import { CanvasError } from './canvas.ts';
import { discoverCanvasInstalls } from './canvas-discovery.ts';
import { canvasGuidance } from './canvas-guidance.ts';
import {discoverCanvasSetup} from './canvas-desktop-discovery.ts';
import type {CanvasConnectionCheck,CanvasSetupDiscovery} from './canvas-setup-schema.ts';
import type { CanvasDiscovery } from './canvas-discovery-schema.ts';
import { CanvasPairing } from './canvas-pairing.ts';
import { CanvasWorkflow } from './canvas-workflow.ts';
import { CanvasRuns } from './canvas-run.ts';
import { CanvasTasks } from './canvas-tasks.ts';
import { CanvasTransfer } from './canvas-transfer.ts';
import type { CanvasTransferInput, CanvasTransferView } from './canvas-transfer-schema.ts';
import type { CanvasTaskScope, CanvasTaskReference, CanvasTaskList, CanvasTaskDetail } from './canvas-task-schema.ts';
import type { CanvasRunSelection, CanvasRunView, CanvasRunNodes } from './canvas-run-schema.ts';
import { CanvasInbox } from './canvas-inbox.ts';
import type { CanvasPlanCapture } from './canvas-inbox.ts';
import type { CanvasCandidateView } from './canvas-inbox-schema.ts';
import type { CanvasWorkflowInput, CanvasWorkflowView, CanvasWorkspaces, CanvasModels, CanvasModelsQuery } from './canvas-workflow-schema.ts';
import type { CanvasAssets, CanvasAssetsQuery } from './canvas-reference-schema.ts';
import type { CanvasPairingView } from './canvas-pairing-schema.ts';
import { canvasToolCatalogSchema } from './canvas-contract.ts';
import type { CanvasToolCatalog } from './canvas-contract.ts';
import { UpdateMonitor } from './updates.ts';
import type { UpdateBaseline } from './updates.ts';
import type { UpdateReport } from './update-schema.ts';
import { createRagTool, createRagOpenTool } from './rag-tool.ts';
import type {} from '@deepseek-ai/dsh-working-directory';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-llm';
import type { KnowledgeBinding } from './knowledge.ts';
import { McpMarket, mcpNodeCompatible } from './mcp-market.ts';
import { MCP_RECIPES, mcpId } from './mcp-market-schema.ts';
import type { McpMarketView } from './mcp-market-schema.ts';
import { CuratedMcpRuntime } from './mcp-runtime.ts';
import { CapabilityMonitor, readCapabilityCatalog, createCapabilityTool } from './capabilities.ts';
import type { CapabilityCatalog, CapabilityCheck } from './capability-schema.ts';
import { GatewayChecks } from './gateway-check.ts';
import { GATEWAY_CHECK_MODEL } from './gateway-check-schema.ts';
import type { GatewayCheckPreview, GatewayCheckReceipt } from './gateway-check-schema.ts';
import { LocalSkills } from './local-skills.ts';
import type { LocalSkillDraft, LocalSkillView, LocalSkillBody, LocalSkillMode } from './local-skills-schema.ts';
import { GithubSkills, GithubSkillError } from './github-skills.ts';
import type { GithubSkillSpec, GithubSkillSourceView, GithubSkillSummary, GithubSkillPreview, GithubSkillFilePreview } from './github-skills-schema.ts';
import { GatewayTasks, GatewayTaskError } from './gateway-tasks.ts';
import type { GatewayTaskSpec, GatewayTaskRecord } from './gateway-task-schema.ts';
import { GatewayMedia, GatewayMediaError } from './gateway-media.ts';
import { MediaDownloadError } from './media-download.ts';
import type { GatewayMediaTicket, GatewayMediaReceipt } from './gateway-media-schema.ts';

export type { Wallet } from './gateway.ts';
export type { MarketItem, SkillPackage, SkillFeedSnapshot, SkillAutoPolicy } from './market-schema.ts';
export type { CanvasConnection } from './canvas.ts';
export type {CanvasConnectionCheck,CanvasSetupDiscovery} from './canvas-setup-schema.ts';
export type { CanvasDiscovery, CanvasInstallCandidate } from './canvas-discovery-schema.ts';
export type { CanvasPairingView } from './canvas-pairing-schema.ts';
export type { CanvasWorkflowInput, CanvasWorkflowView, CanvasWorkspaces, CanvasModels, CanvasModelsQuery, CanvasModelKind, CanvasModelChoices } from './canvas-workflow-schema.ts';
export type { CanvasAsset, CanvasAssets, CanvasAssetsQuery, CanvasReferenceKey } from './canvas-reference-schema.ts';
export type { CanvasCandidateView } from './canvas-inbox-schema.ts';
export type { CanvasRunSelection, CanvasRunView, CanvasRunNodes } from './canvas-run-schema.ts';
export type { CanvasTaskScope, CanvasTaskReference, CanvasTaskSummary, CanvasTaskList, CanvasTaskDetail } from './canvas-task-schema.ts';
export type { DefaultArtInfo, DefaultArtAsset, DefaultArtChunkRequest, DefaultArtChunk } from './default-art-schema.ts';
export type { CanvasTransferInput, CanvasTransferView } from './canvas-transfer-schema.ts';
export type { CanvasToolCatalog } from './canvas-contract.ts';
export type { UpdateReport } from './update-schema.ts';
export type { GithubAccessInfo } from './github-access-schema.ts';
export type { KnowledgeBinding } from './knowledge.ts';
export type { McpMarketView } from './mcp-market-schema.ts';
export type { CapabilityCatalog, CapabilityItem, CapabilityCheck } from './capability-schema.ts';
export type { KnowledgeCollection, KnowledgeHit, KnowledgeSource, ImportResult } from './knowledge.ts';
export type {KnowledgeImportReport, KnowledgeImportIssue} from './knowledge-import-schema.ts';
export type { GatewayCheckPreview, GatewayCheckReceipt } from './gateway-check-schema.ts';
export type { LocalSkillDraft, LocalSkillView, LocalSkillBody, LocalSkillMode } from './local-skills-schema.ts';
export type { GithubSkillSpec, GithubSkillSourceView, GithubSkillSummary, GithubSkillPreview, GithubSkillFilePreview } from './github-skills-schema.ts';
export type { GatewayTaskSpec, GatewayTaskRecord, GatewayTaskProtocol } from './gateway-task-schema.ts';
export type { GatewayMediaTicket, GatewayMediaReceipt } from './gateway-media-schema.ts';
export interface ZhenStatus {
  version: string;
  provider: string;
  model: string;
  credentialConfigured: boolean;
  credentialWritable: boolean;
  gatewayVerified: boolean;
}

declare module '@deepseek-ai/cordis' {
  interface Context { zhen: ZhenService;zhenRag:ZhenRag; }
}

const seedanceCredential = credentialRef('SEEDANCE_API_KEY');
const githubCredential = credentialRef('DSH_ZHEN_GITHUB_TOKEN');

/** Creator workspace Host operations, guarded by DSH's authenticated Remote access. */
export default class ZhenService extends TypertRemoteService {
  static inject: string[] = ['credentials'];
  private knowledgeStore?: KnowledgeStore;
  private readonly rag:ZhenRag;
  private skillMarket?: SkillMarket;
  private skillFeed?: SkillFeed;
  private githubReader?: GithubAccess;
  private mountCanvas?: (config?: CanvasConfig) => Promise<void>;
  private updateMonitor?: UpdateMonitor;
  private mcpMarket?: McpMarket;
  private mcpRuntime?: CuratedMcpRuntime;
  private readonly mcpOperations = new AbortController();
  private capabilityCatalog?: CapabilityCatalog;
  private capabilityMonitor?: CapabilityMonitor;
  private gatewayChecks?: GatewayChecks;
  private seedanceGeneration = 0;
  private walletClosed = false;
  private readonly walletReads = new Set<AbortController>();
  private localSkillSources?: LocalSkills;
  private githubSkillSources?: GithubSkills;
  private mediaTasks?: GatewayTasks;
  private mediaExports?: GatewayMedia;
  private canvasPairing?: CanvasPairing;
  private canvasWorkflow?: CanvasWorkflow;
  private canvasRuns?: CanvasRuns;
  private canvasTasks?: CanvasTasks;
  private canvasTransfer?: CanvasTransfer;
  private readonly artDefaults = new DefaultArt({ root: process.env.DSH_ZHEN_ART_ROOT, digest: process.env.DSH_ZHEN_ART_DIGEST });
  private readonly canvasInbox = new CanvasInbox();
  private readonly canvasCaptures = new Map<symbol, CanvasPlanCapture>();
  private readonly canvasAdoptions = new Map<string, Promise<CanvasWorkflowView>>();

  constructor(ctx: Context) {
    super(ctx, 'zhen');
    this.rag=new ZhenRag(()=>this.knowledge(),dshHomePath('dsh-zhen','rag-backend.json'));
    ctx.provide('zhenRag',this.rag);
    ctx.effect(()=>()=>this.rag.close(),'zhen: local retrieval providers');
    ctx.effect(() => () => { this.knowledgeStore?.close(); }, 'zhen: local knowledge');
    ctx.effect(() => () => this.gatewayChecks?.close(), 'zhen: explicit connection checks');
    ctx.effect(() => () => { this.localSkillSources?.close(); }, 'zhen: local skill directories');
    ctx.effect(() => () => { this.githubSkillSources?.close(); }, 'zhen: GitHub skill snapshots');
    ctx.effect(() => () => { this.githubReader?.close(); }, 'zhen: fixed first-party GitHub access');
    ctx.on('credentials/reference-updated', ref => {
      if (ref === githubCredential) this.githubReader?.invalidate();
      if (ref === seedanceCredential) this.invalidateSeedance();
    });
    ctx.effect(() => () => { this.walletClosed = true; this.stopWalletReads(); }, 'zhen: Seedance wallet reads');
    ctx.effect(() => () => this.mediaTasks?.close(), 'zhen: existing gateway tasks');
    ctx.effect(() => () => this.mediaExports?.close(), 'zhen: explicit media exports');
    ctx.effect(() => () => this.canvasPairing?.close(), 'zhen: explicit Canvas pairing');
    ctx.effect(() => () => this.canvasWorkflow?.close(), 'zhen: explicit Canvas workflow');
    ctx.effect(() => () => this.canvasRuns?.close(), 'zhen: explicit native run approvals');
    ctx.effect(() => () => this.canvasTasks?.close(), 'zhen: native task queries');
    ctx.effect(() => () => this.canvasTransfer?.close(), 'zhen: explicit saved-media handoff');
    ctx.effect(() => () => this.artDefaults.close(), 'zhen: local default art');
    ctx.effect(() => () => { this.canvasInbox.clear(); this.canvasCaptures.clear(); }, 'zhen: process-local Canvas plan inbox');
    ctx.inject(['systemPrompt'], inner => inner.systemPrompt.section({
      name: 'zhen:canvas-entry', order: inner.systemPrompt.getSectionOrder('MCP_SERVERS'),
      interpolate: false, text: () => this.canvasConfig() ? canvasGuidance : '',
    }));
    ctx.on('tools/execute', async (execution, next) => {
      if (execution.name === 'mcp__t8canvas__canvas_plan' && execution.agent?.session.id) {
        try { const config = this.canvasConfig(); if (config) {
          this.canvasCaptures.set(execution.token, { config, sessionId: execution.agent.session.id, callId: execution.callId });
          while (this.canvasCaptures.size > 64) this.canvasCaptures.delete(this.canvasCaptures.keys().next().value!);
        } } catch { /* Optional observation never alters tool dispatch. */ }
      }
      return next();
    });
    ctx.on('tools/result', (execution, result) => {
      const capture = this.canvasCaptures.get(execution.token); this.canvasCaptures.delete(execution.token);
      if (!capture || result.isError || execution.signal.aborted) return;
      try { this.canvasInbox.observe(capture, this.canvasConfig(), execution.arguments, result.value); } catch { /* No raw result or user content is logged. */ }
    });
    ctx.effect(() => {
      if (existsSync(dshHomePath('dsh-zhen', 'gateway-tasks.sqlite'))) this.tasks();
      const interval = setInterval(() => { void this.mediaTasks?.automatic().catch(() => {}); }, 5000); interval.unref();
      return () => clearInterval(interval);
    }, 'zhen: explicitly enabled task tracking');
    ctx.effect(() => () => { this.skillMarket?.close(); }, 'zhen: skill market');
    ctx.effect(() => () => { this.mcpOperations.abort(); this.mcpMarket?.close(); }, 'zhen: MCP market');
    ctx.effect(() => {
      const controller = new AbortController();
      const check = () => {
        void this.updates().automaticCheck(controller.signal).catch(() => {});
        void this.feed().automaticCheck(controller.signal).catch(() => {});
        void this.mcps().automaticCheck(controller.signal).catch(() => {});
        void this.capabilityUpdates().automaticCheck(controller.signal).catch(() => {});
        void this.githubSkills().automaticCheck(controller.signal).catch(() => {});
      };
      const start = setTimeout(check, 30000); start.unref();
      const interval = setInterval(check, 3600000); interval.unref();
      return () => { clearTimeout(start); clearInterval(interval); controller.abort(); };
    }, 'zhen: public update metadata');
    ctx.inject(['skills'], inner => inner.skills.registerProvider(control => {
      const market = this.market();
      const unsubscribe = market.subscribe(control.invalidate);
      control.signal.addEventListener('abort', unsubscribe, { once: true });
      return market.provider();
    }));
    ctx.inject(['skills'], inner => inner.skills.registerProvider(control => {
      const sources = this.localSkills();
      const unsubscribe = sources.subscribe(control.invalidate);
      control.signal.addEventListener('abort', unsubscribe, { once: true });
      return sources.provider();
    }));
    ctx.inject(['tools'], inner => inner.tools.register(createCapabilityTool(() => this.capabilities())));
    ctx.inject(['skills'], inner => inner.skills.registerProvider(control => {
      const sources = this.githubSkills(); const unsubscribe = sources.subscribe(control.invalidate);
      control.signal.addEventListener('abort', unsubscribe, { once: true }); return sources.provider();
    }));
    ctx.inject(['tools', 'workingDirectory'], inner => {
      const runtime = this.mcpRuntime = new CuratedMcpRuntime(inner, this.mcps());
      void runtime.sync().catch(() => {});
      inner.effect(() => () => { if (this.mcpRuntime === runtime) this.mcpRuntime = undefined; }, 'zhen: curated MCP runtime');
      const retrievalContext = async (execution: import('@deepseek-ai/dsh-tools').ToolRunContext) => {
        if (!execution.agent) throw new Error('知识库检索需要当前会话。');
        const directory = await inner.workingDirectory.ensure(execution.agent, execution.signal);
        return { sessionId: execution.agent.session.id, provider: execution.agent.options.provider ?? '', directory };
      };
      inner.tools.register(createRagTool(() => this.knowledge(), retrievalContext,()=>this.rag));
      inner.tools.register(createRagOpenTool(() => this.knowledge(), retrievalContext,()=>this.rag));
    });
    const service = this;
    ctx.on('llm/stream', async function* (options, next) {
      const file = dshHomePath('dsh-zhen', 'knowledge.sqlite');
      const ragGrants = !!options.sessionId && existsSync(file) && service.knowledge().hasSessionGrants(options.sessionId);
      const mcpGrants = !!options.sessionId && existsSync(dshHomePath('dsh-zhen', 'mcp', 'session-grants.sqlite')) && service.mcps().hasSessionGrants(options.sessionId);
      if (options.sessionId && (ragGrants || mcpGrants)) {
        const agent = ctx.get('agents')?.get(options.sessionId);
        const workingDirectory = ctx.get('workingDirectory');
        if (!agent || !workingDirectory) throw new Error('此会话包含本地资料引用，无法复核当前工作目录。请打开原会话后继续，或新建会话。');
        const directory = await workingDirectory.ensure(agent, options.signal);
        if (ragGrants){service.rag.assertAvailable();await service.knowledge().assertSessionAllowed(options.sessionId, options.provider, directory);service.rag.assertAvailable();}
        if (mcpGrants) service.mcps().assertSession(options.sessionId, directory);
      }
      yield* next();
    });
    ctx.inject(['tools'], inner => {
      let mounted: Awaited<ReturnType<Context['plugin']>> | undefined;
      let queue = Promise.resolve();
      this.mountCanvas = config => queue = queue.catch(() => {}).then(async () => {
        await mounted?.dispose(); mounted = undefined;
        // Only native store/discovery path overrides cross into MCP. Tokens,
        // provider credentials and file-credential opt-in flags never do.
        const authStore = String(process.env.ZCANVAS_AUTH_STORE || '').trim();
        const env: Record<string, string> = authStore ? { ZCANVAS_AUTH_STORE: resolve(authStore) } : {};
        const instanceDirectory = String(process.env.ZCANVAS_INSTANCE_DIR || '').trim();
        if (instanceDirectory) env.ZCANVAS_INSTANCE_DIR = resolve(instanceDirectory);
        if (config) mounted = await inner.plugin(mcpClient, mcpClient.Config({ transport: 'stdio', serverName: 't8canvas', command: process.execPath,
          args: [fileURLToPath(new URL('./canvas-server.js', import.meta.url)), '--cli-root', config.root, '--digest', config.digest, ...(config.instance ? ['--instance', config.instance] : [])],
          env, cwd: config.root, toolCallTimeoutMs: 30000, failOnStartupError: true, maxInstructionBytes: 4096, reconnect: { enabled: false } }));
      });
      const config = this.canvasConfig();
      if (config) void this.mountCanvas(config).catch(() => { inner.logger.warn('DSH-zhen Canvas MCP unavailable; inspect the connection panel.'); });
      inner.effect(() => () => { this.mountCanvas = undefined; }, 'zhen: canvas mount owner');
    });
    ctx.inject(['webServer'], inner => inner.effect(() => inner.webServer.tapIndex(html => {
      const icon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="5" fill="#0F5B6B"/><circle cx="16" cy="16" r="11" fill="none" stroke="#0F5B6B" stroke-width="2"/></svg>');
      return html.replace(/<title>[^<]*<\/title>/i, '<title>DSH-zhen</title>')
        .replace(/<link\b[^>]*\brel=["'](?:shortcut )?icon["'][^>]*>/gi, '')
        .replace('</head>', `<link rel="icon" href="${icon}"/></head>`);
    }), 'zhen: public web index brand'));
  }
  private knowledge(): KnowledgeStore {
    return this.knowledgeStore ??= new KnowledgeStore(dshHomePath('dsh-zhen', 'knowledge.sqlite'));
  }
  private capabilities(): CapabilityCatalog { return this.capabilityCatalog ??= readCapabilityCatalog(); }
  private capabilityUpdates(): CapabilityMonitor { return this.capabilityMonitor ??= new CapabilityMonitor(dshHomePath('dsh-zhen', 'capabilities.json'), this.capabilities()); }
  @Remote
  gatewayCatalog(): CapabilityCatalog { return structuredClone(this.capabilities()); }
  @Remote
  gatewayCatalogCheckSnapshot(): CapabilityCheck { return this.capabilityUpdates().snapshot(); }
  @Remote
  async gatewayCatalogCheck(): Promise<CapabilityCheck> { return this.capabilityUpdates().check(this.mcpOperations.signal); }
  @Remote
  gatewayCatalogAutomatic(enabled: boolean): void { this.capabilityUpdates().setAutomatic(enabled); }
  private mcps(): McpMarket { return this.mcpMarket ??= new McpMarket(dshHomePath('dsh-zhen', 'mcp')); }
  @Remote
  mcpSnapshot(): McpMarketView {
    const snapshot = this.mcps().snapshot();
    const releases = [...snapshot.candidates, ...snapshot.installations.map(item => item.release)];
    return { snapshot, node: process.versions.node, incompatible: [...new Set(releases.filter(item => !mcpNodeCompatible(item.node)).map(item => `${item.id}@${item.version}`))], recipes: Object.values(MCP_RECIPES).map(({ entry: _, ...recipe }) => ({ ...recipe, maintenance: this.mcps().isMaintaining(recipe.id), runtime: this.mcpRuntime?.state(recipe.id) ?? 'unavailable' })) };
  }
  @Remote
  async mcpCheck(): Promise<McpMarketView> { await this.mcps().check(this.mcpOperations.signal); return this.mcpSnapshot(); }
  @Remote
  mcpAutomatic(enabled: boolean): void { this.mcps().setAutomatic(enabled); }
  @Remote
  async mcpInstall(id: string, version: string, integrity: string): Promise<void> { await this.mcps().install(id, version, integrity, this.mcpOperations.signal); }
  @Remote
  async mcpSelect(id: string, version: string, workspace: string): Promise<void> {
    if (!this.mcpRuntime) throw new Error('工具服务暂不可用，请等待 Host 加载完成。');
    this.mcps().select(id, version, workspace); await this.mcpRuntime.sync();
  }
  @Remote
  async mcpDisable(id: string): Promise<void> { this.mcps().disable(id); await this.mcpRuntime?.sync(); }
  @Remote
  async mcpForget(id: string): Promise<void> { this.mcps().forget(id); await this.mcpRuntime?.sync(); }
  @Remote
  async mcpRestart(id: string): Promise<void> {
    const selected = this.mcps().snapshot().selections.find(item => item.id === id);
    if (!selected || !this.mcpRuntime) throw new Error('MCP 运行服务不可用，请先启用连接。');
    await this.mcpRuntime.restart(selected.id);
  }
  @Remote
  async mcpRepair(id: string, version: string): Promise<void> {
    const key = mcpId.parse(id);
    await this.mcps().repair(key, version, async () => { await this.mcpRuntime?.quiesce(key); }, this.mcpOperations.signal);
  }
  @Remote
  async mcpRestoreArchive(archiveId: string): Promise<void> {
    const record = this.mcps().snapshot().archives.find(item => item.archiveId === archiveId);
    if (!record) throw new Error('此隔离副本不存在。');
    await this.mcps().restoreArchive(archiveId, async () => { await this.mcpRuntime?.quiesce(record.installation.release.id); });
  }
  @Remote
  knowledgeBinding(project: string): KnowledgeBinding | null { return this.knowledge().binding(project); }
  @Remote
  async bindKnowledge(project: string, directory: string): Promise<KnowledgeBinding | null> { return this.knowledge().bind(project, directory); }
  @Remote
  setKnowledgeAgentAccess(project: string, collectionId: string, enabled: boolean): void { this.knowledge().setAgentAccess(project, collectionId, enabled); }
  private market(): SkillMarket {
    if (!this.skillMarket) {
      this.skillMarket = new SkillMarket(dshHomePath('dsh-zhen', 'skills.sqlite'), readBundledCatalog());
      this.skillFeed = new SkillFeed(dshHomePath('dsh-zhen', 'skills-feed.json'), this.skillMarket, fetch, this.githubAccess());
    }
    return this.skillMarket;
  }
  private feed(): SkillFeed { this.market(); return this.skillFeed!; }
  @Remote
  marketFeedSnapshot(): import('./market-schema.ts').SkillFeedSnapshot { return this.feed().snapshot(); }
  @Remote
  async marketFeedCheck(): Promise<import('./market-schema.ts').SkillFeedSnapshot> { return this.feed().check(); }
  @Remote
  marketFeedAutomatic(enabled: boolean): void { this.feed().setAutomatic(enabled); }
  @Remote
  marketAutoPolicy(): SkillAutoPolicy { return this.market().autoPolicy(); }
  @Remote
  marketAutoUpdates(enabled: boolean): void { this.feed().setAutoUpdates(enabled); }
  @Remote
  marketPauseAuto(id: string, paused: boolean): void { this.feed().pauseAutoUpdate(id, paused); }
  private updates(): UpdateMonitor {
    return this.updateMonitor ??= new UpdateMonitor(dshHomePath('dsh-zhen', 'updates.json'), JSON.parse(readFileSync(new URL('../catalog/runtime.json', import.meta.url), 'utf8')) as UpdateBaseline, fetch, this.githubAccess());
  }
  private githubAccess(): GithubAccess {
    return this.githubReader ??= new GithubAccess(async () => {
      if (!(await this.ctx.credentials.describe(githubCredential)).configured) return undefined;
      return (await this.ctx.credentials.resolve(githubCredential))?.value;
    });
  }
  @Remote
  async githubAccessInfo(): Promise<GithubAccessInfo> {
    const info = await this.ctx.credentials.describe(githubCredential);
    return { repository: FIRST_PARTY_REPOSITORY, configured: info.configured, writable: info.writable };
  }
  @Remote
  async githubSaveCredential(value: string): Promise<void> {
    if (!githubCredentialValue.safeParse(value).success) throw new RemoteError('zhen/refused', '请输入有效 GitHub 只读凭据，不包含空格或换行。', { reason: 'INVALID_GITHUB_CREDENTIAL' });
    this.githubReader?.invalidate();
    try { await this.ctx.credentials.set(githubCredential, value); }
    finally { this.githubReader?.invalidate(); }
  }
  @Remote
  async githubRemoveCredential(): Promise<void> {
    this.githubReader?.invalidate();
    try { await this.ctx.credentials.unset(githubCredential); }
    finally { this.githubReader?.invalidate(); }
  }
  @Remote
  updatesSnapshot(): UpdateReport { return this.updates().snapshot(); }
  @Remote
  async updatesCheck(): Promise<UpdateReport> { return this.updates().check(); }
  @Remote
  updatesAutomatic(enabled: boolean): void { this.updates().setAutomatic(enabled); }
  private canvasConfig(): CanvasConfig | undefined {
    const file = dshHomePath('dsh-zhen', 'canvas.json');
    if (!existsSync(file)) return undefined;
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || !('root' in value) || typeof value.root !== 'string' || !('digest' in value) || typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest) || !('instance' in value) || typeof value.instance !== 'string') return undefined;
    return { root: value.root, digest: value.digest, instance: value.instance };
  }
  private saveCanvasConfig(config?: CanvasConfig): void {
    const file = dshHomePath('dsh-zhen', 'canvas.json');
    mkdirSync(dirname(file), { recursive: true });
    const temporary = file + '.tmp';
    writeFileSync(temporary, JSON.stringify(config ?? {}) + '\n', { mode: 0o600 });
    renameSync(temporary, file);
  }
  @Remote
  canvasDiscover(): CanvasDiscovery { return discoverCanvasInstalls(); }
  @Remote
  canvasSetupDiscover():Promise<CanvasSetupDiscovery>{return discoverCanvasSetup();}
  @Remote
  async canvasConnectionCheck():Promise<CanvasConnectionCheck>{
    const config=this.canvasConfig();
    if(!config)return {binding:null,state:'not-configured',code:'NOT_CONFIGURED',message:'启动桌面画布，再选择下方检测到的画布。无需查找目录或填写实例 ID。',instances:[]};
    const result=await new CanvasBridge(config).connectionCheck(),current=this.canvasConfig();
    if(!current||current.root!==config.root||current.digest!==config.digest||current.instance!==config.instance)return {...result,state:'error',code:'CONNECTION_CHANGED',message:'连接已被其他窗口更改，请点击“重新检测”，确认当前画布。',instances:[]};
    return result;
  }
  private pairings(): CanvasPairing { return this.canvasPairing ??= new CanvasPairing(dshHomePath('dsh-zhen', 'canvas-pairing.json'), () => this.canvasConfig()); }
  private async pairingOperation(work: () => Promise<CanvasPairingView>): Promise<CanvasPairingView> {
    try { return await work(); }
    catch (error) { const safe = safeCanvasError(error); throw new RemoteError('zhen/refused', safe.message, { reason: safe.code }); }
  }
  @Remote
  canvasPairingSnapshot(): Promise<CanvasPairingView> { return this.pairingOperation(() => this.pairings().snapshot()); }
  @Remote
  canvasPairingBegin(handoff = false, writable = false, runnable = false, assetTransfer = false): Promise<CanvasPairingView> { return this.pairingOperation(() => this.pairings().begin(handoff, writable, runnable, assetTransfer)); }
  @Remote
  canvasPairingComplete(): Promise<CanvasPairingView> { return this.pairingOperation(() => this.pairings().complete()); }
  private workflows(): CanvasWorkflow { return this.canvasWorkflow ??= new CanvasWorkflow(dshHomePath('dsh-zhen', 'canvas-workflow.json'), () => this.canvasConfig()); }
  private async workflowOperation<T>(run: () => T | Promise<T>): Promise<T> {
    try { return await run(); } catch (error) { const safe = safeCanvasError(error); throw new RemoteError('zhen/refused', safe.message, { reason: safe.code }); }
  }
  @Remote
  canvasWorkflowSnapshot(): Promise<CanvasWorkflowView | null> { return this.workflowOperation(() => this.workflows().snapshot()); }
  @Remote
  canvasWorkspaces(): Promise<CanvasWorkspaces> { return this.workflowOperation(() => this.workflows().workspaces()); }
  @Remote
  canvasWorkflowModels(input:CanvasModelsQuery):Promise<CanvasModels>{return this.workflowOperation(()=>this.workflows().models(input));}
  @Remote
  canvasWorkflowAssets(input:CanvasAssetsQuery):Promise<CanvasAssets>{return this.workflowOperation(()=>this.workflows().assets(input));}
  @Remote
  canvasWorkflowPreview(input: CanvasWorkflowInput): Promise<CanvasWorkflowView> { return this.workflowOperation(() => this.workflows().preview(input)); }
  @Remote
  canvasWorkflowApprove(id: string, confirmation: boolean): Promise<CanvasWorkflowView> { return this.workflowOperation(() => this.workflows().approve(id, confirmation)); }
  @Remote
  canvasWorkflowComplete(id: string): Promise<CanvasWorkflowView> { return this.workflowOperation(() => this.workflows().complete(id)); }
  private runs(): CanvasRuns { return this.canvasRuns ??= new CanvasRuns(dshHomePath('dsh-zhen', 'canvas-run.json'), () => this.canvasConfig()); }
  @Remote
  canvasRunSnapshot(): Promise<CanvasRunView | null> { return this.workflowOperation(() => this.runs().snapshot()); }
  @Remote
  canvasRunNodes(projectId: string, canvasId: string, offset = 0): Promise<CanvasRunNodes> { return this.workflowOperation(() => this.runs().nodes(projectId, canvasId, offset)); }
  @Remote
  canvasRunQuote(selection: CanvasRunSelection): Promise<CanvasRunView> { return this.workflowOperation(() => this.runs().quote(selection)); }
  @Remote
  canvasRunApprove(quoteId: string, confirmed: boolean, unknownPriceAccepted: boolean): Promise<CanvasRunView> { return this.workflowOperation(() => this.runs().approve(quoteId, confirmed, unknownPriceAccepted)); }
  @Remote
  canvasRunSubmit(quoteId: string): Promise<CanvasRunView> { return this.workflowOperation(() => this.runs().submit(quoteId)); }
  @Remote
  canvasRunRefresh(quoteId: string): Promise<CanvasRunView> { return this.workflowOperation(() => this.runs().refresh(quoteId)); }
  private nativeTasks(): CanvasTasks { return this.canvasTasks ??= new CanvasTasks(() => this.canvasConfig()); }
  @Remote
  canvasTasksList(scope: CanvasTaskScope): Promise<CanvasTaskList> { return this.workflowOperation(() => this.nativeTasks().list(scope)); }
  @Remote
  canvasTaskDetail(reference: CanvasTaskReference): Promise<CanvasTaskDetail> { return this.workflowOperation(() => this.nativeTasks().detail(reference)); }
  private transfers(): CanvasTransfer { return this.canvasTransfer ??= new CanvasTransfer(dshHomePath('dsh-zhen', 'canvas-transfer.json'), () => this.canvasConfig(), id => this.media().receipt(id)); }
  @Remote
  canvasTransferSnapshot(): Promise<CanvasTransferView | null> { return this.workflowOperation(() => this.transfers().snapshot()); }
  @Remote
  canvasTransferPreview(input: CanvasTransferInput): Promise<CanvasTransferView> { return this.workflowOperation(() => this.transfers().preview(input)); }
  @Remote
  canvasTransferApprove(id: string, confirmed: boolean): Promise<CanvasTransferView> { return this.workflowOperation(() => this.transfers().approve(id, confirmed)); }
  @Remote
  canvasTransferComplete(id: string): Promise<CanvasTransferView> { return this.workflowOperation(() => this.transfers().complete(id)); }
  @Remote
  canvasTransferPlacement(id: string): Promise<CanvasTransferView> { return this.workflowOperation(() => this.transfers().previewPlacement(id)); }
  @Remote
  canvasTransferRefresh(id: string): Promise<CanvasTransferView> { return this.workflowOperation(() => this.transfers().refresh(id)); }
  @Remote
  defaultArtInfo(): DefaultArtInfo { return this.artDefaults.info(); }
  @Remote
  defaultArtChunk(request: DefaultArtChunkRequest): DefaultArtChunk { try { return this.artDefaults.chunk(request); } catch { throw new RemoteError('zhen/refused', '默认美术引用不可用，请重新读取美术包。', { reason: 'ART_REFERENCE_UNAVAILABLE' }); } }
  @Remote
  canvasCandidates(): CanvasCandidateView[] { return this.canvasInbox.list(this.canvasConfig()); }
  @Remote
  canvasCandidateRemove(id: string): void { this.canvasInbox.remove(id); }
  @Remote
  canvasCandidateAdopt(id: string): Promise<CanvasWorkflowView> {
    const existing = this.canvasAdoptions.get(id); if (existing) return existing;
    const task = this.workflowOperation(async () => {
      const entry = this.canvasInbox.get(id, this.canvasConfig());
      if (!entry) throw new CanvasError('WORKFLOW_CANDIDATE_MISSING', '聊天方案已过期或不属于当前连接，请重新规划。');
      const view = await this.workflows().adopt(entry); this.canvasInbox.remove(id); return view;
    });
    this.canvasAdoptions.set(id, task);
    const settled = () => { if (this.canvasAdoptions.get(id) === task) this.canvasAdoptions.delete(id); };
    void task.then(settled, settled); return task;
  }
  @Remote
  async canvasStatus(): Promise<CanvasConnection> {
    const config = this.canvasConfig();
    if (!config) return { configured: false, root: '', digest: '', connected: false, code: 'NOT_CONFIGURED', message: '选择已安装的 zcanvas-cli 目录，连接现有画布。', compat: null };
    return new CanvasBridge(config).status();
  }
  @Remote
  async canvasTools(): Promise<CanvasToolCatalog | null> {
    const config = this.canvasConfig();
    if (!config) return null;
    try { return canvasToolCatalogSchema.parse(await new CanvasBridge(config).read('capability-tools')); }
    catch (error) { const safe = safeCanvasError(error); throw new RemoteError('zhen/refused', safe.message, { reason: safe.code }); }
  }
  /** Select an installed CLI after reviewing its local code access. No pairing is created. */
  @Remote
  async connectCanvas(root: string, instance: string, expectedDigest = ''): Promise<CanvasConnection> {
    try {
      const config = inspectCanvasCli(root, instance);
      if (expectedDigest && config.digest !== expectedDigest) throw new CanvasError('CLI_CHANGED', '检测后的画布 CLI 已变化，请重新检测并审阅。');
      this.saveCanvasConfig(config);
      await this.mountCanvas?.(config);
      return new CanvasBridge(config).status();
    } catch (error) { const safe = safeCanvasError(error); throw new RemoteError('zhen/refused', safe.message, { reason: safe.code }); }
  }
  @Remote
  async disconnectCanvas(): Promise<void> { await this.mountCanvas?.(); this.saveCanvasConfig(); }

  private localSkills(): LocalSkills { return this.localSkillSources ??= new LocalSkills(dshHomePath('dsh-zhen', 'local-skills.json')); }
  private githubSkills(): GithubSkills { return this.githubSkillSources ??= new GithubSkills(dshHomePath('dsh-zhen', 'github-skills')); }
  private async githubOperation<T>(work: () => T | Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) { throw new RemoteError('zhen/refused', error instanceof GithubSkillError ? error.message : 'GitHub 操作暂不可用或已取消，请检查仓库是否公开及请求是否限频。', { reason: 'GITHUB_SKILL_REFUSED' }); }
  }
  @Remote
  async githubSkillList(): Promise<GithubSkillSourceView[]> { return this.githubOperation(() => this.githubSkills().list()); }
  @Remote
  async githubSkillDownload(spec: GithubSkillSpec): Promise<GithubSkillPreview> { return this.githubOperation(() => this.githubSkills().download(spec, this.mcpOperations.signal)); }
  @Remote
  async githubSkillInspect(id: string, digest: string): Promise<GithubSkillPreview> { return this.githubOperation(() => this.githubSkills().inspect(id, digest)); }
  @Remote
  async githubSkillHistory(id: string): Promise<GithubSkillSummary[]> { return this.githubOperation(() => this.githubSkills().history(id)); }
  @Remote
  async githubSkillFile(id: string, digest: string, location: 'package' | 'origin', path: string): Promise<GithubSkillFilePreview> { return this.githubOperation(() => this.githubSkills().file(id, digest, location, path)); }
  @Remote
  async githubSkillApprove(id: string, digest: string, confirmation: string): Promise<void> { return this.githubOperation(() => this.githubSkills().approve(id, digest, confirmation)); }
  @Remote
  async githubSkillCheck(id: string): Promise<void> { return this.githubOperation(() => this.githubSkills().check(id, this.mcpOperations.signal)); }
  @Remote
  async githubSkillAutomatic(id: string, enabled: boolean): Promise<void> { return this.githubOperation(() => this.githubSkills().automatic(id, enabled)); }
  @Remote
  async githubSkillDisable(id: string): Promise<void> { return this.githubOperation(() => this.githubSkills().disable(id)); }
  @Remote
  async githubSkillForget(id: string): Promise<void> { return this.githubOperation(() => this.githubSkills().forget(id)); }
  @Remote
  async githubSkillCancelPending(id: string): Promise<void> { return this.githubOperation(() => this.githubSkills().cancelPending(id)); }
  @Remote
  async githubSkillDelete(id: string, digest: string): Promise<void> { return this.githubOperation(() => this.githubSkills().deleteRelease(id, digest)); }
  @Remote
  githubSkillCancelDownload(): void { this.githubSkills().cancelDownload(); }
  @Remote
  async localSkillList(): Promise<LocalSkillView[]> {
    try { return await this.localSkills().list(); }
    catch { throw new RemoteError('zhen/refused', '无法读取本地技能目录，请检查配置或重新连接。', { reason: 'LOCAL_SKILL_UNAVAILABLE' }); }
  }
  @Remote
  async localSkillPreview(folder: string, mode: LocalSkillMode): Promise<LocalSkillDraft> {
    try { return await this.localSkills().preview(folder, mode); }
    catch { throw new RemoteError('zhen/refused', '无法扫描技能目录。请使用绝对路径、UTF-8 SKILL.md 和有效的名称/描述；目录可能过大或发生变化。', { reason: 'LOCAL_SKILL_SCAN' }); }
  }
  @Remote
  async localSkillBody(folder: string, directory: string, digest: string): Promise<LocalSkillBody> {
    try { return await this.localSkills().body(folder, directory, digest); }
    catch { throw new RemoteError('zhen/refused', '技能正文不可读取或已变化，请重新扫描。', { reason: 'LOCAL_SKILL_CHANGED' }); }
  }
  @Remote
  async localSkillConnect(folder: string, mode: LocalSkillMode, digest: string, confirmation: string): Promise<void> {
    try { await this.localSkills().connect(folder, mode, digest, confirmation); }
    catch { throw new RemoteError('zhen/refused', '目录尚未确认、清单已变化或没有有效技能，请重新扫描并确认。', { reason: 'LOCAL_SKILL_REFUSED' }); }
  }
  @Remote
  localSkillDisable(id: string): void { this.localSkills().disable(id); }
  @Remote
  localSkillDisconnect(id: string): void { this.localSkills().disconnect(id); }

  /** Read the verified bundled catalog and locally selected versions. */
  @Remote
  marketList(): MarketItem[] { return this.market().list(); }
  /** Read exactly the selected instruction digest before installation. */
  @Remote
  marketPreview(id: string, digest: string, version = ''): SkillPackage { return this.market().preview(id, digest, version); }
  /** Install a new skill or stage a reviewed version for the next Host restart. */
  @Remote
  marketSelect(id: string, digest: string, version = ''): void { this.market().select(id, digest, version); }
  /** Immediately stop new loads and cancel pending changes without deleting user work. */
  @Remote
  marketDisable(id: string): void { this.market().disable(id); }
  @Remote
  marketCancelPending(id: string): void { this.market().cancelPending(id); }
  @Remote
  marketVersions(id: string): SkillPackage[] { return this.market().versions(id); }
  /** Save an independent local instruction version, never overwrite the source. */
  @Remote
  marketFork(id: string, digest: string, body: string, version = ''): string { return this.market().fork(id, digest, body, version); }

  /** List collections in the explicitly selected local project space. */
  @Remote
  ragBackendStatus():RagBackendStatus{return this.rag.snapshot();}
  @Remote
  ragBackendConfigure(selected:string,enabled:boolean,expectedRevision:string):RagBackendStatus{
    try{return this.rag.configure(selected,enabled,expectedRevision);}catch(error){const proposed=error&&typeof error==='object'&&'code'in error?String(error.code):'';const code=Object.hasOwn(ragBackendMessages,proposed)?proposed as keyof typeof ragBackendMessages:'RAG_CONFIGURATION_INVALID';throw new RemoteError('zhen/refused',ragBackendMessages[code],{reason:code});}
  }
  @Remote
  knowledgeCollections(project: string): KnowledgeCollection[] { return this.knowledge().list(project); }

  /** Authorize a local folder as a collection. Does not send contents to a provider. */
  @Remote
  async createKnowledge(project: string, name: string, folder: string): Promise<KnowledgeCollection> { return this.knowledge().create(project, name, folder); }

  /** Index only text files inside an authorized collection. */
  @Remote
  async indexKnowledge(project: string, collectionId: string): Promise<ImportResult> { return this.knowledge().index(project, collectionId); }

  /** Read bounded local diagnostics for the current collection revision only. */
  @Remote
  knowledgeImportReport(project: string, collectionId: string): KnowledgeImportReport | null { return this.knowledge().importReport(project, collectionId); }

  /** Search within the selected project's enabled local collections. */
  @Remote
  searchKnowledge(project: string, query: string): KnowledgeHit[] { return this.knowledge().search(project, query); }

  /** Change local access and the distinct provider permission; revokes old citations immediately. */
  @Remote
  setKnowledgeAccess(project: string, collectionId: string, enabled: boolean, cloudProvider: string): void { this.knowledge().setAccess(project, collectionId, enabled, cloudProvider); }

  /** Read a selected citation after current project, epoch, and provider checks. */
  @Remote
  knowledgeCitation(project: string, hitId: string, epoch: number, provider: string): KnowledgeHit { return this.knowledge().citation(project, hitId, epoch, provider); }

  /** Read indexed source context locally; does not grant cloud or agent permission. */
  @Remote
  knowledgeSource(project: string, hitId: string, epoch: number): KnowledgeSource { return this.knowledge().source(project, hitId, epoch); }

  /** Read configuration presence without returning a credential or probing a paid endpoint. */
  @Remote
  async status(): Promise<ZhenStatus> {
    const info = await this.ctx.credentials.describe(seedanceCredential);
    return { version: '0.1.0', provider: 'seedance', model: 'deepseek/deepseek-v4.1-flash',
      credentialConfigured: info.configured, credentialWritable: info.writable, gatewayVerified: false };
  }

  private checks(): GatewayChecks {
    return this.gatewayChecks ??= new GatewayChecks(dshHomePath('dsh-zhen', 'gateway-checks.sqlite'), async signal => {
      if (!this.ctx.llm) throw new Error('聊天服务尚未就绪。');
      return this.ctx.llm.prepareCall({ provider: 'seedance', model: GATEWAY_CHECK_MODEL, maxTokens: 32 }, signal);
    });
  }
  /** Fixed short request preview; no stream dispatch or credential value read. */
  @Remote
  async gatewayCheckPreview(): Promise<GatewayCheckPreview> {
    if (!(await this.ctx.credentials.describe(seedanceCredential)).configured) throw new RemoteError('zhen/refused', '请先保存 Seedance API 令牌。', { reason: 'MISSING_CREDENTIAL' });
    try { return await this.checks().preview(); }
    catch { throw new RemoteError('zhen/refused', '暂时无法准备检查，请确认聊天服务就绪且没有其他检查正在进行。', { reason: 'CHECK_UNAVAILABLE' }); }
  }
  @Remote
  gatewayCheckHistory(): GatewayCheckReceipt[] { return this.checks().list(); }
  /** One receipt can dispatch at most once, including ambiguous interruptions. */
  @Remote
  async gatewayCheckRun(id: string, confirmation: string): Promise<GatewayCheckReceipt> {
    try { return await this.checks().run(id, confirmation); }
    catch { throw new RemoteError('zhen/refused', '检查未能启动，请刷新记录。已消耗的检查不会重发。', { reason: 'CHECK_REFUSED' }); }
  }
  @Remote
  gatewayCheckCancel(id: string): GatewayCheckReceipt { return this.checks().cancel(id); }

  /** Save the Seedance credential using the Host credential service. Never return its value. */
  @Remote
  async saveCredential(value: string): Promise<void> {
    if (value.length < 8 || value.length > 4096 || /\s/.test(value)) {
      throw new RemoteError('zhen/refused', '请输入有效 API 令牌，不要包含空格或换行。', { reason: 'INVALID_CREDENTIAL' });
    }
    this.invalidateSeedance();
    await this.ctx.credentials.set(seedanceCredential, value);
  }

  /** Remove this provider's locally writable credential. */
  @Remote
  async removeCredential(): Promise<void> { this.invalidateSeedance(); await this.ctx.credentials.unset(seedanceCredential); }

  private stopWalletReads(): void {
    this.seedanceGeneration++;
    for (const controller of this.walletReads) controller.abort();
  }
  private invalidateSeedance(): void {
    this.stopWalletReads();
    this.gatewayChecks?.invalidate();
    this.mediaTasks?.invalidate();
    this.mediaExports?.invalidate();
  }

  private tasks(): GatewayTasks { return this.mediaTasks ??= new GatewayTasks(dshHomePath('dsh-zhen', 'gateway-tasks.sqlite'), async () => (await this.ctx.credentials.resolve(seedanceCredential))?.value); }
  private async taskOperation<T>(run: () => T | Promise<T>): Promise<T> {
    try { return await run(); }
    catch (error) { throw new RemoteError('zhen/refused', error instanceof GatewayTaskError && error.code === 'BUSY' ? '正在查询其他任务，请稍后刷新。' : '任务记录暂时不可用，请检查编号和协议。', { reason: error instanceof GatewayTaskError ? error.code : 'UNAVAILABLE' }); }
  }
  @Remote
  gatewayTaskList(): Promise<GatewayTaskRecord[]> { return this.taskOperation(() => this.tasks().list()); }
  @Remote
  gatewayTaskAdd(spec: GatewayTaskSpec): Promise<GatewayTaskRecord> { return this.taskOperation(() => this.tasks().add(spec)); }
  @Remote
  gatewayTaskRefresh(id: string): Promise<GatewayTaskRecord> { return this.taskOperation(() => this.tasks().refresh(id)); }
  @Remote
  gatewayTaskTracking(id: string, enabled: boolean): Promise<GatewayTaskRecord> { return this.taskOperation(() => this.tasks().tracking(id, enabled)); }
  @Remote
  gatewayTaskRemove(id: string): Promise<void> { return this.taskOperation(() => { this.mediaExports?.revokeTask(id); this.tasks().remove(id); }); }

  private media(): GatewayMedia { return this.mediaExports ??= new GatewayMedia(dshHomePath('dsh-zhen', 'media-exports'), id => this.tasks().mediaSources(id), id => this.tasks().list().some(item => item.id === id && item.status === 'succeeded')); }
  private async mediaOperation<T>(run: () => T | Promise<T>): Promise<T> {
    try { return await run(); }
    catch (error) {
      const code = error instanceof GatewayMediaError || error instanceof MediaDownloadError ? error.code : 'UNAVAILABLE';
      const message = code === 'DIRECTORY' ? '请选择已存在的本机保存文件夹。' : code === 'FILE' ? '本地文件不可写或已存在，请核对保存位置。已有文件不会被覆盖。' : code === 'BUSY' ? '已有结果正在保存，请稍后操作。' : code === 'EXPIRED' ? '结果清单或链接已过期，请重新获取原任务的结果。' : code === 'SOURCE' ? '结果地址不是可用的公网媒体来源。' : code === 'FORMAT' ? '结果不是当前支持的媒体或归档格式。' : code === 'LIMIT' ? '结果或本地记录超过上限，请检查文件大小或清理记录。' : code === 'CANCELLED' ? '本次下载已停止，已经保存的文件保留。' : '结果暂时无法保存，请稍后查询原任务。';
      throw new RemoteError('zhen/refused', message, { reason: code });
    }
  }
  @Remote
  gatewayMediaPreview(id: string): Promise<GatewayMediaTicket[]> { return this.mediaOperation(() => this.media().preview(id)); }
  @Remote
  gatewayMediaSave(id: string, folder: string): Promise<GatewayMediaReceipt> { return this.mediaOperation(() => this.media().save(id, folder)); }
  @Remote
  gatewayMediaList(): Promise<GatewayMediaReceipt[]> { return this.mediaOperation(() => this.media().list()); }
  @Remote
  gatewayMediaCancel(id: string): Promise<void> { return this.mediaOperation(() => this.media().cancel(id)); }
  @Remote
  gatewayMediaForget(id: string): Promise<void> { return this.mediaOperation(() => this.media().forget(id)); }

  /** Read wallet balance on the Host; a successful read does not verify chat access. */
  @Remote
  async wallet(): Promise<Wallet> {
    const generation = this.seedanceGeneration, controller = new AbortController();
    const current = (): boolean => !this.walletClosed && !controller.signal.aborted && generation === this.seedanceGeneration;
    const changed = (): GatewayError => new GatewayError('CONFIG_CHANGED', '连接配置已变化，请重新查询钱包。');
    this.walletReads.add(controller);
    try {
      if (!current()) throw changed();
      const resolved = await this.ctx.credentials.resolve(seedanceCredential);
      if (!current()) throw changed();
      if (!resolved) throw new GatewayError('MISSING_CREDENTIAL', '请先添加 Seedance API 令牌。');
      const result = await readWallet(resolved.value, fetch, controller.signal);
      if (!current()) throw changed();
      return result;
    }
    catch (error) {
      const failure = current() ? error : changed();
      if (failure instanceof GatewayError) throw new RemoteError('zhen/refused', failure.message, { reason: failure.code });
      throw new RemoteError('zhen/refused', '钱包暂时不可用。', { reason: 'WALLET_UNAVAILABLE' });
    } finally { this.walletReads.delete(controller); }
  }
}
