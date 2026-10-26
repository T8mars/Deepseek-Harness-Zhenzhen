import type {RecoveryPlan} from './recovery-layout-schema.ts';
import type {RecoveryProjects,ProjectAwareRestore} from './recovery-project-schema.ts';
import type { Context } from '@deepseek-ai/cordis';
import {symbols} from '@deepseek-ai/cordis';
import {BackupCenter} from './backup-center.ts';
import {RecoveryApplication} from './recovery-application.ts';
import type {RecoveryApplicationReviewRequest,RecoveryApplicationReview,RecoveryApplicationOpenRequest,RecoveryApplicationControlRequest,RecoveryApplicationStatus} from './recovery-application-schema.ts';
import {summarizeEnvironment,summarizeSessions,summarizeSkills,summarizeKnowledge,summarizeRecords,summarizeWorkspaces} from './recovery-summary.ts';
import {readRestoredSkillReview} from './restore-skills.ts';
import {registerRestoredSkillProviders} from './restored-skill-provider.ts';
import {readRestoredSkillProjects} from './restored-skill-projects.ts';
import {prepareRestoredSkillBackupSource} from './restored-skill-backup.ts';
import {RestoredSkillConsent} from './restored-skill-consent.ts';
import {RestoredManagedSkillConsent} from './restored-managed-skill-consent.ts';
import {RestoredManagedRuntime} from './restored-managed-runtime.ts';
import type {ManagedRuntimeSelection} from './restored-managed-runtime.ts';
import type {RestoredManagedRuntimeView,RestoredManagedRuntimeRequest} from './restored-managed-runtime-schema.ts';
import type {SkillProvider,SkillProviderControl} from '@deepseek-ai/dsh-skill';
import type {RestoredManagedSkillView,RestoredManagedSkillRequest} from './restored-managed-skill-schema.ts';
import {backupJsonString} from './backup-data.ts';
import type {RestoredSkillConsentView,RestoredSkillConsentRequest} from './restored-skill-consent-schema.ts';
import type {RecoveryPreview,RecoveryCatalogView} from './recovery-schema.ts';
import {prepareProfilePackageBackup,restoreProfilePackageBackup} from './backup-profile-packages.ts';
import {restoreSessionBackup} from './backup-sessions.ts';
import {restoreSkillInventoryBackup} from './backup-skill-inventory.ts';
import {restoreRagBackup} from './backup-rag.ts';
import {restoreOwnedStateBackup} from './backup-owned.ts';
import {restoreWorkspaceBackup} from './backup-workspaces.ts';
import type {BackupAdapters} from './backup-composition.ts';
import type {BackupCreate,BackupInfo,BackupFiles,BackupJob} from './backup-center-schema.ts';
import type {ProfileContext} from '@deepseek-ai/dsh-app-boot';
import {createCanvasHelpTool} from './canvas-help-tool.ts';
import type {} from '@deepseek-ai/dsh-host-directory-picker';
import {DirectoryChoices,DirectoryChoiceError} from './directory-choice.ts';
import type {DirectoryChoiceInfo,DirectoryChoiceRequest,DirectoryChoiceBrowseRequest,DirectoryChoiceResult,DirectoryChoiceBrowseResult} from './directory-choice-schema.ts';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { credentialSource } from './client/credential-source.ts';
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { readWallet, GatewayError } from './gateway.ts';
import { DefaultArt } from './default-art.ts';
import type { DefaultArtInfo, DefaultArtChunkRequest, DefaultArtChunk } from './default-art-schema.ts';
import type { Wallet } from './gateway.ts';
import type {} from './remote.ts';
import { dshHomePath,resolveAgentsHome } from '@deepseek-ai/dsh-home-paths';
import {prepareOwnedStateBackup} from './backup-owned.ts';
import type {OwnedStateBackupPolicy,OwnedStateBackupLease} from './backup-owned.ts';
import { KnowledgeStore } from './knowledge.ts';
import {ZhenRag} from './rag-service.ts';
import type {RagBackendStatus} from './rag-backend-schema.ts';
import {ragBackendMessages} from './rag-backend-schema.ts';
export {ZhenRag} from './rag-service.ts';
export type {RagSearchProvider,RagProviderScope,RagContext} from './rag-service.ts';
export type {RagBackendStatus} from './rag-backend-schema.ts';
import type { KnowledgeCollection, KnowledgeHit, KnowledgeSource, KnowledgeSpacePage, ImportResult } from './knowledge.ts';
import type {KnowledgeImportReport} from './knowledge-import-schema.ts';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-skill';
import { SkillMarket, readBundledCatalog } from './market.ts';
import { SkillFeed } from './skill-feed.ts';
import {hostSkillInventorySource} from './backup-host-skills.ts';
import {SkillSourceTracker} from './backup-skill-tracker.ts';
import type {HostSkillBackupPolicy} from './backup-host-skills.ts';
import {prepareSkillInventoryBackup} from './backup-skill-inventory.ts';
import type {SkillInventoryBackupLease} from './backup-skill-inventory.ts';
import {prepareSessionBackup} from './backup-sessions.ts';
import type {SessionBackupLease} from './backup-sessions.ts';
import {sessionLogExportDeps} from '@deepseek-ai/dsh-session-log-export';
import {workspaceDomainSpec} from '@deepseek-ai/dsh-workspace';
import {prepareWorkspaceBackup} from './backup-workspaces.ts';
import type {WorkspaceBackupLease} from './backup-workspaces.ts';
import {BackupError} from './backup-archive.ts';
import type {BackupOptions,BackupRecord} from './backup-archive.ts';
import {prepareRagBackup} from './backup-rag.ts';
import {readonlyKnowledgeSource} from './knowledge-backup.ts';
import type {RagBackupLease,RagBackupPolicy} from './backup-rag.ts';
import {preparePackageBackup} from './backup-packages.ts';
import type {PackageBackupLease} from './backup-packages.ts';
import {hostPackageBackupSource} from './backup-host-packages.ts';
import type {HostPackageBackupPolicy} from './backup-host-packages.ts';
import { GithubAccess } from './github-access.ts';
import { FIRST_PARTY_REPOSITORY, githubCredentialValue } from './github-access-schema.ts';
import type { GithubAccessInfo } from './github-access-schema.ts';
import type { MarketItem, SkillPackage, SkillAutoPolicy } from './market-schema.ts';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import { CanvasBridge, inspectCanvasCli, safeCanvasError } from './canvas.ts';
import type { CanvasConfig, CanvasConnection } from './canvas.ts';
import type {CanvasActiveTargets} from './canvas-active-schema.ts';
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
import { UpdateMonitor, ownBundleVersion } from './updates.ts';
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
export type {CanvasActiveContext,CanvasActiveTargets} from './canvas-active-schema.ts';
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
export type { KnowledgeCollection, KnowledgeHit, KnowledgeSource, KnowledgeSpacePage, ImportResult } from './knowledge.ts';
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
  credentialSource?: import('./client/credential-source.ts').CredentialSource;
  gatewayVerified: boolean;
}

declare module '@deepseek-ai/cordis' {
  interface Context { zhen: ZhenService;zhenRag:ZhenRag; }
}

const seedanceCredential = credentialRef('SEEDANCE_API_KEY');
const githubCredential = credentialRef('DSH_ZHEN_GITHUB_TOKEN');

/** Creator workspace Host operations, guarded by DSH's authenticated Remote access. */
export default class ZhenService extends TypertRemoteService {
  private readonly backupCenter:BackupCenter;
  private recoveryApplication?:RecoveryApplication;
  private readonly restoredConsent:RestoredSkillConsent;
  private readonly restoredManagedConsent:RestoredManagedSkillConsent;
  private readonly restoredManagedRuntime:RestoredManagedRuntime;
  private managedEpoch?:string;
  private managedRole:ManagedRuntimeSelection|null=null;
  private readonly managedProviderListeners=new Set<()=>void>();
  private readonly managedRegistration={depth:0};
  private readonly backupProfile:ProfileContext|undefined;
  private readonly directoryChoices:DirectoryChoices;
  static inject: string[] = ['credentials'];
  private knowledgeStore?: KnowledgeStore;
  // One Host keeps its startup data root even if another plugin changes env/cwd.
  private readonly zhenHome=dshHomePath('dsh-zhen');
  private readonly restoredSkills=readRestoredSkillReview(this.zhenHome);
  private readonly restoredSkillProjects=readRestoredSkillProjects(dirname(this.zhenHome));
  private readonly agentsHome=resolveAgentsHome();
  private readonly knowledgeFile=join(this.zhenHome,'knowledge.sqlite');
  private readonly mcpHome=join(this.zhenHome,'mcp');
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
  private canvasQuickConnecting?: Promise<CanvasPairingView>;
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
    this.backupProfile=ctx.get('profileContext');
    const managedProfileName=this.backupProfile?.name,managedProfileHome=this.backupProfile?.home,originalManaged=(value:unknown)=>value&&(value as {[symbols.original]?:object})[symbols.original]||value;
    const managedContextCurrent=()=>!!this.backupProfile&&originalManaged(ctx.get('profileContext'))===originalManaged(this.backupProfile)&&this.backupProfile.name===managedProfileName&&this.backupProfile.home===managedProfileHome&&managedProfileHome===dirname(this.zhenHome)&&(this.managedRegistration.depth>0||originalManaged(ctx.get('zhen'))===originalManaged(this));
    this.restoredManagedConsent=new RestoredManagedSkillConsent(dirname(this.zhenHome),this.backupProfile?.name,!!this.restoredSkills,()=>({market:this.market(),local:this.localSkills(),github:this.githubSkills()}),async()=>{
      const original=(value:unknown)=>value&&(value as {[symbols.original]?:object})[symbols.original]||value;
      if(!managedContextCurrent()||backupJsonString(readRestoredSkillReview(this.zhenHome))!==backupJsonString(this.restoredSkills))throw new BackupError('BACKUP_MANAGED_SKILL_SOURCE_CHANGED');
    },managedContextCurrent);
    ctx.effect(()=>()=>this.restoredManagedConsent.close(),'zhen: restored managed skill consent');
    this.restoredManagedRuntime=new RestoredManagedRuntime(dirname(this.zhenHome),this.backupProfile?.name,!!this.restoredSkills,()=>({market:this.market(),local:this.localSkills(),github:this.githubSkills(),feed:this.feed()}),async()=>{
      if(!managedContextCurrent()||backupJsonString(readRestoredSkillReview(this.zhenHome))!==backupJsonString(this.restoredSkills))throw new BackupError('BACKUP_MANAGED_RUNTIME_CHANGED');
    },managedContextCurrent);
    const stopManagedRuntime=this.restoredManagedRuntime.subscribe(()=>{const selected=this.ensureManagedRole();if(selected&&!selected.entry.enabled)this.githubSkillSources?.cancelDownload();if(selected&&this.skillFeed)this.skillFeed.snapshot();for(const listener of this.managedProviderListeners)listener();});
    ctx.effect(()=>()=>{stopManagedRuntime();this.restoredManagedRuntime.close();},'zhen: restored managed runtime');
    this.restoredConsent=new RestoredSkillConsent(dirname(this.zhenHome),this.backupProfile?.name,async()=>{
      const profile=this.backupProfile;if(!profile||ctx.get('profileContext')!==profile)throw new BackupError('BACKUP_HOST_PROFILE_UNAVAILABLE');
      const source=await prepareRestoredSkillBackupSource(ctx,dirname(this.zhenHome),()=>{throw new BackupError('BACKUP_COMPONENT_UNAVAILABLE');},{profileOnly:true});
      const proof=source.forProfiles({home:profile.home,installAnchor:profile.installAnchor,active:profile});
      return async()=>{if(ctx.get('profileContext')!==profile)throw new BackupError('BACKUP_SOURCE_CHANGED');await proof.assertCurrent?.();};
    });
    this.backupCenter=new BackupCenter(join(this.zhenHome,'backups'),()=>this.backupAdapters(),{catalogFile:join(this.zhenHome,'recovery-candidates.sqlite'),application:this.backupProfile?{installAnchor:this.backupProfile.installAnchor}:undefined});
    ctx.effect(()=>()=>this.backupCenter.close(),'zhen: local backup jobs');
    ctx.effect(()=>()=>this.recoveryApplication?.close(),'zhen: recovered application preparation');
    this.directoryChoices=new DirectoryChoices(()=>{const service=ctx.get('directoryPicker');return service?{owner:(service as unknown as {[key:symbol]:object|undefined})[symbols.original]??service,capability:service.capability()}:undefined;});
    ctx.effect(()=>()=>this.directoryChoices.close(),'zhen: directory choice lifetime');
    ctx.inject(['directoryPicker'],inner=>{this.directoryChoices.invalidate();inner.effect(()=>()=>this.directoryChoices.invalidate(),'zhen: directory provider lifetime');});
    const skillSources=new SkillSourceTracker(ctx);ctx.provide('zhenSkillBackupSources',skillSources);
    this.rag=new ZhenRag(()=>this.knowledge(),join(this.zhenHome,'rag-backend.json'));
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
      // Keep the recovery route available before setup, after disconnect, and
      // while saved connection metadata is damaged. Prompt assembly is read-only.
      interpolate: false, text: canvasGuidance,
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
      if (existsSync(join(this.zhenHome,'gateway-tasks.sqlite'))) this.tasks();
      const interval = setInterval(() => { void this.mediaTasks?.automatic().catch(() => {}); }, 5000); interval.unref();
      return () => clearInterval(interval);
    }, 'zhen: explicitly enabled task tracking');
    ctx.effect(() => () => { this.skillMarket?.close(); }, 'zhen: skill market');
    ctx.effect(() => () => { this.mcpOperations.abort(); this.mcpMarket?.close(); }, 'zhen: MCP market');
    ctx.effect(() => {
      const controller = new AbortController();
      const check = () => {
        void this.updates().automaticCheck(controller.signal).catch(() => {});
        if(this.canCheckManaged())void this.feed().automaticCheck(controller.signal).catch(() => {});
        void this.mcps().automaticCheck(controller.signal).catch(() => {});
        void this.capabilityUpdates().automaticCheck(controller.signal).catch(() => {});
        if(this.canCheckManaged())void this.githubSkills().automaticCheck(controller.signal).catch(() => {});
      };
      const start = setTimeout(check, 30000); start.unref();
      const interval = setInterval(check, 3600000); interval.unref();
      return () => { clearTimeout(start); clearInterval(interval); controller.abort(); };
    }, 'zhen: public update metadata');
    ctx.inject(['skills'], inner => inner.skills.registerProvider(control =>this.managedProvider(control,()=>this.market())));
    ctx.inject(['skills'], inner => inner.skills.registerProvider(control =>this.managedProvider(control,()=>this.localSkills())));
    ctx.inject(['tools'], inner => inner.tools.register(createCapabilityTool(() => this.capabilities())));
    ctx.inject(['tools'], inner => inner.tools.register(createCanvasHelpTool()));
    ctx.inject(['skills'], inner => inner.skills.registerProvider(control =>this.managedProvider(control,()=>this.githubSkills())));
    registerRestoredSkillProviders(ctx,dirname(this.zhenHome),this.backupProfile?.name);
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
      // Existing handles remain authoritative even if ambient home or the path
      // changes. Cold discovery uses the same fixed path as its service owner.
      const ragGrants = !!options.sessionId && (!!service.knowledgeStore || existsSync(service.knowledgeFile)) && service.knowledge().hasSessionGrants(options.sessionId);
      const mcpGrants = !!options.sessionId && (!!service.mcpMarket || existsSync(join(service.mcpHome,'session-grants.sqlite'))) && service.mcps().hasSessionGrants(options.sessionId);
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
    return this.knowledgeStore ??= new KnowledgeStore(this.knowledgeFile);
  }
  private capabilities(): CapabilityCatalog { return this.capabilityCatalog ??= readCapabilityCatalog(); }
  private capabilityUpdates(): CapabilityMonitor { return this.capabilityMonitor ??= new CapabilityMonitor(join(this.zhenHome,'capabilities.json'), this.capabilities()); }
  @Remote
  gatewayCatalog(): CapabilityCatalog { return structuredClone(this.capabilities()); }
  @Remote
  gatewayCatalogCheckSnapshot(): CapabilityCheck { return this.capabilityUpdates().snapshot(); }
  @Remote
  async gatewayCatalogCheck(): Promise<CapabilityCheck> { return this.capabilityUpdates().check(this.mcpOperations.signal); }
  @Remote
  gatewayCatalogAutomatic(enabled: boolean): void { this.capabilityUpdates().setAutomatic(enabled); }
  private mcps(): McpMarket { return this.mcpMarket ??= new McpMarket(this.mcpHome); }
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
    const role=this.ensureManagedRole();
    if (!this.skillMarket) {
      if(role){const runtime=this.restoredManagedRuntime.policy(role);this.skillMarket=new SkillMarket(join(role.root,'s.db'),[],{runtime,catalog:role.role.catalog,bundled:role.role.bundled});this.skillFeed=new SkillFeed(join(role.root,'f.json'),this.skillMarket,fetch,this.githubAccess(),{runtime});}
      else{this.skillMarket = new SkillMarket(join(this.zhenHome,'skills.sqlite'), this.restoredSkills?[]:readBundledCatalog(),this.restoredSkills?{candidateState:this.restoredSkills.market}:undefined);this.skillFeed = new SkillFeed(join(this.zhenHome,'skills-feed.json'), this.skillMarket, fetch, this.githubAccess(),this.restoredSkills?{candidateState:this.restoredSkills.feed,reviewOnly:true}:undefined);}
    }
    return this.skillMarket;
  }
  private feed(): SkillFeed { this.market(); return this.skillFeed!; }
  private ensureManagedRole():ManagedRuntimeSelection|null{
    const selected=this.restoredManagedRuntime.selection(),epoch=selected?selected.entry.epoch+':'+selected.granted:'';
    if(this.managedEpoch!==undefined&&this.managedEpoch!==epoch){this.localSkillSources?.close();this.githubSkillSources?.close();this.skillMarket?.close();this.localSkillSources=undefined;this.githubSkillSources=undefined;this.skillMarket=undefined;this.skillFeed=undefined;}
    this.managedEpoch=epoch;this.managedRole=selected;return selected;
  }
  private canCheckManaged():boolean{try{return !this.restoredSkills||!!this.restoredManagedRuntime.selection()?.entry.enabled;}catch{return false;}}
  private managedProvider(control:SkillProviderControl,source:()=>Pick<SkillMarket,'subscribe'|'provider'>):SkillProvider{
    let unsubscribe=()=>{};const bind=()=>{unsubscribe();unsubscribe=source().subscribe(control.invalidate);control.invalidate();},provider=(owner:ReturnType<typeof source>)=>owner.provider(this.restoredSkills&&!this.managedRole?.granted?this.restoredManagedConsent:undefined);let name:string;
    // Cordis initializes dependency providers before publishing this Service.
    // Only this synchronous registration uses the fixed profile/home proof;
    // subsequent reads, Owner calls and writes require the actual Service too.
    this.managedRegistration.depth++;try{bind();name=provider(source()).name;}catch(error){unsubscribe();throw error;}finally{this.managedRegistration.depth--;}
    this.managedProviderListeners.add(bind);const stopConsent=this.restoredManagedConsent.subscribe(control.invalidate);control.signal.addEventListener('abort',()=>{unsubscribe();stopConsent();this.managedProviderListeners.delete(bind);},{once:true});
    const unavailable=(error:unknown)=>error instanceof BackupError&&error.code.startsWith('BACKUP_MANAGED_RUNTIME_');
    return{name,list:async options=>{try{const owner=source(),result=await provider(owner).list(options);return source()===owner?result:[];}catch(error){options.signal?.throwIfAborted();if(unavailable(error))return [];throw error;}},get:async(candidate,options)=>{try{const owner=source(),result=await provider(owner).get(candidate,options);return source()===owner?result:undefined;}catch(error){options.signal?.throwIfAborted();if(unavailable(error))return undefined;throw error;}}};
  }
  private backupAdapters():BackupAdapters{
    const profile=this.backupProfile,home=dirname(this.zhenHome),policy={protectedContainers:[home,this.agentsHome],forbiddenTrees:[] as string[]};
    const profileSource=()=>{if(!profile||this.ctx.get('profileContext')!==profile)throw new BackupError('BACKUP_HOST_PROFILE_UNAVAILABLE');return {home:profile.home,installAnchor:profile.installAnchor,active:profile};};
    const deps=sessionLogExportDeps(this.ctx),facility=this.ctx.get('storageDomain');
    return {
      environment:{available:!!profile&&!!this.ctx.get('pluginPackages'),prepare:async(password,options)=>{const restored=this.hasRestoredSkillProjects()?await prepareRestoredSkillBackupSource(this.ctx,home,()=>{throw new BackupError('BACKUP_COMPONENT_UNAVAILABLE');},{...options,profileOnly:true}):undefined;return prepareProfilePackageBackup(password,{profiles:()=>restored?restored.forProfiles(profileSource()):profileSource(),packages:()=>hostPackageBackupSource(this.ctx,policy),includeProfileDependencies:true},options);},restore:async(file,password,parent,options)=>summarizeEnvironment(await restoreProfilePackageBackup(file,password,parent,{...options,installAnchor:profileSource().installAnchor}))},
      sessions:{available:!!deps.sessionPersistence&&!!deps.sessionQuery&&!!deps.attachments,prepare:(_password,options)=>this.sessionBackupLease(options),restore:async(...args)=>summarizeSessions(await restoreSessionBackup(...args))},
      skills:{available:(!this.hasRestoredSkillProjects()||!!this.ctx.get('loader'))&&!!this.localSkillSources&&!!this.githubSkillSources&&!!this.skillMarket&&!!this.skillFeed&&!!deps.sessionPersistence,prepare:async(_password,options)=>{
        // Complete persistent headers include historical working directories.
        const persistence=this.ctx.get('sessionPersistence');if(!persistence)throw new BackupError('BACKUP_HOST_SERVICES_UNAVAILABLE');const snapshots=await persistence.list({signal:options.signal}),revisions=new Map(snapshots.map(row=>[row.header.id,row.revision]));
        const original=(value:unknown)=>value&&(value as {[symbols.original]?:object})[symbols.original]||value,owner=original(persistence);
        const assertHeaders=async()=>{try{if(original(this.ctx.get('sessionPersistence'))!==owner)throw new BackupError('BACKUP_SOURCE_CHANGED');const current=await persistence.list({signal:options.signal});if(current.length!==revisions.size||current.some(row=>row.revision!==revisions.get(row.header.id)))throw new BackupError('BACKUP_SOURCE_CHANGED');}catch(error){options.signal?.throwIfAborted();if(error instanceof BackupError)throw error;throw new BackupError('BACKUP_SESSION_READ_FAILED');}};
        const workspaces=[...new Set(snapshots.map(row=>row.header.cwd).filter((value):value is string=>value!==undefined))],lease=await this.skillBackupLease(()=>({...policy,additionalWorkspaces:workspaces}),options);
        return {...lease,assertCurrent:async()=>{await assertHeaders();await lease.assertCurrent();},async*records(){await assertHeaders();yield*lease.records();await assertHeaders();}};
      },restore:async(...args)=>summarizeSkills(await restoreSkillInventoryBackup(...args))},
      knowledge:{prepare:(_password,options)=>this.ragBackupLease(()=>policy,options),restore:async(...args)=>summarizeKnowledge(await restoreRagBackup(...args))},
      records:{prepare:(_password,options)=>this.ownedStateBackupLease(()=>({mediaRoots:[],forbiddenTrees:[]}),options),restore:async(...args)=>summarizeRecords(await restoreOwnedStateBackup(...args))},
      workspaces:{available:!!facility?.get(workspaceDomainSpec.name),prepare:(_password,options)=>this.workspaceBackupLease(options),restore:async(...args)=>summarizeWorkspaces(await restoreWorkspaceBackup(...args))},
    };
  }
  @Remote
  backupInfo():BackupInfo{const info=this.backupCenter.info();if(this.hasRestoredSkillProjects()&&!this.ctx.get('loader'))info.limitations.push('恢复后的项目技能缺少配置入口，技能范围暂不可备份。请保留原始备份与恢复候选，并在完整应用中打开。');return info;}
  @Remote
  restoredSkillConsent(page:number):Promise<RestoredSkillConsentView>{return this.restoredConsent.view(page);}
  @Remote
  restoredSkillConsentChange(request:RestoredSkillConsentRequest):Promise<RestoredSkillConsentView>{return this.restoredConsent.change(request);}
  @Remote
  async restoredManagedSkillConsent(page:number):Promise<RestoredManagedSkillView>{if(this.restoredManagedRuntime.selection()?.granted)return{available:false,reason:'not-restored',profile:this.backupProfile?.name??null,snapshot:null,items:[],total:0,page:0,nextPage:null,updatesPaused:true,applicationActivated:false};return this.restoredManagedConsent.view(page);}
  @Remote
  restoredManagedSkillConsentChange(request:RestoredManagedSkillRequest):Promise<RestoredManagedSkillView>{if(this.restoredManagedRuntime.selection()?.granted)throw new BackupError('BACKUP_MANAGED_RUNTIME_ACTIVE');return this.restoredManagedConsent.change(request);}
  @Remote
  restoredManagedRuntimeStatus(page:number):Promise<RestoredManagedRuntimeView>{return this.restoredManagedRuntime.view(page);}
  @Remote
  restoredManagedRuntimeChange(request:RestoredManagedRuntimeRequest):Promise<RestoredManagedRuntimeView>{return this.restoredManagedRuntime.change(request);}
  @Remote
  backupFiles(folder:string):Promise<BackupFiles>{return this.backupCenter.files(folder);}
  @Remote
  backupCreate(request:BackupCreate):BackupJob{return this.backupRequest(()=>this.backupCenter.startBackup(request));}
  @Remote
  backupRestore(request:ProjectAwareRestore):BackupJob{return this.backupRequest(()=>this.backupCenter.startRestore(request));}
  private backupRequest(run:()=>BackupJob):BackupJob{try{return run();}catch(error){if(error instanceof BackupError&&/^BACKUP_[A-Z_]{1,64}$/.test(error.code))throw new RemoteError('zhen/refused',error.code==='BACKUP_BUSY'?'已有备份、恢复或候选校验正在进行。':'本次请求未启动新任务，请查看原任务或原候选记录。',{reason:error.code});throw error;}}
  @Remote
  backupStatus(id:string):BackupJob{return this.backupCenter.status(id);}
  @Remote
  backupCancel(id:string):void{this.backupCenter.cancel(id);}
  @Remote
  backupCandidateSnapshot(id:string):RecoveryPreview{return this.backupCenter.candidateSnapshot(id);}
  @Remote
  backupCandidateVerify(id:string):Promise<RecoveryPreview>{return this.backupCenter.candidateVerify(id);}
  @Remote
  backupCandidatePlan(id:string):Promise<RecoveryPlan>{return this.backupCenter.candidatePlan(id);}
  @Remote
  backupCandidateProjects(id:string,cursor:string):Promise<RecoveryProjects>{return this.backupCenter.candidateProjects(id,cursor);}
  @Remote
  backupCandidateList(cursor:string):RecoveryCatalogView{return this.backupCenter.candidateList(cursor);}
  @Remote
  backupCandidateForget(id:string):void{this.backupCenter.candidateForget(id);}
  @Remote
  backupCandidateRegister(id:string):Promise<BackupJob>{return this.backupCenter.candidateRegister(id);}
  private recovery():RecoveryApplication{
    const profile=this.backupProfile,original=(value:unknown)=>value&&(value as {[symbols.original]?:object})[symbols.original]||value;
    if(!profile||original(this.ctx.get('profileContext'))!==original(profile))throw new BackupError('BACKUP_HOST_PROFILE_UNAVAILABLE');
    return this.recoveryApplication??=new RecoveryApplication(dirname(this.zhenHome),profile.installAnchor,()=>this.ctx.credentials,this.backupCenter);
  }
  private async applicationRequest<T>(run:()=>Promise<T>):Promise<T>{try{return await run();}catch(error){throw new RemoteError('zhen/refused','恢复应用操作未完成，请查看当前状态并保留原备份。',{reason:error instanceof BackupError?error.code:'BACKUP_APPLICATION_OPERATION_FAILED'});}}
  @Remote
  backupApplicationReview(request:RecoveryApplicationReviewRequest):Promise<RecoveryApplicationReview>{return this.applicationRequest(()=>this.recovery().review(request));}
  @Remote
  backupApplicationOpen(request:RecoveryApplicationOpenRequest):Promise<RecoveryApplicationStatus>{return this.applicationRequest(()=>this.recovery().open(request));}
  @Remote
  backupApplicationStatus(id:string):Promise<RecoveryApplicationStatus>{return this.applicationRequest(()=>this.recovery().status(id));}
  @Remote
  backupApplicationControl(request:RecoveryApplicationControlRequest):Promise<RecoveryApplicationStatus>{return this.applicationRequest(()=>this.recovery().control(request));}
  /** Host-only stream for the composed backup. Not a browser Remote: source
   * paths, backup passwords and archive bytes stay on the Host. Never construct
   * a managed service here, since its startup may activate a pending update. */
  async skillBackupLease(policy:()=>HostSkillBackupPolicy,options:BackupOptions={}):Promise<SkillInventoryBackupLease>{
    const restored=this.hasRestoredSkillProjects();if(restored&&!this.ctx.get('loader'))throw new BackupError('BACKUP_SKILL_PROJECT_REBACKUP_PENDING');
    const original=(value:unknown)=>value&&(value as {[symbols.original]?:object})[symbols.original]||value,owner=original(this);
    if(original(this.ctx.get('zhen'))!==owner)throw new BackupError('BACKUP_SOURCE_CHANGED');
    const source=()=>{
      if(original(this.ctx.get('zhen'))!==owner)throw new BackupError('BACKUP_SOURCE_CHANGED');
      const local=this.localSkillSources,github=this.githubSkillSources,market=this.skillMarket,feed=this.skillFeed;
      if(!local||!github||!market||!feed)throw new BackupError('BACKUP_HOST_SERVICES_UNAVAILABLE');
      return hostSkillInventorySource(this.ctx,{local,github,market,feed},policy());
    };
    return prepareSkillInventoryBackup(restored?await prepareRestoredSkillBackupSource(this.ctx,dirname(this.zhenHome),source,options):source,options);
  }
  private hasRestoredSkillProjects():boolean{return this.restoredSkills!==null||this.restoredSkillProjects!==null||readRestoredSkillProjects(dirname(this.zhenHome))!==null;}
  async* skillBackupRecords(policy:()=>HostSkillBackupPolicy,options:BackupOptions={}):AsyncGenerator<BackupRecord>{
    const lease=await this.skillBackupLease(policy,options);try{yield*lease.records();}finally{lease.close();}
  }
  /** Public logical service reads only; never initialize missing services. */
  sessionBackupLease(options:BackupOptions={}):Promise<SessionBackupLease>{
    const original=(value:unknown)=>value&&(value as {[symbols.original]?:object})[symbols.original]||value,owner=original(this);
    return prepareSessionBackup(()=>{
      if(original(this.ctx.get('zhen'))!==owner)throw new BackupError('BACKUP_SOURCE_CHANGED');
      const deps=sessionLogExportDeps(this.ctx);
      if(!deps.sessionPersistence||!deps.sessionQuery||!deps.attachments)throw new BackupError('BACKUP_HOST_SERVICES_UNAVAILABLE');
      return{sessionPersistence:deps.sessionPersistence,sessionQuery:deps.sessionQuery,attachments:deps.attachments,sessions:deps.sessions};
    },options);
  }
  /** Observe the complete existing public domain, not its filtered UI list.
   * Closing this lease only removes our listener; it never closes that domain. */
  async workspaceBackupLease(options:BackupOptions={}):Promise<WorkspaceBackupLease>{
    const original=(value:unknown)=>value&&(value as {[symbols.original]?:object})[symbols.original]||value,owner=original(this);let revision=0,detached=false;
    const detach=this.ctx.on('domain/changed',change=>{if(change.domain===workspaceDomainSpec.name)revision++;}),stop=()=>{if(!detached){detached=true;detach();}};
    try{
      const lease=await prepareWorkspaceBackup(()=>{
        if(original(this.ctx.get('zhen'))!==owner)throw new BackupError('BACKUP_SOURCE_CHANGED');
        const facility=this.ctx.get('storageDomain');
        return{facility:original(facility) as object|undefined,domain:facility?.get(workspaceDomainSpec.name),revision};
      },options);
      return{...lease,close(){try{lease.close();}finally{stop();}}};
    }catch(error){stop();throw error;}
  }
  /** Host-only fixed own path, with a read-only cold source when RAG is lazy. */
  ragBackupLease(policy:()=>RagBackupPolicy,options:BackupOptions={}):Promise<RagBackupLease>{
    const cold=!this.knowledgeStore&&existsSync(this.knowledgeFile)?readonlyKnowledgeSource(this.knowledgeFile):null;
    return prepareRagBackup(()=>{const present=existsSync(this.knowledgeFile);if(!this.knowledgeStore&&present&&!cold)throw new BackupError('BACKUP_SOURCE_CHANGED');return {store:this.knowledgeStore??(present?cold:null),rag:this.rag,policy:policy()};},options);
  }
  /** Host-only package lease. Uses the existing public resolver; protects the
   * pinned application home even if ambient DSH_HOME changes after startup. */
  packageBackupLease(policy:()=>HostPackageBackupPolicy,options:BackupOptions={}):Promise<PackageBackupLease>{
    return preparePackageBackup(()=>{const selected=policy();return hostPackageBackupSource(this.ctx,{...selected,protectedContainers:[...selected.protectedContainers,dirname(dirname(this.knowledgeFile))]});},options);
  }
  /** Host-only own-state lease; never initialize lazy stores or read credentials. */
  ownedStateBackupLease(policy:()=>OwnedStateBackupPolicy,options:BackupOptions={}):Promise<OwnedStateBackupLease>{
    const original=(value:unknown)=>value&&(value as {[symbols.original]?:object})[symbols.original]||value,owner=original(this);
    return prepareOwnedStateBackup(()=>{if(original(this.ctx.get('zhen'))!==owner)throw new BackupError('BACKUP_SOURCE_CHANGED');const selected=policy(),activeFiles={checks:this.gatewayChecks?.backupSourceIdentity(),tasks:this.mediaTasks?.backupSourceIdentity(),media:this.mediaExports?.backupSourceIdentity()};return{...selected,root:this.zhenHome,owner:owner as object,activeFiles,forbiddenTrees:[...selected.forbiddenTrees,dirname(this.zhenHome),this.agentsHome]};},options);
  }
  @Remote
  marketFeedSnapshot(): import('./market-schema.ts').SkillFeedSnapshot { return this.managedSkillOperation(()=>this.feed().snapshot()); }
  @Remote
  async marketFeedCheck(): Promise<import('./market-schema.ts').SkillFeedSnapshot> { return this.managedSkillAsyncWrite(()=>this.feed().check()); }
  @Remote
  marketFeedAutomatic(enabled: boolean): void { this.managedSkillWrite(()=>this.feed().setAutomatic(enabled)); }
  @Remote
  marketAutoPolicy(): SkillAutoPolicy { return this.managedSkillOperation(()=>this.market().autoPolicy()); }
  @Remote
  marketAutoUpdates(enabled: boolean): void { this.managedSkillWrite(()=>this.feed().setAutoUpdates(enabled)); }
  @Remote
  marketPauseAuto(id: string, paused: boolean): void { this.managedSkillWrite(()=>this.feed().pauseAutoUpdate(id, paused)); }
  private updates(): UpdateMonitor {
    const baseline = { ...JSON.parse(readFileSync(new URL('../catalog/runtime.json', import.meta.url), 'utf8')), zhen: ownBundleVersion() } as UpdateBaseline;
    return this.updateMonitor ??= new UpdateMonitor(join(this.zhenHome,'updates.json'), baseline, fetch, this.githubAccess());
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
  private async directoryOperation<T>(work:()=>Promise<T>|T):Promise<T>{try{return await work();}catch(error){const known=error instanceof DirectoryChoiceError;throw new RemoteError('zhen/refused',known?error.message:'目录选择未完成，原路径保留。',{reason:known?'DIRECTORY_'+error.code:'DIRECTORY_UNAVAILABLE'});}}
  @Remote
  directoryPickerInfo():Promise<DirectoryChoiceInfo>{return this.directoryOperation(()=>this.directoryChoices.info());}
  @Remote
  directoryPickerNative(request:DirectoryChoiceRequest):Promise<DirectoryChoiceResult>{return this.directoryOperation(()=>this.directoryChoices.pick(request));}
  @Remote
  directoryPickerBrowse(request:DirectoryChoiceBrowseRequest):Promise<DirectoryChoiceBrowseResult>{return this.directoryOperation(()=>this.directoryChoices.browse(request));}
  @Remote
  directoryPickerCancel(request:DirectoryChoiceRequest):Promise<void>{return this.directoryOperation(()=>this.directoryChoices.cancel(request));}
  private canvasConfig(): CanvasConfig | undefined {
    const file = join(this.zhenHome,'canvas.json');
    if (!existsSync(file)) return undefined;
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || !('root' in value) || typeof value.root !== 'string' || !('digest' in value) || typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest) || !('instance' in value) || typeof value.instance !== 'string') return undefined;
    return { root: value.root, digest: value.digest, instance: value.instance };
  }
  private saveCanvasConfig(config?: CanvasConfig): void {
    const file = join(this.zhenHome,'canvas.json');
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
  private pairings(): CanvasPairing { return this.canvasPairing ??= new CanvasPairing(join(this.zhenHome,'canvas-pairing.json'), () => this.canvasConfig()); }
  private async pairingOperation(work: () => Promise<CanvasPairingView>): Promise<CanvasPairingView> {
    try { return await work(); }
    catch (error) { const safe = safeCanvasError(error); throw new RemoteError('zhen/refused', safe.message, { reason: safe.code }); }
  }
  @Remote
  canvasPairingSnapshot(): Promise<CanvasPairingView> { return this.pairingOperation(() => this.pairings().snapshot()); }
  /** One explicit owner action discovers the desktop, checks it and requests complete creation access. */
  @Remote
  canvasQuickConnect(): Promise<CanvasPairingView> {
    if (this.canvasQuickConnecting) return this.canvasQuickConnecting;
    const task = (async () => {
      try {
        const previous = this.canvasConfig(), found = await this.canvasSetupDiscover();
        const afterDiscovery = this.canvasConfig();
        if (previous?.root !== afterDiscovery?.root || previous?.digest !== afterDiscovery?.digest || previous?.instance !== afterDiscovery?.instance) throw new CanvasError('CANVAS_CONFIG_CHANGED', '连接已变化，请重新点击连接画布。');
        const running = found.candidates.filter(item => item.source === 'running-desktop');
        const selected = running.find(item => item.root === previous?.root && item.digest === previous.digest) ?? (running.length === 1 ? running[0] : undefined);
        if (!selected && running.length > 1) throw new CanvasError('CANVAS_DESKTOP_AMBIGUOUS', '检测到多个桌面画布，请在连接页选择这次要使用的一个。');
        if (!selected && !previous) throw new CanvasError('APP_NOT_RUNNING', '请先打开桌面画布，然后点击“连接画布，开始创作”。');
        if (selected) await this.connectCanvas(selected.root, selected.root === previous?.root ? previous.instance : '', selected.digest);
        let target = this.canvasConfig();
        if (!target) throw new CanvasError('CANVAS_NOT_CONFIGURED', '请打开桌面画布后重新连接。');
        const current = () => { const value = this.canvasConfig(); if (!value || value.root !== target!.root || value.digest !== target!.digest || value.instance !== target!.instance) throw new CanvasError('CANVAS_CONFIG_CHANGED', '连接已变化，请重新点击连接画布。'); };
        let check = await this.canvasConnectionCheck(); current();
        // A restarted desktop with one live instance needs no manual instance selection.
        if (check.state === 'choose-instance' && check.instances.length === 1) {
          await this.connectCanvas(target.root, check.instances[0]!.id, target.digest);
          target = this.canvasConfig()!; check = await this.canvasConnectionCheck(); current();
        }
        if (check.state !== 'ready') throw new CanvasError(check.code, check.state === 'choose-instance' ? '有多个画布窗口，请选择这次使用的画布。' : check.state === 'not-running' ? '请先打开桌面画布，然后重新点击连接。' : '暂时无法连接这份画布。请通过画布自身更新或修复连接工具后，再点击连接；详情在高级设置中。');
        const existing = await this.pairings().snapshot(); current();
        const complete = ['canvas:read','run:read','asset:read','asset:transfer','browser:handoff','canvas:write','run:execute'];
        if (existing.state === 'paired' && complete.every(scope => existing.scopes.includes(scope as CanvasPairingView['scopes'][number]))) return existing;
        return await this.pairings().begin(true, true, true, true, target);
      } catch (error) {
        if (error instanceof RemoteError) throw error;
        const safe = safeCanvasError(error); throw new RemoteError('zhen/refused', safe.message, { reason: safe.code });
      }
    })();
    this.canvasQuickConnecting = task;
    const settled = () => { if (this.canvasQuickConnecting === task) this.canvasQuickConnecting = undefined; };
    void task.then(settled, settled); return task;
  }
  @Remote
  canvasPairingBegin(handoff = false, writable = false, runnable = false, assetTransfer = false): Promise<CanvasPairingView> { return this.pairingOperation(() => this.pairings().begin(handoff, writable, runnable, assetTransfer)); }
  @Remote
  canvasPairingComplete(): Promise<CanvasPairingView> { return this.pairingOperation(() => this.pairings().complete()); }
  private workflows(): CanvasWorkflow { return this.canvasWorkflow ??= new CanvasWorkflow(join(this.zhenHome,'canvas-workflow.json'), () => this.canvasConfig()); }
  private async workflowOperation<T>(run: () => T | Promise<T>): Promise<T> {
    try { return await run(); } catch (error) { const safe = safeCanvasError(error); throw new RemoteError('zhen/refused', safe.message, { reason: safe.code }); }
  }
  @Remote
  canvasWorkflowSnapshot(): Promise<CanvasWorkflowView | null> { return this.workflowOperation(() => this.workflows().snapshot()); }
  @Remote
  canvasWorkspaces(): Promise<CanvasWorkspaces> { return this.workflowOperation(() => this.workflows().workspaces()); }
  @Remote
  canvasActiveTargets():Promise<CanvasActiveTargets>{return this.workflowOperation(()=>this.workflows().activeTargets());}
  @Remote
  canvasTargetWorkspaces():Promise<CanvasWorkspaces>{return this.workflowOperation(()=>this.workflows().workspaces(true));}
  @Remote
  canvasTargetActive():Promise<CanvasActiveTargets>{return this.workflowOperation(()=>this.workflows().activeTargets(true));}
  @Remote
  canvasWorkflowModels(input:CanvasModelsQuery):Promise<CanvasModels>{return this.workflowOperation(()=>this.workflows().models(input));}
  @Remote
  canvasTargetModels(input: CanvasModelsQuery,expectedConnection:string):Promise<CanvasModels>{return this.workflowOperation(()=>this.workflows().models(input,expectedConnection));}
  @Remote
  canvasWorkflowAssets(input:CanvasAssetsQuery):Promise<CanvasAssets>{return this.workflowOperation(()=>this.workflows().assets(input));}
  @Remote
  canvasTargetAssets(input: CanvasAssetsQuery,expectedConnection:string):Promise<CanvasAssets>{return this.workflowOperation(()=>this.workflows().assets(input,expectedConnection));}
  @Remote
  canvasWorkflowPreview(input: CanvasWorkflowInput): Promise<CanvasWorkflowView> { return this.workflowOperation(() => this.workflows().preview(input)); }
  @Remote
  canvasTargetWorkflowPreview(input: CanvasWorkflowInput,expectedConnection:string): Promise<CanvasWorkflowView> { return this.workflowOperation(() => this.workflows().preview(input,expectedConnection)); }
  @Remote
  canvasWorkflowApprove(id: string, confirmation: boolean): Promise<CanvasWorkflowView> { return this.workflowOperation(() => this.workflows().approve(id, confirmation)); }
  @Remote
  canvasWorkflowComplete(id: string): Promise<CanvasWorkflowView> { return this.workflowOperation(() => this.workflows().complete(id)); }
  private runs(): CanvasRuns { return this.canvasRuns ??= new CanvasRuns(join(this.zhenHome,'canvas-run.json'), () => this.canvasConfig()); }
  @Remote
  canvasRunSnapshot(): Promise<CanvasRunView | null> { return this.workflowOperation(() => this.runs().snapshot()); }
  @Remote
  canvasRunNodes(projectId: string, canvasId: string, offset = 0): Promise<CanvasRunNodes> { return this.workflowOperation(() => this.runs().nodes(projectId, canvasId, offset).then(({connectionId:_,...data})=>data)); }
  @Remote
  canvasTargetRunNodes(projectId: string, canvasId: string, offset = 0,expectedConnection:string): Promise<CanvasRunNodes> { return this.workflowOperation(() => this.runs().nodes(projectId, canvasId, offset,expectedConnection)); }
  @Remote
  canvasRunQuote(selection: CanvasRunSelection): Promise<CanvasRunView> { return this.workflowOperation(() => this.runs().quote(selection)); }
  @Remote
  canvasTargetRunQuote(selection: CanvasRunSelection,expectedConnection:string): Promise<CanvasRunView> { return this.workflowOperation(() => this.runs().quote(selection,expectedConnection)); }
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
  canvasTargetTasksList(scope: CanvasTaskScope,expectedConnection:string): Promise<CanvasTaskList> { return this.workflowOperation(() => this.nativeTasks().list(scope,expectedConnection)); }
  @Remote
  canvasTaskDetail(reference: CanvasTaskReference): Promise<CanvasTaskDetail> { return this.workflowOperation(() => this.nativeTasks().detail(reference)); }
  @Remote
  canvasTargetTaskDetail(reference: CanvasTaskReference,expectedConnection:string): Promise<CanvasTaskDetail> { return this.workflowOperation(() => this.nativeTasks().detail(reference,expectedConnection)); }
  private transfers(): CanvasTransfer { return this.canvasTransfer ??= new CanvasTransfer(join(this.zhenHome,'canvas-transfer.json'), () => this.canvasConfig(), id => this.media().receipt(id)); }
  @Remote
  canvasTransferSnapshot(): Promise<CanvasTransferView | null> { return this.workflowOperation(() => this.transfers().snapshot()); }
  @Remote
  canvasTransferPreview(input: CanvasTransferInput): Promise<CanvasTransferView> { return this.workflowOperation(() => this.transfers().preview(input)); }
  @Remote
  canvasTargetTransferPreview(input: CanvasTransferInput,expectedConnection:string): Promise<CanvasTransferView> { return this.workflowOperation(() => this.transfers().preview(input,expectedConnection)); }
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
    if (!config) return { configured: false, root: '', digest: '', connected: false, code: 'NOT_CONFIGURED', message: '请打开桌面画布，在“创作空间 → 画布连接”点击“连接画布，开始创作”。', compat: null };
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

  private managedSkillError(error:unknown):RemoteError<'zhen/refused'>|undefined{
    if(!(error instanceof BackupError))return;
    const messages={
      BACKUP_MANAGED_RUNTIME_PAUSED:'恢复的技能管理尚未启用或已暂停。请在“恢复后的技能管理”核对并启用后，再继续操作。',
      BACKUP_MANAGED_RUNTIME_CHANGED:'恢复的技能来源或当前配置已变化。请在“恢复后的技能管理”点击“检查管理状态”，重新核对后再操作。',
    };
    if(Object.hasOwn(messages,error.code))return new RemoteError('zhen/refused',messages[error.code as keyof typeof messages],{reason:error.code});
  }
  private managedSkillOperation<T>(work:()=>T):T{try{return work();}catch(error){throw this.managedSkillError(error)??error;}}
  private managedSkillWritable():void{if(!this.restoredSkills)return;const role=this.ensureManagedRole();if(!role?.granted)throw new BackupError('BACKUP_MANAGED_RUNTIME_PAUSED');this.restoredManagedRuntime.policy(role).assertWritable();}
  private managedSkillWrite<T>(work:()=>T):T{return this.managedSkillOperation(()=>{this.managedSkillWritable();return work();});}
  private async managedSkillAsyncWrite<T>(work:()=>T|Promise<T>):Promise<T>{try{this.managedSkillWritable();return await work();}catch(error){throw this.managedSkillError(error)??error;}}
  private localSkills(): LocalSkills {const role=this.ensureManagedRole();return this.localSkillSources ??= role?new LocalSkills(join(role.root,'l.json'),1000,{runtime:this.restoredManagedRuntime.policy(role)}):new LocalSkills(join(this.zhenHome,'local-skills.json'),1000,{reviewOnly:!!this.restoredSkills}); }
  private githubSkills(): GithubSkills {const role=this.ensureManagedRole();return this.githubSkillSources ??= role?new GithubSkills(join(role.root,'g'),fetch,{runtime:this.restoredManagedRuntime.policy(role)}):new GithubSkills(join(this.zhenHome,'github-skills'),fetch,{reviewOnly:!!this.restoredSkills}); }
  private async githubOperation<T>(work: () => T | Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) { throw this.managedSkillError(error)??new RemoteError('zhen/refused', error instanceof GithubSkillError ? error.message : 'GitHub 操作暂不可用或已取消，请检查仓库是否公开及请求是否限频。', { reason: 'GITHUB_SKILL_REFUSED' }); }
  }
  @Remote
  async githubSkillList(): Promise<GithubSkillSourceView[]> { return this.githubOperation(() => this.githubSkills().list()); }
  @Remote
  async githubSkillDownload(spec: GithubSkillSpec): Promise<GithubSkillPreview> { return this.githubOperation(() => {this.managedSkillWritable();return this.githubSkills().download(spec, this.mcpOperations.signal);}); }
  @Remote
  async githubSkillInspect(id: string, digest: string): Promise<GithubSkillPreview> { return this.githubOperation(() => this.githubSkills().inspect(id, digest)); }
  @Remote
  async githubSkillHistory(id: string): Promise<GithubSkillSummary[]> { return this.githubOperation(() => this.githubSkills().history(id)); }
  @Remote
  async githubSkillFile(id: string, digest: string, location: 'package' | 'origin', path: string): Promise<GithubSkillFilePreview> { return this.githubOperation(() => this.githubSkills().file(id, digest, location, path)); }
  @Remote
  async githubSkillApprove(id: string, digest: string, confirmation: string): Promise<void> { return this.githubOperation(() => {this.managedSkillWritable();return this.githubSkills().approve(id, digest, confirmation);}); }
  @Remote
  async githubSkillCheck(id: string): Promise<void> { return this.githubOperation(() => {this.managedSkillWritable();return this.githubSkills().check(id, this.mcpOperations.signal);}); }
  @Remote
  async githubSkillAutomatic(id: string, enabled: boolean): Promise<void> { return this.githubOperation(() => {this.managedSkillWritable();return this.githubSkills().automatic(id, enabled);}); }
  @Remote
  async githubSkillDisable(id: string): Promise<void> { return this.githubOperation(() => {this.managedSkillWritable();return this.githubSkills().disable(id);}); }
  @Remote
  async githubSkillForget(id: string): Promise<void> { return this.githubOperation(() => {this.managedSkillWritable();return this.githubSkills().forget(id);}); }
  @Remote
  async githubSkillCancelPending(id: string): Promise<void> { return this.githubOperation(() => {this.managedSkillWritable();return this.githubSkills().cancelPending(id);}); }
  @Remote
  async githubSkillDelete(id: string, digest: string): Promise<void> { return this.githubOperation(() => {this.managedSkillWritable();return this.githubSkills().deleteRelease(id, digest);}); }
  @Remote
  githubSkillCancelDownload(): void { this.githubSkills().cancelDownload(); }
  @Remote
  async localSkillList(): Promise<LocalSkillView[]> {
    try { return await this.localSkills().list(); }
    catch (error) { throw this.managedSkillError(error)??new RemoteError('zhen/refused', '无法读取本地技能目录，请检查配置或重新连接。', { reason: 'LOCAL_SKILL_UNAVAILABLE' }); }
  }
  @Remote
  async localSkillPreview(folder: string, mode: LocalSkillMode): Promise<LocalSkillDraft> {
    try { return await this.localSkills().preview(folder, mode); }
    catch (error) { throw this.managedSkillError(error)??new RemoteError('zhen/refused', '无法扫描技能目录。请使用绝对路径、UTF-8 SKILL.md 和有效的名称/描述；目录可能过大或发生变化。', { reason: 'LOCAL_SKILL_SCAN' }); }
  }
  @Remote
  async localSkillBody(folder: string, directory: string, digest: string): Promise<LocalSkillBody> {
    try { return await this.localSkills().body(folder, directory, digest); }
    catch (error) { throw this.managedSkillError(error)??new RemoteError('zhen/refused', '技能正文不可读取或已变化，请重新扫描。', { reason: 'LOCAL_SKILL_CHANGED' }); }
  }
  @Remote
  async localSkillConnect(folder: string, mode: LocalSkillMode, digest: string, confirmation: string): Promise<void> {
    try { this.managedSkillWritable();await this.localSkills().connect(folder, mode, digest, confirmation); }
    catch (error) { throw this.managedSkillError(error)??new RemoteError('zhen/refused', '目录尚未确认、清单已变化或没有有效技能，请重新扫描并确认。', { reason: 'LOCAL_SKILL_REFUSED' }); }
  }
  @Remote
  localSkillDisable(id: string): void { this.managedSkillWrite(()=>this.localSkills().disable(id)); }
  @Remote
  localSkillDisconnect(id: string): void { this.managedSkillWrite(()=>this.localSkills().disconnect(id)); }

  /** Read the verified bundled catalog and locally selected versions. */
  @Remote
  marketList(): MarketItem[] { return this.managedSkillOperation(()=>{const market=this.market();if(this.managedRole)this.feed().snapshot();return market.list();}); }
  /** Read exactly the selected instruction digest before installation. */
  @Remote
  marketPreview(id: string, digest: string, version = ''): SkillPackage { return this.managedSkillOperation(()=>this.market().preview(id, digest, version)); }
  /** Install a new skill or stage a reviewed version for the next Host restart. */
  @Remote
  marketSelect(id: string, digest: string, version = ''): void { this.managedSkillWrite(()=>this.market().select(id, digest, version)); }
  /** Immediately stop new loads and cancel pending changes without deleting user work. */
  @Remote
  marketDisable(id: string): void { this.managedSkillWrite(()=>this.market().disable(id)); }
  @Remote
  marketCancelPending(id: string): void { this.managedSkillWrite(()=>this.market().cancelPending(id)); }
  @Remote
  marketVersions(id: string): SkillPackage[] { return this.managedSkillOperation(()=>this.market().versions(id)); }
  /** Save an independent local instruction version, never overwrite the source. */
  @Remote
  marketFork(id: string, digest: string, body: string, version = ''): string { return this.managedSkillWrite(()=>this.market().fork(id, digest, body, version)); }

  /** List collections in the explicitly selected local project space. */
  @Remote
  ragBackendStatus():RagBackendStatus{return this.rag.snapshot();}
  @Remote
  ragBackendConfigure(selected:string,enabled:boolean,expectedRevision:string):RagBackendStatus{
    try{return this.rag.configure(selected,enabled,expectedRevision);}catch(error){const proposed=error&&typeof error==='object'&&'code'in error?String(error.code):'';const code=Object.hasOwn(ragBackendMessages,proposed)?proposed as keyof typeof ragBackendMessages:'RAG_CONFIGURATION_INVALID';throw new RemoteError('zhen/refused',ragBackendMessages[code],{reason:code});}
  }
  @Remote
  knowledgeSpaces(after: string): KnowledgeSpacePage { return this.knowledge().spaces(after); }
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
    return { version: ownBundleVersion(), provider: 'seedance', model: 'deepseek/deepseek-v4.1-flash',
      credentialConfigured: info.configured, credentialWritable: info.writable, credentialSource: credentialSource(info.configured, info.source), gatewayVerified: false };
  }

  private checks(): GatewayChecks {
    return this.gatewayChecks ??= new GatewayChecks(join(this.zhenHome,'gateway-checks.sqlite'), async signal => {
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

  private tasks(): GatewayTasks { return this.mediaTasks ??= new GatewayTasks(join(this.zhenHome,'gateway-tasks.sqlite'), async () => (await this.ctx.credentials.resolve(seedanceCredential))?.value); }
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

  private media(): GatewayMedia { return this.mediaExports ??= new GatewayMedia(join(this.zhenHome,'media-exports'), id => this.tasks().mediaSources(id), id => this.tasks().list().some(item => item.id === id && item.status === 'succeeded')); }
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
