import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { DefaultArtInfo, DefaultArtChunkRequest, DefaultArtChunk } from './default-art-schema.ts';
import type { Wallet } from './gateway.ts';
import { ZhenRag } from './rag-service.ts';
import type { RagBackendStatus } from './rag-backend-schema.ts';
export { ZhenRag } from './rag-service.ts';
export type { RagSearchProvider, RagProviderScope, RagContext } from './rag-service.ts';
export type { RagBackendStatus } from './rag-backend-schema.ts';
import type { KnowledgeCollection, KnowledgeHit, KnowledgeSource, ImportResult } from './knowledge.ts';
import type { KnowledgeImportReport } from './knowledge-import-schema.ts';
import type { GithubAccessInfo } from './github-access-schema.ts';
import type { MarketItem, SkillPackage, SkillAutoPolicy } from './market-schema.ts';
import type { CanvasConnection } from './canvas.ts';
import type { CanvasConnectionCheck, CanvasSetupDiscovery } from './canvas-setup-schema.ts';
import type { CanvasDiscovery } from './canvas-discovery-schema.ts';
import type { CanvasTransferInput, CanvasTransferView } from './canvas-transfer-schema.ts';
import type { CanvasTaskScope, CanvasTaskReference, CanvasTaskList, CanvasTaskDetail } from './canvas-task-schema.ts';
import type { CanvasRunSelection, CanvasRunView, CanvasRunNodes } from './canvas-run-schema.ts';
import type { CanvasCandidateView } from './canvas-inbox-schema.ts';
import type { CanvasWorkflowInput, CanvasWorkflowView, CanvasWorkspaces, CanvasModels, CanvasModelsQuery } from './canvas-workflow-schema.ts';
import type { CanvasAssets, CanvasAssetsQuery } from './canvas-reference-schema.ts';
import type { CanvasPairingView } from './canvas-pairing-schema.ts';
import type { CanvasToolCatalog } from './canvas-contract.ts';
import type { UpdateReport } from './update-schema.ts';
import type { KnowledgeBinding } from './knowledge.ts';
import type { McpMarketView } from './mcp-market-schema.ts';
import type { CapabilityCatalog, CapabilityCheck } from './capability-schema.ts';
import type { GatewayCheckPreview, GatewayCheckReceipt } from './gateway-check-schema.ts';
import type { LocalSkillDraft, LocalSkillView, LocalSkillBody, LocalSkillMode } from './local-skills-schema.ts';
import type { GithubSkillSpec, GithubSkillSourceView, GithubSkillSummary, GithubSkillPreview, GithubSkillFilePreview } from './github-skills-schema.ts';
import type { GatewayTaskSpec, GatewayTaskRecord } from './gateway-task-schema.ts';
import type { GatewayMediaTicket, GatewayMediaReceipt } from './gateway-media-schema.ts';
export type { Wallet } from './gateway.ts';
export type { MarketItem, SkillPackage, SkillFeedSnapshot, SkillAutoPolicy } from './market-schema.ts';
export type { CanvasConnection } from './canvas.ts';
export type { CanvasConnectionCheck, CanvasSetupDiscovery } from './canvas-setup-schema.ts';
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
export type { KnowledgeImportReport, KnowledgeImportIssue } from './knowledge-import-schema.ts';
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
    interface Context {
        zhen: ZhenService;
        zhenRag: ZhenRag;
    }
}
/** Creator workspace Host operations, guarded by DSH's authenticated Remote access. */
export default class ZhenService extends TypertRemoteService {
    static inject: string[];
    private knowledgeStore?;
    private readonly rag;
    private skillMarket?;
    private skillFeed?;
    private githubReader?;
    private mountCanvas?;
    private updateMonitor?;
    private mcpMarket?;
    private mcpRuntime?;
    private readonly mcpOperations;
    private capabilityCatalog?;
    private capabilityMonitor?;
    private gatewayChecks?;
    private seedanceGeneration;
    private walletClosed;
    private readonly walletReads;
    private localSkillSources?;
    private githubSkillSources?;
    private mediaTasks?;
    private mediaExports?;
    private canvasPairing?;
    private canvasWorkflow?;
    private canvasRuns?;
    private canvasTasks?;
    private canvasTransfer?;
    private readonly artDefaults;
    private readonly canvasInbox;
    private readonly canvasCaptures;
    private readonly canvasAdoptions;
    constructor(ctx: Context);
    private knowledge;
    private capabilities;
    private capabilityUpdates;
    gatewayCatalog(): CapabilityCatalog;
    gatewayCatalogCheckSnapshot(): CapabilityCheck;
    gatewayCatalogCheck(): Promise<CapabilityCheck>;
    gatewayCatalogAutomatic(enabled: boolean): void;
    private mcps;
    mcpSnapshot(): McpMarketView;
    mcpCheck(): Promise<McpMarketView>;
    mcpAutomatic(enabled: boolean): void;
    mcpInstall(id: string, version: string, integrity: string): Promise<void>;
    mcpSelect(id: string, version: string, workspace: string): Promise<void>;
    mcpDisable(id: string): Promise<void>;
    mcpForget(id: string): Promise<void>;
    mcpRestart(id: string): Promise<void>;
    mcpRepair(id: string, version: string): Promise<void>;
    mcpRestoreArchive(archiveId: string): Promise<void>;
    knowledgeBinding(project: string): KnowledgeBinding | null;
    bindKnowledge(project: string, directory: string): Promise<KnowledgeBinding | null>;
    setKnowledgeAgentAccess(project: string, collectionId: string, enabled: boolean): void;
    private market;
    private feed;
    marketFeedSnapshot(): import('./market-schema.ts').SkillFeedSnapshot;
    marketFeedCheck(): Promise<import('./market-schema.ts').SkillFeedSnapshot>;
    marketFeedAutomatic(enabled: boolean): void;
    marketAutoPolicy(): SkillAutoPolicy;
    marketAutoUpdates(enabled: boolean): void;
    marketPauseAuto(id: string, paused: boolean): void;
    private updates;
    private githubAccess;
    githubAccessInfo(): Promise<GithubAccessInfo>;
    githubSaveCredential(value: string): Promise<void>;
    githubRemoveCredential(): Promise<void>;
    updatesSnapshot(): UpdateReport;
    updatesCheck(): Promise<UpdateReport>;
    updatesAutomatic(enabled: boolean): void;
    private canvasConfig;
    private saveCanvasConfig;
    canvasDiscover(): CanvasDiscovery;
    canvasSetupDiscover(): Promise<CanvasSetupDiscovery>;
    canvasConnectionCheck(): Promise<CanvasConnectionCheck>;
    private pairings;
    private pairingOperation;
    canvasPairingSnapshot(): Promise<CanvasPairingView>;
    canvasPairingBegin(handoff?: boolean, writable?: boolean, runnable?: boolean, assetTransfer?: boolean): Promise<CanvasPairingView>;
    canvasPairingComplete(): Promise<CanvasPairingView>;
    private workflows;
    private workflowOperation;
    canvasWorkflowSnapshot(): Promise<CanvasWorkflowView | null>;
    canvasWorkspaces(): Promise<CanvasWorkspaces>;
    canvasWorkflowModels(input: CanvasModelsQuery): Promise<CanvasModels>;
    canvasWorkflowAssets(input: CanvasAssetsQuery): Promise<CanvasAssets>;
    canvasWorkflowPreview(input: CanvasWorkflowInput): Promise<CanvasWorkflowView>;
    canvasWorkflowApprove(id: string, confirmation: boolean): Promise<CanvasWorkflowView>;
    canvasWorkflowComplete(id: string): Promise<CanvasWorkflowView>;
    private runs;
    canvasRunSnapshot(): Promise<CanvasRunView | null>;
    canvasRunNodes(projectId: string, canvasId: string, offset?: number): Promise<CanvasRunNodes>;
    canvasRunQuote(selection: CanvasRunSelection): Promise<CanvasRunView>;
    canvasRunApprove(quoteId: string, confirmed: boolean, unknownPriceAccepted: boolean): Promise<CanvasRunView>;
    canvasRunSubmit(quoteId: string): Promise<CanvasRunView>;
    canvasRunRefresh(quoteId: string): Promise<CanvasRunView>;
    private nativeTasks;
    canvasTasksList(scope: CanvasTaskScope): Promise<CanvasTaskList>;
    canvasTaskDetail(reference: CanvasTaskReference): Promise<CanvasTaskDetail>;
    private transfers;
    canvasTransferSnapshot(): Promise<CanvasTransferView | null>;
    canvasTransferPreview(input: CanvasTransferInput): Promise<CanvasTransferView>;
    canvasTransferApprove(id: string, confirmed: boolean): Promise<CanvasTransferView>;
    canvasTransferComplete(id: string): Promise<CanvasTransferView>;
    canvasTransferPlacement(id: string): Promise<CanvasTransferView>;
    canvasTransferRefresh(id: string): Promise<CanvasTransferView>;
    defaultArtInfo(): DefaultArtInfo;
    defaultArtChunk(request: DefaultArtChunkRequest): DefaultArtChunk;
    canvasCandidates(): CanvasCandidateView[];
    canvasCandidateRemove(id: string): void;
    canvasCandidateAdopt(id: string): Promise<CanvasWorkflowView>;
    canvasStatus(): Promise<CanvasConnection>;
    canvasTools(): Promise<CanvasToolCatalog | null>;
    /** Select an installed CLI after reviewing its local code access. No pairing is created. */
    connectCanvas(root: string, instance: string, expectedDigest?: string): Promise<CanvasConnection>;
    disconnectCanvas(): Promise<void>;
    private localSkills;
    private githubSkills;
    private githubOperation;
    githubSkillList(): Promise<GithubSkillSourceView[]>;
    githubSkillDownload(spec: GithubSkillSpec): Promise<GithubSkillPreview>;
    githubSkillInspect(id: string, digest: string): Promise<GithubSkillPreview>;
    githubSkillHistory(id: string): Promise<GithubSkillSummary[]>;
    githubSkillFile(id: string, digest: string, location: 'package' | 'origin', path: string): Promise<GithubSkillFilePreview>;
    githubSkillApprove(id: string, digest: string, confirmation: string): Promise<void>;
    githubSkillCheck(id: string): Promise<void>;
    githubSkillAutomatic(id: string, enabled: boolean): Promise<void>;
    githubSkillDisable(id: string): Promise<void>;
    githubSkillForget(id: string): Promise<void>;
    githubSkillCancelPending(id: string): Promise<void>;
    githubSkillDelete(id: string, digest: string): Promise<void>;
    githubSkillCancelDownload(): void;
    localSkillList(): Promise<LocalSkillView[]>;
    localSkillPreview(folder: string, mode: LocalSkillMode): Promise<LocalSkillDraft>;
    localSkillBody(folder: string, directory: string, digest: string): Promise<LocalSkillBody>;
    localSkillConnect(folder: string, mode: LocalSkillMode, digest: string, confirmation: string): Promise<void>;
    localSkillDisable(id: string): void;
    localSkillDisconnect(id: string): void;
    /** Read the verified bundled catalog and locally selected versions. */
    marketList(): MarketItem[];
    /** Read exactly the selected instruction digest before installation. */
    marketPreview(id: string, digest: string, version?: string): SkillPackage;
    /** Install a new skill or stage a reviewed version for the next Host restart. */
    marketSelect(id: string, digest: string, version?: string): void;
    /** Immediately stop new loads and cancel pending changes without deleting user work. */
    marketDisable(id: string): void;
    marketCancelPending(id: string): void;
    marketVersions(id: string): SkillPackage[];
    /** Save an independent local instruction version, never overwrite the source. */
    marketFork(id: string, digest: string, body: string, version?: string): string;
    /** List collections in the explicitly selected local project space. */
    ragBackendStatus(): RagBackendStatus;
    ragBackendConfigure(selected: string, enabled: boolean, expectedRevision: string): RagBackendStatus;
    knowledgeCollections(project: string): KnowledgeCollection[];
    /** Authorize a local folder as a collection. Does not send contents to a provider. */
    createKnowledge(project: string, name: string, folder: string): Promise<KnowledgeCollection>;
    /** Index only text files inside an authorized collection. */
    indexKnowledge(project: string, collectionId: string): Promise<ImportResult>;
    /** Read bounded local diagnostics for the current collection revision only. */
    knowledgeImportReport(project: string, collectionId: string): KnowledgeImportReport | null;
    /** Search within the selected project's enabled local collections. */
    searchKnowledge(project: string, query: string): KnowledgeHit[];
    /** Change local access and the distinct provider permission; revokes old citations immediately. */
    setKnowledgeAccess(project: string, collectionId: string, enabled: boolean, cloudProvider: string): void;
    /** Read a selected citation after current project, epoch, and provider checks. */
    knowledgeCitation(project: string, hitId: string, epoch: number, provider: string): KnowledgeHit;
    /** Read indexed source context locally; does not grant cloud or agent permission. */
    knowledgeSource(project: string, hitId: string, epoch: number): KnowledgeSource;
    /** Read configuration presence without returning a credential or probing a paid endpoint. */
    status(): Promise<ZhenStatus>;
    private checks;
    /** Fixed short request preview; no stream dispatch or credential value read. */
    gatewayCheckPreview(): Promise<GatewayCheckPreview>;
    gatewayCheckHistory(): GatewayCheckReceipt[];
    /** One receipt can dispatch at most once, including ambiguous interruptions. */
    gatewayCheckRun(id: string, confirmation: string): Promise<GatewayCheckReceipt>;
    gatewayCheckCancel(id: string): GatewayCheckReceipt;
    /** Save the Seedance credential using the Host credential service. Never return its value. */
    saveCredential(value: string): Promise<void>;
    /** Remove this provider's locally writable credential. */
    removeCredential(): Promise<void>;
    private stopWalletReads;
    private invalidateSeedance;
    private tasks;
    private taskOperation;
    gatewayTaskList(): Promise<GatewayTaskRecord[]>;
    gatewayTaskAdd(spec: GatewayTaskSpec): Promise<GatewayTaskRecord>;
    gatewayTaskRefresh(id: string): Promise<GatewayTaskRecord>;
    gatewayTaskTracking(id: string, enabled: boolean): Promise<GatewayTaskRecord>;
    gatewayTaskRemove(id: string): Promise<void>;
    private media;
    private mediaOperation;
    gatewayMediaPreview(id: string): Promise<GatewayMediaTicket[]>;
    gatewayMediaSave(id: string, folder: string): Promise<GatewayMediaReceipt>;
    gatewayMediaList(): Promise<GatewayMediaReceipt[]>;
    gatewayMediaCancel(id: string): Promise<void>;
    gatewayMediaForget(id: string): Promise<void>;
    /** Read wallet balance on the Host; a successful read does not verify chat access. */
    wallet(): Promise<Wallet>;
}
