import {recoveryPlanSchema} from './recovery-layout-schema.ts';
import {recoveryProjectCursorSchema,recoveryProjectsSchema,projectAwareRestoreSchema} from './recovery-project-schema.ts';
import type {RecoveryProjects,ProjectAwareRestore as BackupRestore} from './recovery-project-schema.ts';
export {recoveryProjectsSchema} from './recovery-project-schema.ts';
export type {RecoveryProjects,RecoveryProjectSelection} from './recovery-project-schema.ts';
export type {ProjectAwareRestore as BackupRestore} from './recovery-project-schema.ts';
import type {RecoveryPlan} from './recovery-layout-schema.ts';
export {recoveryPlanSchema,recoveryLocationLabels,recoveryPlanReasonLabels} from './recovery-layout-schema.ts';
export type {RecoveryPlan} from './recovery-layout-schema.ts';
/** Hand-authored contribution using the published protocol factory; no upstream types are modified. */
import { z } from 'zod';
import {recoveryPreviewSchema,recoveryCatalogSchema} from './recovery-schema.ts';
import type {RecoveryPreview,RecoveryCatalogView} from './recovery-schema.ts';
export {recoveryPreviewSchema,recoveryCatalogSchema,recoveryFactLabels,recoveryWarningLabels} from './recovery-schema.ts';
export type {RecoveryPreview,RecoverySummary,RecoveryCatalogView} from './recovery-schema.ts';
import {backupInfoSchema,backupFilesSchema,backupCreateSchema,backupJobSchema,backupFolderSchema} from './backup-center-schema.ts';
import type {BackupInfo,BackupFiles,BackupCreate,BackupJob} from './backup-center-schema.ts';
export {backupLabels,backupLimitations,backupInfoSchema,backupFilesSchema,backupJobSchema} from './backup-center-schema.ts';
export type {BackupInfo,BackupFiles,BackupCreate,BackupJob,BackupComponent} from './backup-center-schema.ts';
import {directoryChoiceInfoSchema,directoryChoiceRequestSchema,directoryChoiceBrowseRequestSchema,directoryChoiceResultSchema,directoryChoiceBrowseResultSchema} from './directory-choice-schema.ts';
import type {DirectoryChoiceInfo,DirectoryChoiceRequest,DirectoryChoiceBrowseRequest,DirectoryChoiceResult,DirectoryChoiceBrowseResult} from './directory-choice-schema.ts';
export type {DirectoryChoiceInfo,DirectoryChoiceListing} from './directory-choice-schema.ts';
export {directoryChoiceInfoSchema,directoryChoiceResultSchema,directoryChoiceBrowseResultSchema} from './directory-choice-schema.ts';
export {canvasHelpSchema} from './canvas-help-schema.ts';
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info';
import type { RemoteResult, TypertRemoteCodecSpec, TypertRemoteMethodSpec } from '@deepseek-ai/dsh-typert-protocol';
import type { Wallet, ZhenStatus } from './index.ts';
import { credentialSources } from './client/credential-source.ts';
import { githubAccessSchema, githubCredentialValue } from './github-access-schema.ts';
import type { GithubAccessInfo } from './github-access-schema.ts';
import type { KnowledgeCollection, KnowledgeHit, KnowledgeSource, ImportResult } from './knowledge.ts';
import {knowledgeImportReportSchema} from './knowledge-import-schema.ts';
import type {KnowledgeImportReport} from './knowledge-import-schema.ts';
import { ragSourceSchema } from './rag-schema.ts';
import {ragBackendId,ragBackendStatusSchema} from './rag-backend-schema.ts';
import type {RagBackendStatus} from './rag-backend-schema.ts';
export {ragBackendMessages} from './rag-backend-schema.ts';
export { ragPresentationSchema } from './rag-schema.ts';
import { skillId, digestSchema, marketItemSchema, skillPackageSchema, skillFeedSnapshotSchema, skillAutoPolicySchema } from './market-schema.ts';
import type { MarketItem, SkillPackage, SkillFeedSnapshot, SkillAutoPolicy } from './market-schema.ts';
import type { CanvasConnection } from './canvas.ts';
import {canvasActiveTargetsSchema,canvasTargetActiveSchema} from './canvas-active-schema.ts';
import {canvasTargetWorkspacesSchema} from './canvas-workflow-schema.ts';
import type {CanvasActiveTargets} from './canvas-active-schema.ts';
export {ACTIVE_CONTEXT_MAX_AGE_MS,ACTIVE_CONTEXT_FUTURE_SKEW_MS,activeContextFresh} from './canvas-active-schema.ts';
export {canvasEntity,canvasPlanResultSchema} from './canvas-contract.ts';
import { canvasDiscoverySchema } from './canvas-discovery-schema.ts';
import type { CanvasDiscovery } from './canvas-discovery-schema.ts';
import {canvasSetupDiscoverySchema,canvasConnectionCheckSchema} from './canvas-setup-schema.ts';
import type {CanvasSetupDiscovery,CanvasConnectionCheck} from './canvas-setup-schema.ts';
import { canvasPairingSchema } from './canvas-pairing-schema.ts';
import type { CanvasPairingView } from './canvas-pairing-schema.ts';
import { canvasWorkflowInput, canvasWorkflowSchema, canvasWorkspacesSchema, canvasModelsQuery, canvasModelsSchema } from './canvas-workflow-schema.ts';
import type { CanvasWorkflowInput, CanvasWorkflowView, CanvasWorkspaces, CanvasModels, CanvasModelsQuery } from './canvas-workflow-schema.ts';
import {canvasAssetsQuery,canvasAssetsSchema} from './canvas-reference-schema.ts';
import type {CanvasAssets,CanvasAssetsQuery} from './canvas-reference-schema.ts';
import { canvasCandidatesSchema } from './canvas-inbox-schema.ts';
import type { CanvasCandidateView } from './canvas-inbox-schema.ts';
import { canvasRunViewSchema, canvasRunNodesSchema, canvasRunSelection } from './canvas-run-schema.ts';
import type { CanvasRunSelection, CanvasRunView, CanvasRunNodes } from './canvas-run-schema.ts';
import { canvasTaskScope, canvasTaskReference, canvasTaskListSchema, canvasTaskDetailSchema } from './canvas-task-schema.ts';
import type { CanvasTaskScope, CanvasTaskReference, CanvasTaskList, CanvasTaskDetail } from './canvas-task-schema.ts';
import { defaultArtInfoSchema, defaultArtChunkRequest, defaultArtChunkSchema } from './default-art-schema.ts';
import type { DefaultArtInfo, DefaultArtChunkRequest, DefaultArtChunk } from './default-art-schema.ts';
import { canvasTransferInput, canvasTransferViewSchema } from './canvas-transfer-schema.ts';
import type { CanvasTransferInput, CanvasTransferView } from './canvas-transfer-schema.ts';
export { DEFAULT_ART_CHUNK_BYTES, defaultArtInfoSchema, defaultArtChunkSchema } from './default-art-schema.ts';
import { canvasToolCatalogSchema } from './canvas-contract.ts';
import type { CanvasToolCatalog } from './canvas-contract.ts';
import { updateReportSchema } from './update-schema.ts';
import type { UpdateReport } from './update-schema.ts';
import type { KnowledgeBinding } from './knowledge.ts';
import { mcpId, mcpReleaseSchema, mcpMarketViewSchema } from './mcp-market-schema.ts';
import type { McpMarketView } from './mcp-market-schema.ts';
import { capabilityCatalogSchema, capabilityCheckSchema } from './capability-schema.ts';
import type { CapabilityCatalog, CapabilityCheck } from './capability-schema.ts';
import { GATEWAY_CHECK_POLICY, gatewayCheckPreviewSchema, gatewayCheckReceiptSchema } from './gateway-check-schema.ts';
import type { GatewayCheckPreview, GatewayCheckReceipt } from './gateway-check-schema.ts';
export { GATEWAY_CHECK_POLICY } from './gateway-check-schema.ts';
import { LOCAL_SKILL_POLICY, localSkillMode, localSkillDraftSchema, localSkillViewSchema, localSkillBodySchema } from './local-skills-schema.ts';
import type { LocalSkillDraft, LocalSkillView, LocalSkillBody, LocalSkillMode } from './local-skills-schema.ts';
export { LOCAL_SKILL_POLICY } from './local-skills-schema.ts';
import { GITHUB_SKILL_POLICY, githubSkillSpecSchema, githubSkillSourceViewSchema, githubSkillSummarySchema, githubSkillPreviewSchema, githubSkillFilePreviewSchema } from './github-skills-schema.ts';
import type { GithubSkillSpec, GithubSkillSourceView, GithubSkillSummary, GithubSkillPreview, GithubSkillFilePreview } from './github-skills-schema.ts';
export { GITHUB_SKILL_POLICY } from './github-skills-schema.ts';
import { gatewayTaskSpecSchema, gatewayTaskRecordSchema } from './gateway-task-schema.ts';
import type { GatewayTaskSpec, GatewayTaskRecord } from './gateway-task-schema.ts';
import { gatewayMediaTicketSchema, gatewayMediaReceiptSchema } from './gateway-media-schema.ts';
import type { GatewayMediaTicket, GatewayMediaReceipt } from './gateway-media-schema.ts';

export interface ZhenRemote {
  restoredManagedSkillConsent(page:number):Promise<RemoteResult<RestoredManagedSkillView>>;
  restoredManagedSkillConsentChange(request:RestoredManagedSkillRequest):Promise<RemoteResult<RestoredManagedSkillView>>;
  restoredManagedRuntimeStatus(page:number):Promise<RemoteResult<RestoredManagedRuntimeView>>;
  restoredManagedRuntimeChange(request:RestoredManagedRuntimeRequest):Promise<RemoteResult<RestoredManagedRuntimeView>>;
  restoredSkillConsent(page:number):Promise<RemoteResult<RestoredSkillConsentView>>;
  restoredSkillConsentChange(request:RestoredSkillConsentRequest):Promise<RemoteResult<RestoredSkillConsentView>>;
  backupCandidatePlan(id:string):Promise<RemoteResult<RecoveryPlan>>;
  backupCandidateProjects(id:string,cursor:string):Promise<RemoteResult<RecoveryProjects>>;
  backupCandidateList(cursor:string):Promise<RemoteResult<RecoveryCatalogView>>;
  backupCandidateForget(id:string):Promise<RemoteResult<void>>;
  backupCandidateRegister(id:string):Promise<RemoteResult<BackupJob>>;
  backupCandidateSnapshot(id:string):Promise<RemoteResult<RecoveryPreview>>;
  backupCandidateVerify(id:string):Promise<RemoteResult<RecoveryPreview>>;
  backupInfo():Promise<RemoteResult<BackupInfo>>;
  backupFiles(folder:string):Promise<RemoteResult<BackupFiles>>;
  backupCreate(request:BackupCreate):Promise<RemoteResult<BackupJob>>;
  backupRestore(request:BackupRestore):Promise<RemoteResult<BackupJob>>;
  backupStatus(id:string):Promise<RemoteResult<BackupJob>>;
  backupCancel(id:string):Promise<RemoteResult<void>>;
  directoryPickerInfo():Promise<RemoteResult<DirectoryChoiceInfo>>;
  directoryPickerNative(request:DirectoryChoiceRequest):Promise<RemoteResult<DirectoryChoiceResult>>;
  directoryPickerBrowse(request:DirectoryChoiceBrowseRequest):Promise<RemoteResult<DirectoryChoiceBrowseResult>>;
  directoryPickerCancel(request:DirectoryChoiceRequest):Promise<RemoteResult<void>>;
  githubAccessInfo(): Promise<RemoteResult<GithubAccessInfo>>;
  githubSaveCredential(value: string): Promise<RemoteResult<void>>;
  githubRemoveCredential(): Promise<RemoteResult<void>>;
  gatewayMediaPreview(id: string): Promise<RemoteResult<GatewayMediaTicket[]>>;
  gatewayMediaSave(id: string, folder: string): Promise<RemoteResult<GatewayMediaReceipt>>;
  gatewayMediaList(): Promise<RemoteResult<GatewayMediaReceipt[]>>;
  gatewayMediaCancel(id: string): Promise<RemoteResult<void>>;
  gatewayMediaForget(id: string): Promise<RemoteResult<void>>;
  gatewayTaskList(): Promise<RemoteResult<GatewayTaskRecord[]>>;
  gatewayTaskAdd(spec: GatewayTaskSpec): Promise<RemoteResult<GatewayTaskRecord>>;
  gatewayTaskRefresh(id: string): Promise<RemoteResult<GatewayTaskRecord>>;
  gatewayTaskTracking(id: string, enabled: boolean): Promise<RemoteResult<GatewayTaskRecord>>;
  gatewayTaskRemove(id: string): Promise<RemoteResult<void>>;
  githubSkillList(): Promise<RemoteResult<GithubSkillSourceView[]>>;
  githubSkillDownload(spec: GithubSkillSpec): Promise<RemoteResult<GithubSkillPreview>>;
  githubSkillInspect(id: string, digest: string): Promise<RemoteResult<GithubSkillPreview>>;
  githubSkillHistory(id: string): Promise<RemoteResult<GithubSkillSummary[]>>;
  githubSkillFile(id: string, digest: string, location: 'package' | 'origin', path: string): Promise<RemoteResult<GithubSkillFilePreview>>;
  githubSkillApprove(id: string, digest: string, confirmation: string): Promise<RemoteResult<void>>;
  githubSkillCheck(id: string): Promise<RemoteResult<void>>;
  githubSkillAutomatic(id: string, enabled: boolean): Promise<RemoteResult<void>>;
  githubSkillDisable(id: string): Promise<RemoteResult<void>>;
  githubSkillForget(id: string): Promise<RemoteResult<void>>;
  githubSkillCancelPending(id: string): Promise<RemoteResult<void>>;
  githubSkillDelete(id: string, digest: string): Promise<RemoteResult<void>>;
  githubSkillCancelDownload(): Promise<RemoteResult<void>>;
  localSkillList(): Promise<RemoteResult<LocalSkillView[]>>;
  localSkillPreview(folder: string, mode: LocalSkillMode): Promise<RemoteResult<LocalSkillDraft>>;
  localSkillBody(folder: string, directory: string, digest: string): Promise<RemoteResult<LocalSkillBody>>;
  localSkillConnect(folder: string, mode: LocalSkillMode, digest: string, confirmation: string): Promise<RemoteResult<void>>;
  localSkillDisable(id: string): Promise<RemoteResult<void>>;
  localSkillDisconnect(id: string): Promise<RemoteResult<void>>;
  gatewayCheckPreview(): Promise<RemoteResult<GatewayCheckPreview>>;
  gatewayCheckHistory(): Promise<RemoteResult<GatewayCheckReceipt[]>>;
  gatewayCheckRun(id: string, confirmation: string): Promise<RemoteResult<GatewayCheckReceipt>>;
  gatewayCheckCancel(id: string): Promise<RemoteResult<GatewayCheckReceipt>>;
  gatewayCatalog(): Promise<RemoteResult<CapabilityCatalog>>;
  gatewayCatalogCheckSnapshot(): Promise<RemoteResult<CapabilityCheck>>;
  gatewayCatalogCheck(): Promise<RemoteResult<CapabilityCheck>>;
  gatewayCatalogAutomatic(enabled: boolean): Promise<RemoteResult<void>>;
  mcpSnapshot(): Promise<RemoteResult<McpMarketView>>;
  mcpCheck(): Promise<RemoteResult<McpMarketView>>;
  mcpAutomatic(enabled: boolean): Promise<RemoteResult<void>>;
  mcpInstall(id: string, version: string, integrity: string): Promise<RemoteResult<void>>;
  mcpSelect(id: string, version: string, workspace: string): Promise<RemoteResult<void>>;
  mcpDisable(id: string): Promise<RemoteResult<void>>;
  mcpForget(id: string): Promise<RemoteResult<void>>;
  mcpRestart(id: string): Promise<RemoteResult<void>>;
  mcpRepair(id: string, version: string): Promise<RemoteResult<void>>;
  mcpRestoreArchive(archiveId: string): Promise<RemoteResult<void>>;
  status(): Promise<RemoteResult<ZhenStatus>>;
  saveCredential(value: string): Promise<RemoteResult<void>>;
  removeCredential(): Promise<RemoteResult<void>>;
  wallet(): Promise<RemoteResult<Wallet>>;
  marketList(): Promise<RemoteResult<MarketItem[]>>;
  marketFeedSnapshot(): Promise<RemoteResult<SkillFeedSnapshot>>;
  marketFeedCheck(): Promise<RemoteResult<SkillFeedSnapshot>>;
  marketFeedAutomatic(enabled: boolean): Promise<RemoteResult<void>>;
  marketAutoPolicy(): Promise<RemoteResult<SkillAutoPolicy>>;
  marketAutoUpdates(enabled: boolean): Promise<RemoteResult<void>>;
  marketPauseAuto(id: string, paused: boolean): Promise<RemoteResult<void>>;
  marketPreview(id: string, digest: string, version?: string): Promise<RemoteResult<SkillPackage>>;
  marketSelect(id: string, digest: string, version?: string): Promise<RemoteResult<void>>;
  marketDisable(id: string): Promise<RemoteResult<void>>;
  marketCancelPending(id: string): Promise<RemoteResult<void>>;
  marketVersions(id: string): Promise<RemoteResult<SkillPackage[]>>;
  marketFork(id: string, digest: string, body: string, version?: string): Promise<RemoteResult<string>>;
  canvasDiscover(): Promise<RemoteResult<CanvasDiscovery>>;
  canvasSetupDiscover():Promise<RemoteResult<CanvasSetupDiscovery>>;
  canvasConnectionCheck():Promise<RemoteResult<CanvasConnectionCheck>>;
  canvasPairingSnapshot(): Promise<RemoteResult<CanvasPairingView>>;
  canvasPairingBegin(handoff?: boolean, writable?: boolean, runnable?: boolean, assetTransfer?: boolean): Promise<RemoteResult<CanvasPairingView>>;
  canvasPairingComplete(): Promise<RemoteResult<CanvasPairingView>>;
  canvasStatus(): Promise<RemoteResult<CanvasConnection>>;
  canvasTools(): Promise<RemoteResult<CanvasToolCatalog | null>>;
  canvasWorkflowSnapshot(): Promise<RemoteResult<CanvasWorkflowView | null>>;
  canvasWorkspaces(): Promise<RemoteResult<CanvasWorkspaces>>;
  canvasActiveTargets():Promise<RemoteResult<CanvasActiveTargets>>;
  canvasTargetWorkspaces():Promise<RemoteResult<CanvasWorkspaces>>;
  canvasTargetActive():Promise<RemoteResult<CanvasActiveTargets>>;
  canvasWorkflowModels(input:CanvasModelsQuery):Promise<RemoteResult<CanvasModels>>;
  canvasTargetModels(input: CanvasModelsQuery,expectedConnection:string):Promise<RemoteResult<CanvasModels>>;
  canvasWorkflowAssets(input:CanvasAssetsQuery):Promise<RemoteResult<CanvasAssets>>;
  canvasTargetAssets(input: CanvasAssetsQuery,expectedConnection:string):Promise<RemoteResult<CanvasAssets>>;
  canvasWorkflowPreview(input: CanvasWorkflowInput): Promise<RemoteResult<CanvasWorkflowView>>;
  canvasTargetWorkflowPreview(input: CanvasWorkflowInput,expectedConnection:string): Promise<RemoteResult<CanvasWorkflowView>>;
  canvasWorkflowApprove(id: string, confirmation: boolean): Promise<RemoteResult<CanvasWorkflowView>>;
  canvasWorkflowComplete(id: string): Promise<RemoteResult<CanvasWorkflowView>>;
  canvasRunSnapshot(): Promise<RemoteResult<CanvasRunView | null>>;
  canvasRunNodes(projectId: string, canvasId: string, offset?: number): Promise<RemoteResult<CanvasRunNodes>>;
  canvasTargetRunNodes(projectId: string, canvasId: string, offset: number,expectedConnection:string): Promise<RemoteResult<CanvasRunNodes>>;
  canvasRunQuote(selection: CanvasRunSelection): Promise<RemoteResult<CanvasRunView>>;
  canvasTargetRunQuote(selection: CanvasRunSelection,expectedConnection:string): Promise<RemoteResult<CanvasRunView>>;
  canvasRunApprove(quoteId: string, confirmed: boolean, unknownPriceAccepted: boolean): Promise<RemoteResult<CanvasRunView>>;
  canvasRunSubmit(quoteId: string): Promise<RemoteResult<CanvasRunView>>;
  canvasRunRefresh(quoteId: string): Promise<RemoteResult<CanvasRunView>>;
  canvasTasksList(scope: CanvasTaskScope): Promise<RemoteResult<CanvasTaskList>>;
  canvasTargetTasksList(scope: CanvasTaskScope,expectedConnection:string): Promise<RemoteResult<CanvasTaskList>>;
  canvasTaskDetail(reference: CanvasTaskReference): Promise<RemoteResult<CanvasTaskDetail>>;
  canvasTargetTaskDetail(reference: CanvasTaskReference,expectedConnection:string): Promise<RemoteResult<CanvasTaskDetail>>;
  defaultArtInfo(): Promise<RemoteResult<DefaultArtInfo>>;
  defaultArtChunk(request: DefaultArtChunkRequest): Promise<RemoteResult<DefaultArtChunk>>;
  canvasTransferSnapshot(): Promise<RemoteResult<CanvasTransferView | null>>;
  canvasTransferPreview(input: CanvasTransferInput): Promise<RemoteResult<CanvasTransferView>>;
  canvasTargetTransferPreview(input: CanvasTransferInput,expectedConnection:string): Promise<RemoteResult<CanvasTransferView>>;
  canvasTransferApprove(id: string, confirmed: boolean): Promise<RemoteResult<CanvasTransferView>>;
  canvasTransferComplete(id: string): Promise<RemoteResult<CanvasTransferView>>;
  canvasTransferPlacement(id: string): Promise<RemoteResult<CanvasTransferView>>;
  canvasTransferRefresh(id: string): Promise<RemoteResult<CanvasTransferView>>;
  canvasCandidates(): Promise<RemoteResult<CanvasCandidateView[]>>;
  canvasCandidateAdopt(id: string): Promise<RemoteResult<CanvasWorkflowView>>;
  canvasCandidateRemove(id: string): Promise<RemoteResult<void>>;
  connectCanvas(root: string, instance: string, expectedDigest?: string): Promise<RemoteResult<CanvasConnection>>;
  disconnectCanvas(): Promise<RemoteResult<void>>;
  updatesSnapshot(): Promise<RemoteResult<UpdateReport>>;
  updatesCheck(): Promise<RemoteResult<UpdateReport>>;
  updatesAutomatic(enabled: boolean): Promise<RemoteResult<void>>;
  knowledgeBinding(project: string): Promise<RemoteResult<KnowledgeBinding | null>>;
  bindKnowledge(project: string, directory: string): Promise<RemoteResult<KnowledgeBinding | null>>;
  setKnowledgeAgentAccess(project: string, collectionId: string, enabled: boolean): Promise<RemoteResult<void>>;
  knowledgeCollections(project: string): Promise<RemoteResult<KnowledgeCollection[]>>;
  ragBackendStatus():Promise<RemoteResult<RagBackendStatus>>;
  ragBackendConfigure(selected:string,enabled:boolean,expectedRevision:string):Promise<RemoteResult<RagBackendStatus>>;
  createKnowledge(project: string, name: string, folder: string): Promise<RemoteResult<KnowledgeCollection>>;
  indexKnowledge(project: string, collectionId: string): Promise<RemoteResult<ImportResult>>;
  knowledgeImportReport(project: string, collectionId: string): Promise<RemoteResult<KnowledgeImportReport | null>>;
  searchKnowledge(project: string, query: string): Promise<RemoteResult<KnowledgeHit[]>>;
  setKnowledgeAccess(project: string, collectionId: string, enabled: boolean, cloudProvider: string): Promise<RemoteResult<void>>;
  knowledgeCitation(project: string, hitId: string, epoch: number, provider: string): Promise<RemoteResult<KnowledgeHit>>;
  knowledgeSource(project: string, hitId: string, epoch: number): Promise<RemoteResult<KnowledgeSource>>;
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap { zhen: ZhenRemote; }
  interface RemoteErrorDetailsMap { 'zhen/refused': { reason: string }; }
}

const statusSchema: z.ZodType<ZhenStatus> = z.object({ version: z.string(), provider: z.string(), model: z.string(),
  credentialConfigured: z.boolean(), credentialWritable: z.boolean(), credentialSource: z.enum(credentialSources).optional(), gatewayVerified: z.boolean() }).strict();
const walletSchema: z.ZodType<Wallet> = z.object({ amount: z.number().finite(), usedAmount: z.number().finite(), currency: z.string().regex(/^[A-Z]{3,8}$/), checkedAt: z.string() }).strict();
const collectionSchema: z.ZodType<KnowledgeCollection> = z.object({ id: z.string(), project: z.string(), name: z.string(), root: z.string(), epoch: z.number().int(), enabled: z.boolean(), cloudProvider: z.string(), agentEnabled: z.boolean(), documents: z.number().int() }).strict();
const hitSchema: z.ZodType<KnowledgeHit> = z.object({ id: z.string(), collectionId: z.string(), collectionName: z.string(), path: z.string(), line: z.number().int(), page: z.number().int().min(1).max(200).optional(), text: z.string(), epoch: z.number().int() }).strict();
const importSchema: z.ZodType<ImportResult> = z.object({ indexed: z.number().int(), skipped: z.number().int(), failed: z.number().int() }).strict();
const projectInput = z.string().min(1).max(200);
const bindingSchema = z.object({ project: z.string(), root: z.string(), epoch: z.number().int() }).strict().nullable();
const canvasSchema: z.ZodType<CanvasConnection> = z.object({ configured: z.boolean(), root: z.string(), digest: z.string(), instance: z.string().regex(/^[A-Za-z0-9._-]{0,128}$/).optional(), connected: z.boolean(), code: z.string(), message: z.string(), compat: z.unknown() }).strict();
const selectedVersion = z.string().max(40).regex(/^(?:|(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/).default('');

function codec(name: string, schema: z.ZodType): TypertRemoteCodecSpec {
  return { mode: 'strict', typeSymbol: `dsh-zhen#${name}`, create: () => schema };
}
function method(name: string, schema: z.ZodType, description: string, inputs: Array<[string, z.ZodType]> = []): TypertRemoteMethodSpec {
  return { service: 'zhen', description, invocation: { kind: 'direct' },
    parameters: inputs.map(([name, schema]) => { const parameter = codec(`${name}:value`, schema); return { name, source: 'json', codec: parameter, strictCodec: parameter }; }),
    result: codec(`${name}:result`, schema),
    sourceLocation: { file: 'packages/dsh-zhen/src/remote.ts', line: 1, column: 1 } };
}
export const TYPERT_REMOTE = createTypertRemoteInfo({ package: 'dsh-zhen', methods: {
  'zhen/restoredSkillConsent':method('restoredSkillConsent',restoredSkillConsentViewSchema,'Owner UI: inspect restored filesystem skill sources for this profile; no instruction bodies or activation.',[['page',z.number().int().min(0).max(102).default(0)]]),
  'zhen/restoredManagedSkillConsent':method('restoredManagedSkillConsent',restoredManagedSkillView,'Owner UI: page original managed source invocation choices; no downloads or pending activation.',[['page',z.number().int().min(0).max(2002).default(0)]]),
  'zhen/restoredManagedSkillConsentChange':method('restoredManagedSkillConsentChange',restoredManagedSkillView,'Owner UI: explicitly grant or revoke one exact restored managed source for this profile; keep all writers and automatic updates paused.',[['request',restoredManagedSkillRequest]]),
  'zhen/restoredManagedRuntimeStatus':method('restoredManagedRuntimeStatus',restoredManagedRuntimeView,'Owner UI: review complete paged source metadata before creating a writable managed-skill copy.',[['page',z.number().int().min(0).max(2002).default(0)]]),
  'zhen/restoredManagedRuntimeChange':method('restoredManagedRuntimeChange',restoredManagedRuntimeView,'Owner UI: explicitly enable or pause this profile\'s independent managed-skill copy; original restore remains unchanged and update approvals start fresh.',[['request',restoredManagedRuntimeRequest]]),
  'zhen/restoredSkillConsentChange':method('restoredSkillConsentChange',restoredSkillConsentViewSchema,'Owner UI: explicitly grant or revoke only this profile and exact recovered skill sources; no archived tasks, downloads or native approval.',[['request',restoredSkillConsentRequestSchema]]),
  'zhen/backupCandidatePlan':method('backupCandidatePlan',recoveryPlanSchema,'Owner UI: verify original candidate bytes and inspect typed restored locations; no execution, rebinding or activation.',[['id',z.uuid()]]),
  'zhen/backupCandidateProjects':method('backupCandidateProjects',recoveryProjectsSchema,'Owner UI: verify the original candidate and page only original project directories and counts; no session content, original project reads or activation.',[['id',z.uuid()],['cursor',recoveryProjectCursorSchema]]),
  'zhen/backupCandidateList':method('backupCandidateList',recoveryCatalogSchema,'Owner UI: page durable candidate records plus current in-memory candidates; no candidate file content or activation.',[['cursor',z.string().max(256)]]),
  'zhen/backupCandidateForget':method('backupCandidateForget',z.void(),'Owner UI: remove only the selected candidate record; preserve candidate directories and backup files.',[['id',z.uuid()]]),
  'zhen/backupCandidateRegister':method('backupCandidateRegister',backupJobSchema,'Owner UI: recheck the original candidate and retry saving its local record without repeating restoration.',[['id',z.uuid()]]),
  'zhen/backupCandidateSnapshot':method('backupCandidateSnapshot',recoveryPreviewSchema,'Owner UI: inspect creation-time counts and review issues of the original inactive recovery job; no file reads or activation.',[['id',z.uuid()]]),
  'zhen/backupCandidateVerify':method('backupCandidateVerify',recoveryPreviewSchema,'Owner UI: compare owned candidate files and link text with the original retained baseline; no arbitrary path, external link reads or activation.',[['id',z.uuid()]]),
  'zhen/backupInfo':method('backupInfo',backupInfoSchema,'Owner UI: describe supported local backup coverage; never initializes a missing source.'),
  'zhen/backupFiles':method('backupFiles',backupFilesSchema,'Owner UI: list a bounded set of local encrypted backup files.',[['folder',backupFolderSchema]]),
  'zhen/backupCreate':method('backupCreate',backupJobSchema,'Owner UI: create an encrypted snapshot of explicitly selected components; never includes credential stores.',[['request',backupCreateSchema]]),
  'zhen/backupRestore':method('backupRestore',backupJobSchema,'Owner UI: authenticate a local backup and build an inactive recovery candidate; no activation or execution.',[['request',projectAwareRestoreSchema]]),
  'zhen/backupStatus':method('backupStatus',backupJobSchema,'Owner UI: read progress of the original local backup job without retrying it.',[['id',z.uuid()]]),
  'zhen/backupCancel':method('backupCancel',z.void(),'Owner UI: cancel the original local backup job and clean incomplete owned candidates.',[['id',z.uuid()]]),
  'zhen/directoryPickerInfo':method('directoryPickerInfo',directoryChoiceInfoSchema,'Owner UI only: describe the public Host directory-picker capability without opening a dialog or reading files.'),
  'zhen/directoryPickerNative':method('directoryPickerNative',directoryChoiceResultSchema,'Owner UI only: explicitly open one Host directory chooser. Selection does not grant access or start another action.',[['request',directoryChoiceRequestSchema]]),
  'zhen/directoryPickerBrowse':method('directoryPickerBrowse',directoryChoiceBrowseResultSchema,'Owner UI only: browse one bounded directory level through the public Host picker. No file reads or workspace creation.',[['request',directoryChoiceBrowseRequestSchema]]),
  'zhen/directoryPickerCancel':method('directoryPickerCancel',z.void(),'Owner UI only: cancel this picker request without changing the selected path.',[['request',directoryChoiceRequestSchema]]),
  'zhen/gatewayMediaPreview': method('gatewayMediaPreview', z.array(gatewayMediaTicketSchema).max(100), 'Prepare short-lived result references without returning signed URLs.', [['id', z.uuid()]]),
  'zhen/gatewayMediaSave': method('gatewayMediaSave', gatewayMediaReceiptSchema, 'Save one chosen task result into an existing local folder without overwriting files.', [['id', z.uuid()], ['folder', z.string().min(1).max(4096)]]),
  'zhen/gatewayMediaList': method('gatewayMediaList', z.array(gatewayMediaReceiptSchema).max(100), 'List local export receipts without media contents or URLs.'),
  'zhen/gatewayMediaCancel': method('gatewayMediaCancel', z.void(), 'Stop an active media download; finished local files remain.', [['id', z.uuid()]]),
  'zhen/gatewayMediaForget': method('gatewayMediaForget', z.void(), 'Forget only an export receipt; never delete the exported file.', [['id', z.uuid()]]),
  'zhen/gatewayTaskList': method('gatewayTaskList', z.array(gatewayTaskRecordSchema).max(100), 'Read existing tracked task metadata without credentials or result links.'),
  'zhen/gatewayTaskAdd': method('gatewayTaskAdd', gatewayTaskRecordSchema, 'Remember an existing task id; no network or generation request.', [['spec', gatewayTaskSpecSchema]]),
  'zhen/gatewayTaskRefresh': method('gatewayTaskRefresh', gatewayTaskRecordSchema, 'Query an existing id through one fixed Host-only GET.', [['id', z.uuid()]]),
  'zhen/gatewayTaskTracking': method('gatewayTaskTracking', gatewayTaskRecordSchema, 'Enable or pause status polling; does not cancel the upstream job.', [['id', z.uuid()], ['enabled', z.boolean()]]),
  'zhen/gatewayTaskRemove': method('gatewayTaskRemove', z.void(), 'Remove only the local tracking record; does not delete upstream data.', [['id', z.uuid()]]),
  'zhen/githubSkillList': method('githubSkillList', z.array(githubSkillSourceViewSchema).max(16), 'Read approved GitHub sources and this Host snapshot selections.'),
  'zhen/githubSkillDownload': method('githubSkillDownload', githubSkillPreviewSchema, 'Download a commit-pinned public repository skill snapshot without execution or activation.', [['spec', githubSkillSpecSchema]]),
  'zhen/githubSkillInspect': method('githubSkillInspect', githubSkillPreviewSchema, 'Inspect a retained snapshot and its full resource differences.', [['id', digestSchema], ['digest', digestSchema]]),
  'zhen/githubSkillHistory': method('githubSkillHistory', z.array(githubSkillSummarySchema).max(20), 'Read retained snapshot identities.', [['id', digestSchema]]),
  'zhen/githubSkillFile': method('githubSkillFile', githubSkillFilePreviewSchema, 'Preview a registered file as bounded text or opaque metadata.', [['id', digestSchema], ['digest', digestSchema], ['location', z.enum(['package', 'origin'])], ['path', z.string().min(1).max(512)]]),
  'zhen/githubSkillApprove': method('githubSkillApprove', z.void(), 'Select an explicitly reviewed resource snapshot; changes wait for the next Host start.', [['id', digestSchema], ['digest', digestSchema], ['confirmation', z.literal(GITHUB_SKILL_POLICY)]]),
  'zhen/githubSkillCheck': method('githubSkillCheck', z.void(), 'Check the tracked ref and download an inactive candidate.', [['id', digestSchema]]),
  'zhen/githubSkillAutomatic': method('githubSkillAutomatic', z.void(), 'Control daily candidate checking and download without code activation.', [['id', digestSchema], ['enabled', z.boolean()]]),
  'zhen/githubSkillDisable': method('githubSkillDisable', z.void(), 'Disable this source without deleting snapshots.', [['id', digestSchema]]),
  'zhen/githubSkillForget': method('githubSkillForget', z.void(), 'Disconnect this source while retaining downloaded files.', [['id', digestSchema]]),
  'zhen/githubSkillCancelPending': method('githubSkillCancelPending', z.void(), 'Keep this Host snapshot and cancel a reviewed queued selection.', [['id', digestSchema]]),
  'zhen/githubSkillDelete': method('githubSkillDelete', z.void(), 'Delete an unselected owned snapshot; current/queued selections are protected.', [['id', digestSchema], ['digest', digestSchema]]),
  'zhen/githubSkillCancelDownload': method('githubSkillCancelDownload', z.void(), 'Cancel this Host active public skill download.'),
  'zhen/localSkillList': method('localSkillList', z.array(localSkillViewSchema).max(16), 'Read connected local directories without executing their resources.'),
  'zhen/localSkillPreview': method('localSkillPreview', localSkillDraftSchema, 'Preview a local SKILL.md directory or one-level library before trusting it.', [['folder', z.string().min(1).max(4096)], ['mode', localSkillMode]]),
  'zhen/localSkillBody': method('localSkillBody', localSkillBodySchema, 'Read one digest-matching instruction body from a selected local directory.', [['folder', z.string().min(1).max(4096)], ['directory', z.string().max(200).refine(value => !value || !value.startsWith('.') && !/[\\/:\0]/.test(value))], ['digest', digestSchema]]),
  'zhen/localSkillConnect': method('localSkillConnect', z.void(), 'Trust a displayed local directory and its future changes without installing programs.', [['folder', z.string().min(1).max(4096)], ['mode', localSkillMode], ['digest', digestSchema], ['confirmation', z.literal(LOCAL_SKILL_POLICY)]]),
  'zhen/localSkillDisable': method('localSkillDisable', z.void(), 'Stop advertising and loading a local skill source.', [['id', z.uuid()]]),
  'zhen/localSkillDisconnect': method('localSkillDisconnect', z.void(), 'Forget a local source without deleting its files.', [['id', z.uuid()]]),
  'zhen/gatewayCheckPreview': method('gatewayCheckPreview', gatewayCheckPreviewSchema, 'Prepare one fixed 32-token Flash check without sending a model request.'),
  'zhen/gatewayCheckHistory': method('gatewayCheckHistory', z.array(gatewayCheckReceiptSchema).max(10), 'Read bounded credential-free connection-check receipts.'),
  'zhen/gatewayCheckRun': method('gatewayCheckRun', gatewayCheckReceiptSchema, 'Explicitly confirm a fixed short paid check; a spent receipt cannot dispatch twice.', [['id', z.uuid()], ['confirmation', z.literal(GATEWAY_CHECK_POLICY)]]),
  'zhen/gatewayCheckCancel': method('gatewayCheckCancel', gatewayCheckReceiptSchema, 'Revoke a preview or request cancellation without promising a refund.', [['id', z.uuid()]]),
  'zhen/gatewayCatalog': method('gatewayCatalog', capabilityCatalogSchema, 'Read the reviewed public capability inventory without submitting work.'),
  'zhen/gatewayCatalogCheckSnapshot': method('gatewayCatalogCheckSnapshot', capabilityCheckSchema, 'Read cached capability source changes.'),
  'zhen/gatewayCatalogCheck': method('gatewayCatalogCheck', capabilityCheckSchema, 'Compare fixed public source hashes and action facts without changing routing.'),
  'zhen/gatewayCatalogAutomatic': method('gatewayCatalogAutomatic', z.void(), 'Control daily public capability metadata checks.', [['enabled', z.boolean()]]),
  'zhen/mcpSnapshot': method('mcpSnapshot', mcpMarketViewSchema, 'Read curated MCP installations, permissions and runtime state.'),
  'zhen/mcpRestart': method('mcpRestart', z.void(), 'Drain calls and reload the same enabled MCP connection.', [['id', mcpId]]),
  'zhen/mcpRepair': method('mcpRepair', z.void(), 'Disable/drain, re-download and retain the previous program; renewed explicit trust is required.', [['id', mcpId], ['version', mcpReleaseSchema.shape.version]]),
  'zhen/mcpRestoreArchive': method('mcpRestoreArchive', z.void(), 'Restore a hash-matching quarantined program while leaving it disabled.', [['archiveId', z.uuid()]]),
  'zhen/mcpCheck': method('mcpCheck', mcpMarketViewSchema, 'Check metadata for the fixed MCP sources.'),
  'zhen/mcpAutomatic': method('mcpAutomatic', z.void(), 'Control daily MCP checks and inactive compatible downloads for enabled sources.', [['enabled', z.boolean()]]),
  'zhen/mcpInstall': method('mcpInstall', z.void(), 'Download a reviewed exact MCP release without lifecycle hooks.', [['id', mcpId], ['version', mcpReleaseSchema.shape.version], ['integrity', mcpReleaseSchema.shape.integrity]]),
  'zhen/mcpSelect': method('mcpSelect', z.void(), 'Trust a retained MCP program for one exact project.', [['id', mcpId], ['version', mcpReleaseSchema.shape.version], ['workspace', z.string().min(1).max(4096)]]),
  'zhen/mcpDisable': method('mcpDisable', z.void(), 'Block new calls immediately and drain ongoing calls.', [['id', mcpId]]),
  'zhen/mcpForget': method('mcpForget', z.void(), 'Remove a disabled connection while retaining data and installed versions.', [['id', mcpId]]),
  'zhen/status': method('status', statusSchema, 'Read provider credential presence without a paid request.'),
  'zhen/githubAccessInfo': method('githubAccessInfo', githubAccessSchema, 'Read first-party GitHub credential presence only.'),
  'zhen/githubSaveCredential': method('githubSaveCredential', z.void(), 'Save a first-party GitHub read credential through Host credentials.', [['value', githubCredentialValue]]),
  'zhen/githubRemoveCredential': method('githubRemoveCredential', z.void(), 'Remove the writable first-party GitHub credential and stop pending source reads.'),
  'zhen/saveCredential': method('saveCredential', z.void(), 'Save a credential through the Host credential service.', [['value', z.string().min(8).max(4096).regex(/^\S+$/)]]),
  'zhen/removeCredential': method('removeCredential', z.void(), 'Remove the locally stored Seedance credential.'),
  'zhen/wallet': method('wallet', walletSchema, 'Read the Seedance wallet from the Host.'),
  'zhen/marketList': method('marketList', z.array(marketItemSchema), 'Read the local skill catalog.'),
  'zhen/marketFeedSnapshot': method('marketFeedSnapshot', skillFeedSnapshotSchema, 'Read cached first-party skill update metadata.'),
  'zhen/marketFeedCheck': method('marketFeedCheck', skillFeedSnapshotSchema, 'Download bounded instruction candidates from the fixed repository.'),
  'zhen/marketFeedAutomatic': method('marketFeedAutomatic', z.void(), 'Control daily candidate downloads without activation.', [['enabled', z.boolean()]]),
  'zhen/marketAutoPolicy': method('marketAutoPolicy', skillAutoPolicySchema, 'Read the persisted first-party standalone-text automatic-update policy.'),
  'zhen/marketAutoUpdates': method('marketAutoUpdates', z.void(), 'Choose whether validated fixed-source text updates can be scheduled for the next Host start.', [['enabled', z.boolean()]]),
  'zhen/marketPauseAuto': method('marketPauseAuto', z.void(), 'Pause or resume automatic updates for an installed source skill.', [['id', skillId], ['paused', z.boolean()]]),
  'zhen/marketPreview': method('marketPreview', skillPackageSchema, 'Preview an exact instruction version.', [['id', skillId], ['digest', digestSchema], ['version', selectedVersion]]),
  'zhen/marketSelect': method('marketSelect', z.void(), 'Install or stage a reviewed instruction version.', [['id', skillId], ['digest', digestSchema], ['version', selectedVersion]]),
  'zhen/marketDisable': method('marketDisable', z.void(), 'Disable new skill loads.', [['id', skillId]]),
  'zhen/marketCancelPending': method('marketCancelPending', z.void(), 'Cancel a staged skill version.', [['id', skillId]]),
  'zhen/marketVersions': method('marketVersions', z.array(skillPackageSchema), 'List retained local versions.', [['id', skillId]]),
  'zhen/marketFork': method('marketFork', skillId, 'Save an independent personal skill.', [['id', skillId], ['digest', digestSchema], ['body', z.string().min(1).max(60000)], ['version', selectedVersion]]),
  'zhen/canvasDiscover': method('canvasDiscover', canvasDiscoverySchema, 'Find and fingerprint local managed Canvas CLI installations without executing them.'),
  'zhen/canvasSetupDiscover':method('canvasSetupDiscover',canvasSetupDiscoverySchema,'Owner setup: read bounded desktop executable paths and CLI metadata; never execute candidates or pair.'),
  'zhen/canvasConnectionCheck':method('canvasConnectionCheck',canvasConnectionCheckSchema,'Owner setup: discover live instances and perform the already-reviewed CLI exact handshake without reading credentials or pairing.'),
  'zhen/canvasPairingSnapshot': method('canvasPairingSnapshot', canvasPairingSchema, 'Read this connection UI pairing progress or verify a stored session without returning secrets.'),
  'zhen/canvasPairingBegin': method('canvasPairingBegin', canvasPairingSchema, 'Explicitly request pairing for the authoritative Canvas window to approve.', [['handoff', z.boolean().default(false)], ['writable', z.boolean().default(false)], ['runnable', z.boolean().default(false)], ['assetTransfer', z.boolean().default(false)]]),
  'zhen/canvasPairingComplete': method('canvasPairingComplete', canvasPairingSchema, 'Claim a window-approved pairing once and save only through the original CLI secureStore.'),
  'zhen/canvasStatus': method('canvasStatus', canvasSchema, 'Read the existing canvas compatibility status.'),
  'zhen/canvasTools': method('canvasTools', canvasToolCatalogSchema.nullable(), 'Read and cross-check the existing versioned Canvas planning catalog.'),
  'zhen/canvasWorkflowSnapshot': method('canvasWorkflowSnapshot', canvasWorkflowSchema.nullable(), 'Read non-secret native workflow application progress.'),
  'zhen/canvasWorkspaces': method('canvasWorkspaces', canvasWorkspacesSchema, 'List native Canvas targets for explicit UI planning.'),
  'zhen/canvasTargetWorkspaces':method('canvasTargetWorkspaces',canvasTargetWorkspacesSchema,'Owner-only target directory carrying an opaque connection identity. No trust, workspace or approval change.'),
  'zhen/canvasTargetActive':method('canvasTargetActive',canvasTargetActiveSchema,'Owner-only current window and target directory carrying the same connection identity.'),
  'zhen/canvasActiveTargets':method('canvasActiveTargets',canvasActiveTargetsSchema,'Owner read only: current native window metadata and available targets under the same reviewed connection/session. Never changes workspace, trust or approval.'),
  'zhen/canvasWorkflowModels':method('canvasWorkflowModels',canvasModelsSchema,'Read scoped public native models/readiness for explicit UI selection without settings or credentials.',[['input',canvasModelsQuery]]),
  'zhen/canvasTargetModels':method('canvasTargetModels',canvasModelsSchema,'Read scoped public native models/readiness for explicit UI selection without settings or credentials.',[['input',canvasModelsQuery],['expectedConnection',z.string().regex(/^[a-f0-9]{64}$/)]] ),
  'zhen/canvasWorkflowAssets':method('canvasWorkflowAssets',canvasAssetsSchema,'Read scoped public native reference metadata without media URLs or file contents.',[['input',canvasAssetsQuery]]),
  'zhen/canvasTargetAssets':method('canvasTargetAssets',canvasAssetsSchema,'Read scoped public native reference metadata without media URLs or file contents.',[['input',canvasAssetsQuery],['expectedConnection',z.string().regex(/^[a-f0-9]{64}$/)]] ),
  'zhen/canvasWorkflowPreview': method('canvasWorkflowPreview', canvasWorkflowSchema, 'Prepare a native creative plan without writes or Provider calls.', [['input', canvasWorkflowInput]]),
  'zhen/canvasTargetWorkflowPreview': method('canvasTargetWorkflowPreview', canvasWorkflowSchema, 'Prepare a native creative plan without writes or Provider calls.', [['input', canvasWorkflowInput],['expectedConnection',z.string().regex(/^[a-f0-9]{64}$/)]] ),
  'zhen/canvasWorkflowApprove': method('canvasWorkflowApprove', canvasWorkflowSchema, 'Human UI confirmation requests authoritative Canvas window approval.', [['id', z.uuid()], ['confirmation', z.boolean()]]),
  'zhen/canvasWorkflowComplete': method('canvasWorkflowComplete', canvasWorkflowSchema, 'Explicitly check a native window approval and apply its bound structure once.', [['id', z.uuid()]]),
  'zhen/canvasRunSnapshot': method('canvasRunSnapshot', canvasRunViewSchema.nullable(), 'Read references for the current native run quote without secrets.'),
  'zhen/canvasRunNodes': method('canvasRunNodes', canvasRunNodesSchema, 'Read bounded native node/schema metadata for explicit selection.', [['projectId', z.string().min(1).max(160)], ['canvasId', z.string().min(1).max(160)], ['offset', z.number().int().min(0).max(100000).default(0)]]),
  'zhen/canvasTargetRunNodes': method('canvasTargetRunNodes', canvasRunNodesSchema.refine(value=>value.connectionId!==undefined,'Target connection identity is required.'), 'Read bounded native node/schema metadata for explicit selection.', [['projectId', z.string().min(1).max(160)], ['canvasId', z.string().min(1).max(160)], ['offset', z.number().int().min(0).max(100000).default(0)],['expectedConnection',z.string().regex(/^[a-f0-9]{64}$/)]]),
  'zhen/canvasRunQuote': method('canvasRunQuote', canvasRunViewSchema, 'Prepare a native run plan; price remains unknown and no intent is reserved.', [['selection', canvasRunSelection]]),
  'zhen/canvasTargetRunQuote': method('canvasTargetRunQuote', canvasRunViewSchema, 'Prepare a native run plan; price remains unknown and no intent is reserved.', [['selection', canvasRunSelection],['expectedConnection',z.string().regex(/^[a-f0-9]{64}$/)]] ),
  'zhen/canvasRunApprove': method('canvasRunApprove', canvasRunViewSchema, 'Human review and explicit unknown-price acceptance request native window approval.', [['quoteId', z.uuid()], ['confirmed', z.boolean()], ['unknownPriceAccepted', z.boolean()]]),
  'zhen/canvasRunSubmit': method('canvasRunSubmit', canvasRunViewSchema, 'Explicit native window completion may reserve one durable intent. No repeat after ambiguity.', [['quoteId', z.uuid()]]),
  'zhen/canvasRunRefresh': method('canvasRunRefresh', canvasRunViewSchema, 'GET-only native operation/approval lookup; never retries submission.', [['quoteId', z.uuid()]]),
  'zhen/canvasTasksList': method('canvasTasksList', canvasTaskListSchema, 'Read at most 100 native intents owned by the current pairing in an explicit canvas; no local paid ledger.', [['scope', canvasTaskScope]]),
  'zhen/canvasTargetTasksList': method('canvasTargetTasksList', canvasTaskListSchema, 'Read at most 100 native intents owned by the current pairing in an explicit canvas; no local paid ledger.', [['scope', canvasTaskScope],['expectedConnection',z.string().regex(/^[a-f0-9]{64}$/)]] ),
  'zhen/canvasTaskDetail': method('canvasTaskDetail', canvasTaskDetailSchema, 'GET-only original intent and bounded completion evidence summary without URLs or raw error messages.', [['reference', canvasTaskReference]]),
  'zhen/canvasTargetTaskDetail': method('canvasTargetTaskDetail', canvasTaskDetailSchema, 'GET-only original intent and bounded completion evidence summary without URLs or raw error messages.', [['reference', canvasTaskReference],['expectedConnection',z.string().regex(/^[a-f0-9]{64}$/)]] ),
  'zhen/defaultArtInfo': method('defaultArtInfo', defaultArtInfoSchema, 'Read the confirmed local default-art manifest summary without a Host path.'),
  'zhen/defaultArtChunk': method('defaultArtChunk', defaultArtChunkSchema, 'Read one bounded chunk of an already captured, hash-pinned raster; no arbitrary file access.', [['request', defaultArtChunkRequest]]),
  'zhen/canvasTransferSnapshot': method('canvasTransferSnapshot', canvasTransferViewSchema.nullable(), 'Read local saved-media handoff references without paths or approval secrets.'),
  'zhen/canvasTransferPreview': method('canvasTransferPreview', canvasTransferViewSchema, 'Preview an owned export receipt in an explicit native project/canvas.', [['input', canvasTransferInput]]),
  'zhen/canvasTargetTransferPreview': method('canvasTargetTransferPreview', canvasTransferViewSchema, 'Preview an owned export receipt in an explicit native project/canvas.', [['input', canvasTransferInput],['expectedConnection',z.string().regex(/^[a-f0-9]{64}$/)]] ),
  'zhen/canvasTransferApprove': method('canvasTransferApprove', canvasTransferViewSchema, 'Human review requests native file-copy or placement approval.', [['id', z.uuid()], ['confirmed', z.boolean()]]),
  'zhen/canvasTransferComplete': method('canvasTransferComplete', canvasTransferViewSchema, 'Check authoritative window approval and complete the bound local copy/placement once.', [['id', z.uuid()]]),
  'zhen/canvasTransferPlacement': method('canvasTransferPlacement', canvasTransferViewSchema, 'Preview placement of the already managed native asset; no Provider call.', [['id', z.uuid()]]),
  'zhen/canvasTransferRefresh': method('canvasTransferRefresh', canvasTransferViewSchema, 'Read original native asset/patch/approval progress; never resubmit after ambiguity.', [['id', z.uuid()]]),
  'zhen/canvasCandidates': method('canvasCandidates', canvasCandidatesSchema, 'Read process-local creative plans observed in accepted Canvas tool results.'),
  'zhen/canvasCandidateAdopt': method('canvasCandidateAdopt', canvasWorkflowSchema, 'Select an existing native chat plan for human review; no replanning, window approval or mutation.', [['id', z.uuid()]]),
  'zhen/canvasCandidateRemove': method('canvasCandidateRemove', z.void(), 'Forget only a local inbox entry without changing native Canvas plans.', [['id', z.uuid()]]),
  'zhen/connectCanvas': method('connectCanvas', canvasSchema, 'Connect a user-selected installed canvas CLI.', [['root', z.string().min(1).max(4096)], ['instance', z.string().regex(/^[A-Za-z0-9._-]{0,128}$/)], ['expectedDigest', z.string().regex(/^(?:|[a-f0-9]{64})$/).default('')]]),
  'zhen/disconnectCanvas': method('disconnectCanvas', z.void(), 'Disconnect the local canvas adapter.'),
  'zhen/updatesSnapshot': method('updatesSnapshot', updateReportSchema, 'Read cached public update metadata.'),
  'zhen/updatesCheck': method('updatesCheck', updateReportSchema, 'Check fixed official public metadata sources.'),
  'zhen/updatesAutomatic': method('updatesAutomatic', z.void(), 'Control automatic public metadata checks.', [['enabled', z.boolean()]]),
  'zhen/knowledgeBinding': method('knowledgeBinding', bindingSchema, 'Read the explicit workspace binding.', [['project', projectInput]]),
  'zhen/bindKnowledge': method('bindKnowledge', bindingSchema, 'Bind a local knowledge space to an exact working directory.', [['project', projectInput], ['directory', z.string().max(4096)]]),
  'zhen/setKnowledgeAgentAccess': method('setKnowledgeAgentAccess', z.void(), 'Set the separate permission for agent retrieval.', [['project', projectInput], ['collectionId', z.string().uuid()], ['enabled', z.boolean()]]),
  'zhen/knowledgeCollections': method('knowledgeCollections', z.array(collectionSchema), 'List local collections.', [['project', projectInput]]),
  'zhen/ragBackendStatus':method('ragBackendStatus',ragBackendStatusSchema,'Read local retrieval backend availability.'),
  'zhen/ragBackendConfigure':method('ragBackendConfigure',ragBackendStatusSchema,'Choose or pause a local retrieval backend without changing collection grants.',[['selected',ragBackendId],['enabled',z.boolean()],['expectedRevision',z.uuid()]]),
  'zhen/createKnowledge': method('createKnowledge', collectionSchema, 'Authorize a local folder.', [['project', projectInput], ['name', z.string().min(1).max(100)], ['folder', z.string().min(1).max(4096)]]),
  'zhen/indexKnowledge': method('indexKnowledge', importSchema, 'Index an authorized local collection.', [['project', projectInput], ['collectionId', z.string().uuid()]]),
  'zhen/knowledgeImportReport': method('knowledgeImportReport', knowledgeImportReportSchema.nullable(), 'Read bounded local import diagnostics for the current collection revision.', [['project', projectInput], ['collectionId', z.string().uuid()]]),
  'zhen/searchKnowledge': method('searchKnowledge', z.array(hitSchema), 'Search only the selected project.', [['project', projectInput], ['query', z.string().max(200)]]),
  'zhen/setKnowledgeAccess': method('setKnowledgeAccess', z.void(), 'Change collection permissions.', [['project', projectInput], ['collectionId', z.string().uuid()], ['enabled', z.boolean()], ['cloudProvider', z.enum(['', 'seedance'])]]),
  'zhen/knowledgeCitation': method('knowledgeCitation', hitSchema, 'Revalidate a citation before use.', [['project', projectInput], ['hitId', z.string().uuid()], ['epoch', z.number().int().positive()], ['provider', z.literal('seedance')]]),
  'zhen/knowledgeSource': method('knowledgeSource', ragSourceSchema, 'Read an authorized index snapshot; no arbitrary path or cloud transfer.', [['project', projectInput], ['hitId', z.string().uuid()], ['epoch', z.number().int().positive()]]),
} }, z);
export default TYPERT_REMOTE;
import {restoredSkillConsentViewSchema,restoredSkillConsentRequestSchema} from './restored-skill-consent-schema.ts';
import type {RestoredSkillConsentView,RestoredSkillConsentRequest} from './restored-skill-consent-schema.ts';
export {RESTORED_SKILL_CONSENT_POLICY,restoredSkillConsentViewSchema} from './restored-skill-consent-schema.ts';
export type {RestoredSkillConsentView,RestoredSkillConsentRequest} from './restored-skill-consent-schema.ts';
import {restoredManagedSkillView,restoredManagedSkillRequest} from './restored-managed-skill-schema.ts';
import type {RestoredManagedSkillView,RestoredManagedSkillRequest} from './restored-managed-skill-schema.ts';
export {RESTORED_MANAGED_SKILL_POLICY,restoredManagedSkillView} from './restored-managed-skill-schema.ts';
export type {RestoredManagedSkillView,RestoredManagedSkillRequest} from './restored-managed-skill-schema.ts';
import {restoredManagedRuntimeRequest,restoredManagedRuntimeView} from './restored-managed-runtime-schema.ts';
import type {RestoredManagedRuntimeRequest,RestoredManagedRuntimeView} from './restored-managed-runtime-schema.ts';
export {RESTORED_MANAGED_RUNTIME_POLICY,restoredManagedRuntimeView} from './restored-managed-runtime-schema.ts';
export type {RestoredManagedRuntimeRequest,RestoredManagedRuntimeView} from './restored-managed-runtime-schema.ts';
