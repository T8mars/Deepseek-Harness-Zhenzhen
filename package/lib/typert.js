// packages/dsh-zhen/src/remote.ts
import { z as z25 } from "zod";
import { createTypertRemoteInfo } from "@deepseek-ai/dsh-typert-protocol/remote-info";

// packages/dsh-zhen/src/github-access-schema.ts
import { z } from "zod";
var FIRST_PARTY_REPOSITORY = "T8mars/Deepseek-Harness-Zhenzhen";
var githubCredentialValue = z.string().min(8).max(4096).regex(/^[^\s\x00-\x1f\x7f]+$/);
var githubAccessSchema = z.object({ repository: z.literal(FIRST_PARTY_REPOSITORY), configured: z.boolean(), writable: z.boolean() }).strict();

// packages/dsh-zhen/src/knowledge-import-schema.ts
import { z as z2 } from "zod";

// packages/dsh-zhen/src/document-error.ts
var documentFailureCodes = ["DOCUMENT_LIMIT", "DOCUMENT_PASSWORD", "DOCUMENT_UNSUPPORTED", "DOCUMENT_INVALID", "DECODE_TIMEOUT", "DECODER_BUSY", "TEXT_ENCODING"];

// packages/dsh-zhen/src/knowledge-import-schema.ts
var knowledgeImportIssueCode = z2.enum([...documentFailureCodes, "HIDDEN_OR_LINK", "EXCLUDED_DIRECTORY", "UNSUPPORTED_FORMAT", "FILE_TOO_LARGE", "SOURCE_CHANGED", "NON_TEXT", "NO_TEXT", "FILE_READ_FAILED"]);
var relativePath = z2.string().min(1).max(4096).refine((path) => !/^[/\\]|^[a-z]:[/\\]/i.test(path) && !path.split("/").includes(".."), "Expected a collection-relative path.");
var knowledgeImportReportSchema = z2.object({ project: z2.string().min(1).max(200), collectionId: z2.uuid(), epoch: z2.number().int().positive(), createdAt: z2.iso.datetime(), examined: z2.number().int().min(0).max(5e3), indexed: z2.number().int().min(0).max(5e3), skipped: z2.number().int().min(0).max(5e3), failed: z2.number().int().min(0).max(5e3), issues: z2.array(z2.object({ path: relativePath, pathTruncated: z2.boolean(), outcome: z2.enum(["skipped", "failed"]), code: knowledgeImportIssueCode }).strict()).max(50), omitted: z2.number().int().min(0).max(5e3) }).strict().refine((value) => value.issues.length + value.omitted === value.skipped + value.failed && value.indexed + value.skipped + value.failed <= value.examined, "Import issue counts must agree.");

// packages/dsh-zhen/src/rag-schema.ts
import { z as z3 } from "zod";
var ragHitSchema = z3.object({ id: z3.string().uuid(), collectionId: z3.string().uuid(), collectionName: z3.string().max(100), path: z3.string().min(1).max(4096), line: z3.number().int().positive(), page: z3.number().int().min(1).max(200).optional(), text: z3.string().max(1600), epoch: z3.number().int().positive() }).strict();
var ragSourceSchema = z3.object({ anchorId: z3.string().uuid(), sections: z3.array(ragHitSchema).min(1).max(3), firstSection: z3.number().int().positive(), totalSections: z3.number().int().positive(), earlierId: z3.string().uuid().nullable(), laterId: z3.string().uuid().nullable() }).strict();
var ragPresentationSchema = z3.discriminatedUnion("kind", [
  z3.object({ schema: z3.literal("dsh-zhen-rag-presentation-v1"), kind: z3.literal("search"), query: z3.string().max(200), hits: z3.array(ragHitSchema).max(12), notice: z3.string().max(1e3) }).strict(),
  z3.object({ schema: z3.literal("dsh-zhen-rag-presentation-v1"), kind: z3.literal("source"), source: ragSourceSchema, notice: z3.string().max(1e3) }).strict()
]);

// packages/dsh-zhen/src/rag-backend-schema.ts
import { z as z4 } from "zod";
var ragBackendId = z4.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
var ragBackendSettingsSchema = z4.object({ schemaVersion: z4.literal(1), selected: ragBackendId, enabled: z4.boolean() }).strict();
var ragBackendStatusSchema = z4.object({ selected: ragBackendId, enabled: z4.boolean(), state: z4.enum(["ready", "paused", "unavailable", "invalid"]), revision: z4.uuid(), providers: z4.array(z4.object({ id: ragBackendId, label: z4.string().min(1).max(100) }).strict()).max(16) }).strict();

// packages/dsh-zhen/src/market-schema.ts
import { z as z5 } from "zod";

// packages/dsh-zhen/src/compatibility.ts
var INSTRUCTION_HOSTS = ["0.2.1-rc.2"];

// packages/dsh-zhen/src/market-schema.ts
var skillId = z5.string().max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
var digestSchema = z5.string().regex(/^[a-f0-9]{64}$/);
var skillManifestSchema = z5.object({
  id: skillId,
  version: z5.string().max(40).regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/),
  title: z5.string().min(1).max(100),
  description: z5.string().min(1).max(500),
  category: z5.enum(["writing", "visual", "workflow", "personal"]),
  host: z5.string().max(60).refine((value) => INSTRUCTION_HOSTS.includes(value), "Unsupported instruction Host."),
  license: z5.literal("MIT"),
  source: z5.enum(["bundled", "personal"]),
  digest: digestSchema,
  // This release deliberately accepts standalone instruction documents only.
  // Empty declarations are package capabilities, not model execution permissions.
  dependencies: z5.array(z5.never()).max(0),
  permissions: z5.array(z5.never()).max(0)
}).strict();
var skillPackageSchema = z5.object({ manifest: skillManifestSchema, content: z5.string().min(20).max(65536) }).strict();
var marketItemSchema = z5.object({
  manifest: skillManifestSchema,
  installedVersion: z5.string(),
  installedDigest: z5.string(),
  enabled: z5.boolean(),
  pendingVersion: z5.string(),
  pendingDigest: z5.string(),
  pendingMode: z5.enum(["", "manual", "automatic"]),
  pendingRevision: z5.string().regex(/^(?:[a-f0-9]{40})?$/),
  automaticPaused: z5.boolean(),
  automaticFollowing: z5.boolean(),
  updateAvailable: z5.boolean()
}).strict();
var skillAutoPolicySchema = z5.object({ source: z5.literal("https://github.com/T8mars/Deepseek-Harness-Zhenzhen"), enabled: z5.boolean(), pendingAutomatic: z5.number().int().min(0).max(1e4) }).strict();
var skillFeedSnapshotSchema = z5.object({
  source: z5.literal("https://github.com/T8mars/Deepseek-Harness-Zhenzhen"),
  automatic: z5.boolean(),
  checkedAt: z5.union([z5.literal(""), z5.iso.datetime()]),
  revision: z5.string().regex(/^(?:[a-f0-9]{40})?$/),
  state: z5.enum(["idle", "checked", "error"]),
  count: z5.number().int().min(0).max(100),
  message: z5.string().max(300)
}).strict();

// packages/dsh-zhen/src/canvas-contract.ts
import { z as z6 } from "zod";
var canvasEntity = z6.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
var canvasInstance = z6.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
var version = z6.string().max(60).regex(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
var digest = z6.string().regex(/^[a-f0-9]{64}$/);
var toolName = z6.string().regex(/^zcanvas_[a-z][a-z0-9_]{2,127}$/);
var canvasDirectOperation = z6.enum(["plan", "preview", "inspect", "verify"]);
var previewScopes = /* @__PURE__ */ new Set(["canvas:read", "asset:read", "asset:transfer", "run:read", "browser:handoff"]);
var canvasPreviewScopes = z6.array(z6.string().refine((value) => previewScopes.has(value))).min(1).max(5).refine((value) => new Set(value).size === value.length);
var forbidden = /* @__PURE__ */ new Set(["handler", "service", "method", "route", "endpoint", "baseurl", "targeturl", "url", "headers", "authorization", "credential", "credentials", "cookie", "cookies", "token", "accesstoken", "refreshtoken", "apikey", "secret", "providerpayload", "providerrequest", "requestinit", "rawbody", "sql", "database", "db", "dom", "selector", "reactflow", "zustand", "sourcecode", "sourcefile", "sourcepath", "command", "shell", "argv", "process", "childprocess", "patch", "canvaspatch", "operations", "nodes", "edges", "path", "prototype", "proto", "constructor"]);
function boundedCanvasInput(value, highLevel = true) {
  let entries = 0;
  const visit = (item, depth) => {
    if (depth > 12) return false;
    if (item === null || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item === "string") return new TextEncoder().encode(item).length <= 48 * 1024;
    if (!item || typeof item !== "object") return false;
    if (Array.isArray(item)) {
      entries += item.length;
      return entries <= 2048 && item.every((value2) => visit(value2, depth + 1));
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) return false;
    const pairs = Object.entries(item);
    entries += pairs.length;
    return entries <= 2048 && pairs.every(([key, value2]) => key.length <= 128 && !(highLevel && forbidden.has(key.replace(/[^A-Za-z0-9]/g, "").toLowerCase())) && visit(value2, depth + 1));
  };
  try {
    return !!value && !Array.isArray(value) && typeof value === "object" && visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= 64 * 1024;
  } catch {
    return false;
  }
}
var canvasPlanRequest = z6.object({
  tool: toolName,
  version,
  operation: canvasDirectOperation,
  projectId: canvasEntity,
  canvasId: canvasEntity,
  clientRequestId: canvasEntity.optional(),
  input: z6.record(z6.string(), z6.unknown()).refine((value) => boundedCanvasInput(value), "Only bounded high-level creative input is supported.")
}).strict();
var canvasInspectionRequest = z6.object({
  tool: z6.enum(["inspectCanvas", "inspectNodeSchema", "inspectRun", "searchAssets", "searchSubflows", "validateCanvas", "simulateExecutionPlan", "estimateRun"]),
  projectId: canvasEntity.max(160),
  canvasId: canvasEntity.max(160),
  requestId: canvasEntity.max(160).optional(),
  input: z6.record(z6.string(), z6.unknown()).refine((value) => boundedCanvasInput(value, false), "Inspection input exceeded supported JSON limits.")
}).strict();
var canvasInspectionResultSchema = z6.object({
  schema: z6.literal("t8-canvas-agent-tool-result-v1"),
  tool: canvasInspectionRequest.shape.tool,
  requestId: canvasEntity.max(160),
  projectId: canvasEntity.max(160),
  canvasId: canvasEntity.max(160),
  canvasRevision: z6.number().int().positive(),
  actorId: z6.string().max(256),
  role: z6.string().max(80),
  authority: z6.unknown(),
  nodeSchemaDigest: digest,
  readOnly: z6.literal(true),
  truncated: z6.boolean(),
  data: z6.unknown(),
  digest
});
var policy = z6.object({ operation: z6.string().min(1).max(80), riskLevel: z6.enum(["L0", "L1", "L2", "L3"]), approvalRequired: z6.boolean(), boundary: z6.string().max(100), requiredScopes: z6.array(z6.string().max(80)).max(16) });
var publicTool = z6.object({
  name: toolName,
  version,
  capabilityId: z6.string().min(1).max(150),
  creatorLabel: z6.string().max(240),
  category: z6.string().max(100),
  requestSchema: z6.literal("t8-versioned-creative-tool-request-v1"),
  resultSchema: z6.literal("t8-versioned-creative-tool-result-v1"),
  defaultOperation: canvasDirectOperation,
  directOperations: z6.array(canvasDirectOperation).min(1).max(4),
  operations: z6.array(policy).min(1).max(16)
}).strict();
var canvasToolCatalogSchema = z6.object({
  schema: z6.literal("t8-versioned-creative-tool-catalog-v1"),
  protocol: z6.literal("t8-versioned-creative-tool-v1"),
  capabilityManifestVersion: version,
  capabilityManifestDigest: digest,
  capabilityGraphDigest: digest,
  tools: z6.array(publicTool).min(1).max(256)
}).strict().superRefine((value, context) => {
  if (new Set(value.tools.map((tool) => tool.name)).size !== value.tools.length || value.tools.some((tool) => tool.version !== value.capabilityManifestVersion || !tool.directOperations.includes(tool.defaultOperation) || new Set(tool.directOperations).size !== tool.directOperations.length || new Set(tool.operations.map((operation) => operation.operation)).size !== tool.operations.length || tool.directOperations.some((operation) => !tool.operations.some((policy2) => policy2.operation === operation && policy2.riskLevel === "L0" && policy2.approvalRequired === false && policy2.boundary === "local-read" && canvasPreviewScopes.safeParse(policy2.requiredScopes).success)))) context.addIssue({ code: "custom", message: "Canvas direct-operation boundary changed." });
});
var canvasPlanResultSchema = z6.object({
  schema: z6.literal("t8-versioned-creative-tool-result-v1"),
  tool: z6.object({ name: toolName, version, capabilityId: z6.string(), operation: canvasDirectOperation, requestAction: z6.string() }),
  contract: z6.object({
    protocol: z6.literal("t8-versioned-creative-tool-v1"),
    capabilityManifestDigest: digest,
    capabilityGraphDigest: digest,
    riskLevel: z6.literal("L0"),
    approvalRequired: z6.literal(false),
    requiredScopes: canvasPreviewScopes
  }),
  request: z6.object({ clientRequestId: canvasEntity.nullable(), projectId: canvasEntity, canvasId: canvasEntity }),
  readOnly: z6.literal(true),
  directInternalAccess: z6.literal(false),
  sideEffects: z6.object({ canvasWrites: z6.literal(0), providerCalls: z6.literal(0), fileWrites: z6.literal(0) }),
  data: z6.unknown()
});

// packages/dsh-zhen/src/canvas-discovery-schema.ts
import { z as z7 } from "zod";
var canvasInstallCandidateSchema = z7.object({
  root: z7.string().min(1).max(4096),
  digest: z7.string().regex(/^[a-f0-9]{64}$/),
  cliVersion: z7.string().min(1).max(64),
  skillVersion: z7.string().min(1).max(64),
  nodeSchemaDigest: z7.string().regex(/^[a-f0-9]{64}$/),
  providerCatalogDigest: z7.string().regex(/^[a-f0-9]{64}$/)
}).strict();
var canvasDiscoverySchema = z7.object({ candidates: z7.array(canvasInstallCandidateSchema).max(8), issues: z7.array(z7.string().max(200)).max(8) }).strict();

// packages/dsh-zhen/src/canvas-setup-schema.ts
import { z as z8 } from "zod";
var canvasSetupDiscoverySchema = z8.object({
  candidates: z8.array(canvasInstallCandidateSchema.extend({ source: z8.enum(["running-desktop", "managed"]) }).strict()).max(8),
  issues: z8.array(z8.string().max(200)).max(8)
}).strict();
var canvasConnectionCheckSchema = z8.object({
  binding: z8.object({ root: z8.string().min(1).max(4096), digest: z8.string().regex(/^[a-f0-9]{64}$/), instance: z8.string().regex(/^[A-Za-z0-9._-]{0,128}$/) }).strict().nullable(),
  state: z8.enum(["not-configured", "not-running", "choose-instance", "needs-review", "incompatible", "ready", "error"]),
  code: z8.string().regex(/^[A-Z][A-Z0-9_]{0,80}$/),
  message: z8.string().max(400),
  instances: z8.array(z8.object({ id: z8.string().regex(/^[A-Za-z0-9._-]{1,128}$/), version: z8.string().max(64), port: z8.number().int().min(1).max(65535) }).strict()).max(16)
}).strict();

// packages/dsh-zhen/src/canvas-pairing-schema.ts
import { z as z9 } from "zod";
var canvasPairingSchema = z9.object({
  state: z9.enum(["none", "pending", "paired", "expired", "denied"]),
  userCode: z9.string().regex(/^(?:|[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8})$/),
  expiresAt: z9.string().max(64),
  scopes: z9.array(z9.enum(["canvas:read", "run:read", "asset:read", "asset:transfer", "browser:handoff", "canvas:write", "run:execute"])).max(7),
  message: z9.string().max(300)
}).strict();

// packages/dsh-zhen/src/canvas-workflow-schema.ts
import { z as z11 } from "zod";

// packages/dsh-zhen/src/canvas-reference-schema.ts
import { z as z10 } from "zod";
var canvasReferenceKind = z10.enum(["image", "video", "audio"]);
var canvasReferenceKey = z10.object({ assetId: canvasEntity.max(160), contentRevision: z10.number().int().positive().max(Number.MAX_SAFE_INTEGER), contentHash: z10.string().regex(/^[a-f0-9]{64}$/) }).strict();
var canvasReferenceKeys = z10.array(canvasReferenceKey).max(16).refine((items) => new Set(items.map((item) => item.assetId)).size === items.length, "\u5F53\u524D\u539F\u751F\u89C4\u5212\u63A5\u53E3\u4E0D\u652F\u6301\u91CD\u590D\u7D20\u6750\u63D2\u69FD\uFF0C\u8BF7\u4F7F\u7528\u4E0D\u540C\u7D20\u6750\uFF1B\u4E0D\u4F1A\u9759\u9ED8\u53BB\u91CD\u3002");
var canvasAssetSchema = z10.object({ id: canvasEntity.max(160), projectId: canvasEntity, name: z10.string().min(1).max(240), kind: canvasReferenceKind, contentRevision: z10.number().int().positive().max(Number.MAX_SAFE_INTEGER), contentHash: z10.string().regex(/^[a-f0-9]{64}$/).nullable(), mimeType: z10.string().max(120), size: z10.number().int().min(0).max(Number.MAX_SAFE_INTEGER), width: z10.number().int().min(0).max(Number.MAX_SAFE_INTEGER), height: z10.number().int().min(0).max(Number.MAX_SAFE_INTEGER), duration: z10.number().finite().min(0).max(86400), selectable: z10.boolean() }).strict();
var canvasAssetsQuery = z10.object({ projectId: canvasEntity, canvasId: canvasEntity, kind: canvasReferenceKind, query: z10.string().trim().max(200).optional(), offset: z10.number().int().min(0).max(1e6).optional() }).strict();
var canvasAssetsSchema = z10.object({ projectId: canvasEntity, canvasId: canvasEntity, canvasRevision: z10.number().int().positive(), catalogRevision: z10.number().int().min(0).max(Number.MAX_SAFE_INTEGER), kind: canvasReferenceKind, query: z10.string().max(200), offset: z10.number().int().min(0).max(1e6), limit: z10.literal(25), total: z10.number().int().min(0).max(1e6), nextOffset: z10.number().int().min(0).max(1e6).nullable(), items: z10.array(canvasAssetSchema).max(25) }).strict();

// packages/dsh-zhen/src/canvas-workflow-schema.ts
var canvasModelKind = z11.enum(["llm", "image", "video", "audio"]);
var canvasModelChoice = z11.object({ provider: z11.string().min(1).max(160), model: z11.string().min(1).max(240) }).strict();
var canvasModelChoices = z11.object({ llm: canvasModelChoice.optional(), image: canvasModelChoice.optional(), video: canvasModelChoice.optional(), audio: canvasModelChoice.optional() }).strict();
var canvasWorkflowInput = z11.object({
  projectId: canvasEntity,
  canvasId: canvasEntity,
  kind: z11.enum(["image", "edit-image", "video", "edit-video", "audio", "script", "story"]),
  prompt: z11.string().trim().min(1).max(12e3),
  references: canvasReferenceKeys.optional(),
  modelChoices: canvasModelChoices.optional(),
  profile: z11.enum(["economy", "balanced", "quality"]).optional(),
  candidates: z11.number().int().min(1).max(8).optional(),
  ratio: z11.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).optional(),
  duration: z11.number().int().min(1).max(86400).optional()
}).strict().superRefine((value, ctx) => {
  if (["edit-image", "edit-video"].includes(value.kind) && !value.references?.length) ctx.addIssue({ code: "custom", message: "\u7F16\u8F91\u65B9\u6848\u9700\u8981\u660E\u786E\u9009\u62E9\u53C2\u8003\u7D20\u6750\u3002" });
  if (value.references?.length && !["image", "edit-image", "edit-video", "audio"].includes(value.kind)) ctx.addIssue({ code: "custom", message: "\u6B64\u521B\u4F5C\u5165\u53E3\u5C1A\u672A\u7ED1\u5B9A\u53C2\u8003\u7D20\u6750\uFF1B\u89C6\u9891\u53C2\u8003\u8BF7\u4F7F\u7528\u89C6\u9891\u7F16\u8F91/\u53C2\u8003\u3002" });
  const primary = value.kind === "script" ? "llm" : value.kind === "edit-image" ? "image" : value.kind === "edit-video" ? "video" : value.kind;
  const supported = value.kind === "story" ? ["llm", "image", "video", "audio"] : primary === "llm" ? ["llm"] : ["llm", primary];
  if (Object.entries(value.modelChoices ?? {}).some(([kind, choice]) => choice !== void 0 && !supported.includes(kind))) ctx.addIssue({ code: "custom", message: "\u6A21\u578B\u7C7B\u578B\u4E0E\u672C\u6B21\u521B\u4F5C\u4E0D\u4E00\u81F4\u3002" });
  if (value.ratio !== void 0 && !["image", "edit-image", "video", "edit-video", "story"].includes(value.kind) || value.duration !== void 0 && !["video", "edit-video", "story"].includes(value.kind)) ctx.addIssue({ code: "custom", message: "\u8F93\u51FA\u53C2\u6570\u4E0E\u672C\u6B21\u521B\u4F5C\u4E0D\u4E00\u81F4\u3002" });
});
var canvasModelsQuery = z11.object({ projectId: canvasEntity, canvasId: canvasEntity, kind: canvasModelKind, query: z11.string().trim().max(200).optional() }).strict();
var canvasModelsSchema = z11.object({ projectId: canvasEntity, canvasId: canvasEntity, kind: canvasModelKind, query: z11.string().max(200), total: z11.number().int().min(0).max(1e5), truncated: z11.boolean(), items: z11.array(z11.object({ id: z11.string().min(1).max(512), kind: canvasModelKind, provider: z11.string().min(1).max(160), model: z11.string().min(1).max(240), executable: z11.boolean(), credentialReady: z11.boolean(), requiresRuntimeCheck: z11.boolean() }).strict()).max(500) }).strict();
var canvasWorkspacesSchema = z11.object({ canvases: z11.array(z11.object({ id: canvasEntity, projectId: canvasEntity, name: z11.string().max(240), revision: z11.number().int().positive() }).strict()).max(500), total: z11.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(), truncated: z11.boolean().optional() }).strict().superRefine((value, context) => {
  const keys = value.canvases.map((item) => JSON.stringify([item.projectId, item.id]));
  if (new Set(keys).size !== keys.length || value.total !== void 0 && value.total < value.canvases.length) context.addIssue({ code: "custom", message: "Canvas workspace identities or count are inconsistent." });
});
var canvasWorkflowSchema = z11.object({ id: z11.uuid(), projectId: canvasEntity, canvasId: canvasEntity, planId: canvasEntity, planDigest: z11.string().regex(/^[a-f0-9]{64}$/), action: z11.string().max(100), goal: z11.string().min(1).max(65536), canvasRevision: z11.number().int().positive(), ready: z11.boolean(), candidates: z11.number().int().min(0).max(8), operationCount: z11.number().int().min(0).max(1e4), models: z11.array(z11.string().max(500)).max(16), questions: z11.array(z11.string().max(2e3)).max(32), expiresAt: z11.iso.datetime(), phase: z11.enum(["preview", "requesting", "pending", "applying", "applied", "denied", "unknown", "expired"]), approvalRequestId: z11.string().max(256), patchId: z11.string().max(256), revision: z11.number().int().positive().nullable(), output: z11.object({ profile: z11.string().max(40), ratio: z11.string().max(40), durationSeconds: z11.number().int().min(0).max(86400) }).strict().optional(), references: z11.array(canvasAssetSchema).max(16).optional() }).strict();

// packages/dsh-zhen/src/canvas-inbox-schema.ts
import { z as z12 } from "zod";
var canvasCandidateSchema = z12.object({ id: z12.uuid(), sourceSessionId: z12.string().min(1).max(256), sourceCallId: z12.string().min(1).max(256), receivedAt: z12.iso.datetime(), tool: z12.string().max(128), preview: canvasWorkflowSchema }).strict();
var canvasCandidatesSchema = z12.array(canvasCandidateSchema).max(16);

// packages/dsh-zhen/src/canvas-run-schema.ts
import { z as z13 } from "zod";
var canvasRunSelection = z13.object({ projectId: canvasEntity.max(160), canvasId: canvasEntity.max(160), canvasRevision: z13.number().int().positive(), nodeIds: z13.array(canvasEntity.max(160)).min(1).max(500).refine((ids) => new Set(ids).size === ids.length) }).strict();
var canvasRunNodesSchema = z13.object({ projectId: canvasEntity, canvasId: canvasEntity, revision: z13.number().int().positive(), nodes: z13.array(z13.object({ id: canvasEntity, type: canvasEntity, label: z13.string().max(240), executable: z13.boolean() }).strict()).max(100), nextOffset: z13.number().int().nonnegative(), hasMore: z13.boolean() }).strict();
var canvasRunDeclaration = z13.object({ provider: z13.string().min(1).max(240), model: z13.string().min(1).max(240), nodeIds: z13.array(canvasEntity).min(1).max(500) }).strict();
var canvasRunIntentSchema = z13.object({ id: canvasEntity, operationId: z13.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/), projectId: canvasEntity, canvasId: canvasEntity, canvasRevision: z13.number().int().positive(), nodeIds: z13.array(canvasEntity).min(1).max(500), requestedBy: z13.string().min(1).max(256), status: z13.string().min(1).max(80), runId: canvasEntity.nullable(), queueRevision: z13.number().int().positive() }).strict();
var canvasRunViewSchema = z13.object({ quoteId: z13.uuid(), planDigest: z13.string().regex(/^[a-f0-9]{64}$/), projectId: canvasEntity, canvasId: canvasEntity, canvasRevision: z13.number().int().positive(), requestedNodeIds: z13.array(canvasEntity).min(1).max(500), authorizedNodeIds: z13.array(canvasEntity).min(1).max(500), declarations: z13.array(canvasRunDeclaration).min(1).max(500), mode: z13.string().max(80), expiresAt: z13.iso.datetime(), priceKnown: z13.literal(false), estimatedCost: z13.null(), phase: z13.enum(["preview", "requesting", "pending", "submitting", "tracking", "denied", "unknown", "expired"]), submissionAttempted: z13.boolean(), approvalRequestId: z13.string().max(256), intent: canvasRunIntentSchema.nullable() }).strict();

// packages/dsh-zhen/src/canvas-task-schema.ts
import { z as z14 } from "zod";
var canvasTaskScope = z14.object({ projectId: canvasEntity.max(160), canvasId: canvasEntity.max(160) }).strict();
var canvasTaskReference = canvasTaskScope.extend({ id: canvasEntity.max(128) }).strict();
var canvasTaskStatus = z14.enum(["pending", "accepted", "dispatching", "running", "completed", "failed", "cancelled", "unknown"]);
var timestamp = z14.number().int().nonnegative().max(864e13);
var canvasTaskSummary = canvasTaskReference.extend({ canvasRevision: z14.number().int().positive(), nodeCount: z14.number().int().min(1).max(500), provider: z14.string().max(240).nullable(), model: z14.string().max(240).nullable(), status: canvasTaskStatus, runId: canvasEntity.nullable(), queueRevision: z14.number().int().positive(), createdAt: timestamp, updatedAt: timestamp }).strict();
var canvasTaskListSchema = canvasTaskScope.extend({ items: z14.array(canvasTaskSummary).max(100), limit: z14.literal(100), atLimit: z14.boolean() }).strict();
var canvasEvidenceReason = z14.enum(["run-incomplete", "run-missing", "scope-mismatch", "node-incomplete", "attempt-incomplete", "asset-missing", "asset-unverified", "native-unverified", "inconsistent-evidence"]);
var count = z14.number().int().nonnegative().max(5e3);
var canvasTaskDetailSchema = canvasTaskSummary.extend({ evidence: z14.object({ verdict: z14.enum(["not-completed", "unverified", "verified"]), runPresent: z14.boolean(), nodeRecords: count, successfulNodes: count, successfulAttempts: count, assetRecords: count, storedAssets: count, hashVerifiedAssets: count, magicVerifiedAssets: count, associatedAssets: count, reasons: z14.array(canvasEvidenceReason).max(9) }).strict() }).strict();

// packages/dsh-zhen/src/default-art-schema.ts
import { z as z15 } from "zod";
var DEFAULT_ART_CHUNK_BYTES = 45 * 1024;
var defaultArtDigest = z15.string().regex(/^[a-f0-9]{64}$/);
var defaultArtSlot = z15.enum(["portrait", "portrait-dark", "mark", "mark-dark", "hero-mark", "hero-mark-dark"]);
var defaultArtAsset = z15.object({ slot: defaultArtSlot, sha256: defaultArtDigest, name: z15.string().min(1).max(200), size: z15.number().int().min(24).max(2 * 1024 * 1024), type: z15.enum(["image/png", "image/jpeg", "image/webp"]), width: z15.number().int().min(1).max(4096), height: z15.number().int().min(1).max(4096) }).strict();
var pack = z15.object({ protocol: z15.literal("dsh-zhen-default-art-v1"), chunkBytes: z15.number().int().min(16 * 1024).max(DEFAULT_ART_CHUNK_BYTES), id: z15.string().min(1).max(100), name: z15.string().min(1).max(100), digest: defaultArtDigest, focus: z15.object({ x: z15.number().min(0).max(1), y: z15.number().min(0).max(1), scale: z15.number().min(0.5).max(1.5) }).strict(), credit: z15.object({ artist: z15.string().max(200), source: z15.string().max(500), url: z15.string().max(1e3), license: z15.string().max(4e3), notice: z15.string().max(16e3) }).strict(), assets: z15.array(defaultArtAsset).min(1).max(6) }).strict();
var defaultArtInfoSchema = z15.discriminatedUnion("state", [z15.object({ state: z15.literal("ready"), code: z15.literal("OK"), pack }).strict(), z15.object({ state: z15.literal("none"), code: z15.literal("ART_NOT_CONFIGURED"), pack: z15.null() }).strict(), z15.object({ state: z15.literal("unavailable"), code: z15.literal("ART_SOURCE_UNAVAILABLE"), pack: z15.null() }).strict()]);
var defaultArtChunkRequest = z15.object({ digest: defaultArtDigest, sha256: defaultArtDigest, offset: z15.number().int().nonnegative().max(2 * 1024 * 1024) }).strict();
var defaultArtChunkSchema = z15.object({ digest: defaultArtDigest, sha256: defaultArtDigest, offset: z15.number().int().nonnegative(), nextOffset: z15.number().int().positive().max(2 * 1024 * 1024), size: z15.number().int().min(24).max(2 * 1024 * 1024), base64: z15.string().min(4).max(DEFAULT_ART_CHUNK_BYTES / 3 * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), eof: z15.boolean() }).strict();

// packages/dsh-zhen/src/canvas-transfer-schema.ts
import { z as z16 } from "zod";
var digest2 = z16.string().regex(/^[a-f0-9]{64}$/);
var canvasTransferInput = z16.object({ receiptId: z16.uuid(), projectId: canvasEntity.max(160), canvasId: canvasEntity.max(160) }).strict();
var transferFileSchema = z16.object({ name: z16.string().min(1).max(240), size: z16.number().int().positive().max(2 * 1024 ** 3), sha256: digest2, mime: z16.string().min(1).max(100) }).strict();
var transferAssetSchema = z16.object({ id: canvasEntity, projectId: canvasEntity, contentHash: digest2, kind: z16.enum(["image", "video", "audio", "text", "model3d"]), mime: z16.string().min(1).max(100), size: z16.number().int().positive().max(2 * 1024 ** 3) }).strict();
var position = z16.object({ x: z16.number().finite().min(-1e6).max(1e6), y: z16.number().finite().min(-1e6).max(1e6) }).strict();
var transferPlacementSchema = z16.object({ nodeId: canvasEntity, patchId: canvasEntity, previewDigest: digest2, baseRevision: z16.number().int().positive(), position }).strict();
var canvasTransferViewSchema = canvasTransferInput.extend({ id: z16.uuid(), canvasRevision: z16.number().int().positive(), file: transferFileSchema, maxImportBytes: z16.number().int().positive().max(2 * 1024 ** 3), stage: z16.enum(["import", "place"]), phase: z16.enum(["preview", "requesting", "pending", "submitting", "available", "applied", "denied", "unknown", "expired", "reverted"]), asset: transferAssetSchema.nullable(), assetSource: z16.enum(["none", "import-response", "catalog-match"]), placement: transferPlacementSchema.nullable(), approvalRequestId: z16.string().max(100), expiresAt: z16.iso.datetime(), submissionAttempted: z16.boolean(), appliedRevision: z16.number().int().positive().nullable() }).strict();

// packages/dsh-zhen/src/update-schema.ts
import { z as z17 } from "zod";
var updateSourceSchema = z17.object({ id: z17.enum(["dsh", "canvas", "zhen", "gateway"]), title: z17.string(), current: z17.string(), available: z17.string(), revision: z17.string(), url: z17.string(), changed: z17.boolean(), state: z17.enum(["checked", "unpublished", "error"]), message: z17.string() }).strict();
var updateReportSchema = z17.object({ checkedAt: z17.string(), automatic: z17.boolean(), sources: z17.array(updateSourceSchema) }).strict();

// packages/dsh-zhen/src/mcp-market-schema.ts
import { z as z18 } from "zod";
var mcpId = z18.enum(["memory", "filesystem"]);
var version2 = z18.string().max(60).regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
var sha = z18.string().regex(/^[a-f0-9]{64}$/);
var mcpReleaseSchema = z18.object({
  id: mcpId,
  version: version2,
  integrity: z18.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/),
  gitHead: z18.string().regex(/^[a-f0-9]{40}$/),
  node: z18.string().max(200),
  license: z18.string().max(200),
  checkedAt: z18.iso.datetime()
}).strict();
var mcpInstallationSchema = z18.object({ release: mcpReleaseSchema, digest: sha, packages: z18.number().int().min(1).max(1e3), installedAt: z18.iso.datetime() }).strict();
var mcpArchiveSchema = z18.object({ archiveId: z18.uuid(), installation: mcpInstallationSchema, retainedAt: z18.iso.datetime(), programRetained: z18.boolean(), verified: z18.boolean() }).strict();
var mcpSelectionSchema = z18.object({ id: mcpId, active: version2, pending: z18.union([version2, z18.literal("")]), enabled: z18.boolean(), workspace: z18.string().max(4096), epoch: z18.number().int().positive() }).strict();
var mcpMarketSnapshotSchema = z18.object({
  schemaVersion: z18.literal(2).default(2),
  archives: z18.array(mcpArchiveSchema).max(100).default([]),
  automatic: z18.boolean(),
  checkedAt: z18.string().max(40),
  message: z18.string().max(300),
  nextEpoch: z18.number().int().positive().default(1),
  candidates: z18.array(mcpReleaseSchema).max(2),
  installations: z18.array(mcpInstallationSchema).max(100),
  selections: z18.array(mcpSelectionSchema).max(2)
}).strict().superRefine((value, context) => {
  if (new Set(value.archives.map((item) => item.archiveId)).size !== value.archives.length || new Set(value.candidates.map((item) => item.id)).size !== value.candidates.length || new Set(value.selections.map((item) => item.id)).size !== value.selections.length || new Set(value.installations.map((item) => `${item.release.id}@${item.release.version}`)).size !== value.installations.length || value.selections.some((item) => item.epoch >= value.nextEpoch)) context.addIssue({ code: "custom", message: "Invalid MCP version or grant identity." });
});
var mcpMarketViewSchema = z18.object({ snapshot: mcpMarketSnapshotSchema, node: z18.string().max(40), incompatible: z18.array(z18.string().max(100)).max(100), recipes: z18.array(z18.object({
  id: mcpId,
  title: z18.string(),
  package: z18.string(),
  version: version2,
  integrity: z18.string(),
  gitHead: z18.string(),
  node: z18.string(),
  license: z18.string(),
  description: z18.string(),
  access: z18.string(),
  runtime: z18.enum(["idle", "ready", "draining", "error", "unavailable"]),
  maintenance: z18.boolean().default(false)
}).strict()).max(2) }).strict();

// packages/dsh-zhen/src/capability-schema.ts
import { z as z19 } from "zod";
var capabilityFamilySchema = z19.enum(["chat", "video", "image", "enhance", "motion", "audio", "suno", "flowmusic", "midjourney", "minimax-v2", "transcription", "three-d", "decisions", "upload", "wallet", "registries", "queries"]);
var capabilityItemSchema = z19.object({
  key: z19.string().max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]+$/),
  family: capabilityFamilySchema,
  kind: z19.enum(["model", "action", "operation"]),
  model: z19.string().max(120),
  action: z19.string().max(80),
  title: z19.string().max(160),
  line: z19.number().int().min(0),
  section: z19.string().max(200),
  protocol: z19.enum(["chat-completions", "video-task", "legacy-video-task", "image-task", "audio-task", "minimax-v2", "music-actions", "midjourney-actions", "transcription", "three-d-task", "decisions", "upload", "wallet", "registries", "task-queries"]),
  readiness: z19.enum(["configured", "observed", "fixture-tested", "real-read-tested"]),
  required: z19.array(z19.string().max(80)).max(50),
  versions: z19.array(z19.string().max(50)).max(40),
  sync: z19.boolean(),
  billingSku: z19.string().max(120).optional(),
  upstreamModel: z19.string().max(80).optional(),
  referenceType: z19.string().max(80).optional(),
  requiresVersion: z19.boolean().optional(),
  requiresIndex: z19.boolean().optional()
}).strict();
var capabilityCatalogSchema = z19.object({
  schemaVersion: z19.literal(1),
  observedAt: z19.iso.datetime(),
  scope: z19.literal("documented-model-list-and-named-protocols-with-public-action-registries"),
  sources: z19.array(z19.object({ id: z19.enum(["docs", "music", "midjourney"]), url: z19.enum(["https://api.seedance.nz/docs/llms.txt", "https://api.seedance.nz/api/music/actions", "https://api.seedance.nz/api/midjourney/actions"]), sha256: z19.string().regex(/^[a-f0-9]{64}$/) }).strict()).length(3),
  families: z19.array(z19.object({ id: capabilityFamilySchema, title: z19.string().max(100), owner: z19.enum(["dsh", "canvas", "host"]) }).strict()).length(17),
  items: z19.array(capabilityItemSchema).max(1e3)
}).strict().superRefine((value, context) => {
  if (new Set(value.items.map((item) => item.key)).size !== value.items.length || new Set(value.families.map((item) => item.id)).size !== 17 || new Set(value.sources.map((item) => item.id)).size !== 3) context.addIssue({ code: "custom", message: "Duplicate catalog identity." });
  const urls = { docs: "https://api.seedance.nz/docs/llms.txt", music: "https://api.seedance.nz/api/music/actions", midjourney: "https://api.seedance.nz/api/midjourney/actions" };
  if (value.sources.some((source) => source.url !== urls[source.id])) context.addIssue({ code: "custom", message: "Source identity differs from its fixed URL." });
});
var capabilityPageSchema = z19.object({ revision: z19.string(), total: z19.number().int(), offset: z19.number().int(), nextOffset: z19.number().int().nullable(), items: z19.array(capabilityItemSchema).max(30) }).strict();
var capabilityCheckSchema = z19.object({ checkedAt: z19.string().max(40), automatic: z19.boolean(), sources: z19.array(z19.object({
  id: z19.enum(["docs", "music", "midjourney"]),
  sha256: z19.string().max(64),
  changed: z19.boolean(),
  state: z19.enum(["checked", "unavailable"]),
  added: z19.array(z19.string().max(160)).max(200),
  removed: z19.array(z19.string().max(160)).max(200),
  modified: z19.array(z19.string().max(160)).max(200)
}).strict()).max(3) }).strict();

// packages/dsh-zhen/src/gateway-check-schema.ts
import { z as z20 } from "zod";
var GATEWAY_CHECK_POLICY = "flash-32-v1";
var GATEWAY_CHECK_MODEL = "deepseek/deepseek-v4.1-flash";
var GATEWAY_CHECK_PROMPT = "DSH-zhen connectivity check. Reply only OK.";
var gatewayCheckCodeSchema = z20.enum(["", "AUTH", "MISSING_CREDENTIAL", "RATE_LIMIT", "TIMEOUT", "SERVER", "PI_AI_ERROR", "NO_ADAPTER", "CANCELLED", "INCOMPLETE", "RESPONSE_LIMIT", "UNAVAILABLE"]);
var gatewayCheckReceiptSchema = z20.object({
  id: z20.uuid(),
  policy: z20.literal(GATEWAY_CHECK_POLICY),
  provider: z20.literal("seedance"),
  model: z20.literal(GATEWAY_CHECK_MODEL),
  maxTokens: z20.literal(32),
  createdAt: z20.iso.datetime(),
  expiresAt: z20.iso.datetime(),
  finishedAt: z20.string(),
  state: z20.enum(["preview", "running", "passed", "incomplete", "failed", "cancelled", "expired", "untracked"]),
  code: gatewayCheckCodeSchema,
  textDeltas: z20.number().int().min(0).max(2048),
  inputTokens: z20.number().int().nonnegative().nullable(),
  outputTokens: z20.number().int().nonnegative().nullable()
}).strict();
var gatewayCheckPreviewSchema = z20.object({ receipt: gatewayCheckReceiptSchema, prompt: z20.literal(GATEWAY_CHECK_PROMPT) }).strict();

// packages/dsh-zhen/src/local-skills-schema.ts
import { z as z21 } from "zod";
var LOCAL_SKILL_POLICY = "local-directory-v1";
var localSkillMode = z21.enum(["skill", "library"]);
var localSkillEntrySchema = z21.object({
  directory: z21.string().max(200),
  name: skillId,
  description: z21.string().min(1).max(1024),
  digest: digestSchema,
  bytes: z21.number().int().min(1).max(131072),
  modelInvocable: z21.boolean(),
  userInvocable: z21.boolean()
}).strict();
var localSkillDraftSchema = z21.object({
  root: z21.string().min(1).max(4096),
  mode: localSkillMode,
  identity: z21.string().max(100),
  digest: digestSchema,
  entries: z21.array(localSkillEntrySchema).max(128),
  skipped: z21.number().int().nonnegative(),
  problems: z21.number().int().nonnegative()
}).strict();
var localSkillRecordSchema = z21.object({
  id: z21.uuid(),
  root: z21.string().min(1).max(4096),
  mode: localSkillMode,
  identity: z21.string().min(1).max(100),
  enabled: z21.boolean(),
  confirmedAt: z21.iso.datetime(),
  policy: z21.literal(LOCAL_SKILL_POLICY)
}).strict();
var localSkillViewSchema = z21.object({
  source: localSkillRecordSchema,
  state: z21.enum(["ready", "disabled", "unavailable"]),
  entries: z21.array(localSkillEntrySchema.extend({ shadowed: z21.boolean() }).strict()).max(128),
  problems: z21.number().int().nonnegative(),
  skipped: z21.number().int().nonnegative()
}).strict();
var localSkillBodySchema = z21.object({ entry: localSkillEntrySchema, content: z21.string().max(131072), resourceRoot: z21.string().max(4096) }).strict();
var localSkillStateSchema = z21.object({ schemaVersion: z21.literal(1), sources: z21.array(localSkillRecordSchema).max(16) }).strict();

// packages/dsh-zhen/src/github-skills-schema.ts
import { z as z22 } from "zod";
var GITHUB_SKILL_POLICY = "github-resources-v1";
var githubSkillSpecSchema = z22.object({ repository: z22.string().max(250), reference: z22.string().max(200), path: z22.string().max(512), mode: localSkillMode }).strict();
var githubSkillFileSchema = z22.object({
  location: z22.enum(["package", "origin"]),
  path: z22.string().min(1).max(512),
  gitSha: z22.string().regex(/^[a-f0-9]{40}$/),
  sha256: digestSchema,
  bytes: z22.number().int().min(0).max(8 * 1024 * 1024),
  mode: z22.enum(["100644", "100755"])
}).strict();
var githubSkillReleaseSchema = z22.object({
  schemaVersion: z22.literal(1),
  spec: githubSkillSpecSchema,
  sourceId: digestSchema,
  revision: z22.string().regex(/^[a-f0-9]{40}$/),
  tree: z22.string().regex(/^[a-f0-9]{40}$/),
  license: z22.string().max(100),
  files: z22.array(githubSkillFileSchema).min(1).max(516),
  entries: z22.array(localSkillEntrySchema).min(1).max(128),
  problems: z22.number().int().nonnegative(),
  digest: digestSchema
}).strict();
var githubSkillSourceSchema = z22.object({
  id: digestSchema,
  spec: githubSkillSpecSchema,
  enabled: z22.boolean(),
  automatic: z22.boolean(),
  active: z22.string().regex(/^(?:[a-f0-9]{64})?$/),
  pending: z22.string().regex(/^(?:[a-f0-9]{64})?$/),
  latest: z22.string().regex(/^(?:[a-f0-9]{64})?$/),
  checkedAt: z22.union([z22.literal(""), z22.iso.datetime()]),
  state: z22.enum(["idle", "checked", "unavailable"]),
  policy: z22.literal(GITHUB_SKILL_POLICY)
}).strict();
var githubSkillStateSchema = z22.object({ schemaVersion: z22.literal(1), sources: z22.array(githubSkillSourceSchema).max(16) }).strict();
var githubSkillSourceViewSchema = githubSkillSourceSchema.extend({ running: z22.string().regex(/^(?:[a-f0-9]{64})?$/), skills: z22.array(localSkillEntrySchema).max(128) }).strict();
var githubSkillSummarySchema = githubSkillReleaseSchema.omit({ files: true, entries: true, problems: true }).extend({ bytes: z22.number().int().nonnegative(), fileCount: z22.number().int().nonnegative(), skillCount: z22.number().int().nonnegative() }).strict();
var githubSkillPreviewSchema = z22.object({
  release: githubSkillReleaseSchema,
  source: githubSkillSourceViewSchema.nullable(),
  comparisonAvailable: z22.boolean(),
  added: z22.array(z22.string()).max(516),
  removed: z22.array(z22.string()).max(516),
  changed: z22.array(z22.string()).max(516)
}).strict();
var githubSkillFilePreviewSchema = z22.object({
  path: z22.string().max(512),
  location: z22.enum(["package", "origin"]),
  sha256: digestSchema,
  bytes: z22.number().int().nonnegative(),
  encoding: z22.enum(["text", "opaque"]),
  content: z22.string().max(131072)
}).strict();

// packages/dsh-zhen/src/gateway-task-schema.ts
import { z as z23 } from "zod";
var gatewayTaskProtocolSchema = z23.enum(["video", "legacy-video", "image", "audio", "three-d", "music", "midjourney", "minimax-v2"]);
var gatewayTaskIdSchema = z23.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).refine((value) => !/^sk[-_]/i.test(value), "\u8BF7\u8F93\u5165\u4EFB\u52A1\u7F16\u53F7\uFF0C\u4E0D\u8981\u8F93\u5165 API \u4EE4\u724C\u3002");
var gatewayTaskSpecSchema = z23.object({ protocol: gatewayTaskProtocolSchema, taskId: gatewayTaskIdSchema }).strict();
var gatewayTaskCodeSchema = z23.enum(["", "AUTH", "NOT_FOUND", "MISSING_CREDENTIAL", "RATE_LIMIT", "SERVER", "NETWORK", "RESPONSE", "CANCELLED", "CONFIG_CHANGED", "UNAVAILABLE", "UNRECOGNIZED_STATUS", "BUSY"]);
var gatewayTaskObservationSchema = z23.object({
  status: z23.enum(["unknown", "queued", "running", "succeeded", "failed", "cancelled"]),
  progress: z23.number().finite().min(0).max(100).nullable(),
  resultCount: z23.number().int().min(0).max(100),
  usage: z23.object({ amount: z23.number().finite().nonnegative(), currency: z23.string().regex(/^[A-Z]{3,8}$/) }).strict().nullable()
}).strict();
var gatewayTaskRecordSchema = gatewayTaskObservationSchema.extend({
  id: z23.uuid(),
  protocol: gatewayTaskProtocolSchema,
  taskId: gatewayTaskIdSchema,
  createdAt: z23.iso.datetime(),
  checkedAt: z23.string().max(40),
  nextCheckAt: z23.string().max(40),
  tracking: z23.boolean(),
  querying: z23.boolean(),
  code: gatewayTaskCodeSchema,
  failures: z23.number().int().min(0).max(10)
}).strict();

// packages/dsh-zhen/src/gateway-media-schema.ts
import { z as z24 } from "zod";
var gatewayMediaTicketSchema = z24.object({ id: z24.uuid(), taskRecordId: z24.uuid(), ordinal: z24.number().int().min(1).max(100), sourceHost: z24.string().min(1).max(253), expiresAt: z24.iso.datetime() }).strict();
var gatewayMediaReceiptSchema = z24.object({ id: z24.uuid(), taskRecordId: z24.uuid(), ordinal: z24.number().int().min(1).max(100), path: z24.string().min(1).max(4096), bytes: z24.number().int().min(1).max(2 * 1024 * 1024 * 1024), sha256: z24.string().regex(/^[a-f0-9]{64}$/), mime: z24.string().max(100), savedAt: z24.iso.datetime(), recorded: z24.boolean() }).strict();

// packages/dsh-zhen/src/remote.ts
var statusSchema = z25.object({
  version: z25.string(),
  provider: z25.string(),
  model: z25.string(),
  credentialConfigured: z25.boolean(),
  credentialWritable: z25.boolean(),
  gatewayVerified: z25.boolean()
}).strict();
var walletSchema = z25.object({ amount: z25.number().finite(), usedAmount: z25.number().finite(), currency: z25.string().regex(/^[A-Z]{3,8}$/), checkedAt: z25.string() }).strict();
var collectionSchema = z25.object({ id: z25.string(), project: z25.string(), name: z25.string(), root: z25.string(), epoch: z25.number().int(), enabled: z25.boolean(), cloudProvider: z25.string(), agentEnabled: z25.boolean(), documents: z25.number().int() }).strict();
var hitSchema = z25.object({ id: z25.string(), collectionId: z25.string(), collectionName: z25.string(), path: z25.string(), line: z25.number().int(), page: z25.number().int().min(1).max(200).optional(), text: z25.string(), epoch: z25.number().int() }).strict();
var importSchema = z25.object({ indexed: z25.number().int(), skipped: z25.number().int(), failed: z25.number().int() }).strict();
var projectInput = z25.string().min(1).max(200);
var bindingSchema = z25.object({ project: z25.string(), root: z25.string(), epoch: z25.number().int() }).strict().nullable();
var canvasSchema = z25.object({ configured: z25.boolean(), root: z25.string(), digest: z25.string(), instance: z25.string().regex(/^[A-Za-z0-9._-]{0,128}$/).optional(), connected: z25.boolean(), code: z25.string(), message: z25.string(), compat: z25.unknown() }).strict();
var selectedVersion = z25.string().max(40).regex(/^(?:|(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/).default("");
function codec(name, schema) {
  return { mode: "strict", typeSymbol: `dsh-zhen#${name}`, create: () => schema };
}
function method(name, schema, description, inputs = []) {
  return {
    service: "zhen",
    description,
    invocation: { kind: "direct" },
    parameters: inputs.map(([name2, schema2]) => {
      const parameter = codec(`${name2}:value`, schema2);
      return { name: name2, source: "json", codec: parameter, strictCodec: parameter };
    }),
    result: codec(`${name}:result`, schema),
    sourceLocation: { file: "packages/dsh-zhen/src/remote.ts", line: 1, column: 1 }
  };
}
var TYPERT_REMOTE = createTypertRemoteInfo({ package: "dsh-zhen", methods: {
  "zhen/gatewayMediaPreview": method("gatewayMediaPreview", z25.array(gatewayMediaTicketSchema).max(100), "Prepare short-lived result references without returning signed URLs.", [["id", z25.uuid()]]),
  "zhen/gatewayMediaSave": method("gatewayMediaSave", gatewayMediaReceiptSchema, "Save one chosen task result into an existing local folder without overwriting files.", [["id", z25.uuid()], ["folder", z25.string().min(1).max(4096)]]),
  "zhen/gatewayMediaList": method("gatewayMediaList", z25.array(gatewayMediaReceiptSchema).max(100), "List local export receipts without media contents or URLs."),
  "zhen/gatewayMediaCancel": method("gatewayMediaCancel", z25.void(), "Stop an active media download; finished local files remain.", [["id", z25.uuid()]]),
  "zhen/gatewayMediaForget": method("gatewayMediaForget", z25.void(), "Forget only an export receipt; never delete the exported file.", [["id", z25.uuid()]]),
  "zhen/gatewayTaskList": method("gatewayTaskList", z25.array(gatewayTaskRecordSchema).max(100), "Read existing tracked task metadata without credentials or result links."),
  "zhen/gatewayTaskAdd": method("gatewayTaskAdd", gatewayTaskRecordSchema, "Remember an existing task id; no network or generation request.", [["spec", gatewayTaskSpecSchema]]),
  "zhen/gatewayTaskRefresh": method("gatewayTaskRefresh", gatewayTaskRecordSchema, "Query an existing id through one fixed Host-only GET.", [["id", z25.uuid()]]),
  "zhen/gatewayTaskTracking": method("gatewayTaskTracking", gatewayTaskRecordSchema, "Enable or pause status polling; does not cancel the upstream job.", [["id", z25.uuid()], ["enabled", z25.boolean()]]),
  "zhen/gatewayTaskRemove": method("gatewayTaskRemove", z25.void(), "Remove only the local tracking record; does not delete upstream data.", [["id", z25.uuid()]]),
  "zhen/githubSkillList": method("githubSkillList", z25.array(githubSkillSourceViewSchema).max(16), "Read approved GitHub sources and this Host snapshot selections."),
  "zhen/githubSkillDownload": method("githubSkillDownload", githubSkillPreviewSchema, "Download a commit-pinned public repository skill snapshot without execution or activation.", [["spec", githubSkillSpecSchema]]),
  "zhen/githubSkillInspect": method("githubSkillInspect", githubSkillPreviewSchema, "Inspect a retained snapshot and its full resource differences.", [["id", digestSchema], ["digest", digestSchema]]),
  "zhen/githubSkillHistory": method("githubSkillHistory", z25.array(githubSkillSummarySchema).max(20), "Read retained snapshot identities.", [["id", digestSchema]]),
  "zhen/githubSkillFile": method("githubSkillFile", githubSkillFilePreviewSchema, "Preview a registered file as bounded text or opaque metadata.", [["id", digestSchema], ["digest", digestSchema], ["location", z25.enum(["package", "origin"])], ["path", z25.string().min(1).max(512)]]),
  "zhen/githubSkillApprove": method("githubSkillApprove", z25.void(), "Select an explicitly reviewed resource snapshot; changes wait for the next Host start.", [["id", digestSchema], ["digest", digestSchema], ["confirmation", z25.literal(GITHUB_SKILL_POLICY)]]),
  "zhen/githubSkillCheck": method("githubSkillCheck", z25.void(), "Check the tracked ref and download an inactive candidate.", [["id", digestSchema]]),
  "zhen/githubSkillAutomatic": method("githubSkillAutomatic", z25.void(), "Control daily candidate checking and download without code activation.", [["id", digestSchema], ["enabled", z25.boolean()]]),
  "zhen/githubSkillDisable": method("githubSkillDisable", z25.void(), "Disable this source without deleting snapshots.", [["id", digestSchema]]),
  "zhen/githubSkillForget": method("githubSkillForget", z25.void(), "Disconnect this source while retaining downloaded files.", [["id", digestSchema]]),
  "zhen/githubSkillCancelPending": method("githubSkillCancelPending", z25.void(), "Keep this Host snapshot and cancel a reviewed queued selection.", [["id", digestSchema]]),
  "zhen/githubSkillDelete": method("githubSkillDelete", z25.void(), "Delete an unselected owned snapshot; current/queued selections are protected.", [["id", digestSchema], ["digest", digestSchema]]),
  "zhen/githubSkillCancelDownload": method("githubSkillCancelDownload", z25.void(), "Cancel this Host active public skill download."),
  "zhen/localSkillList": method("localSkillList", z25.array(localSkillViewSchema).max(16), "Read connected local directories without executing their resources."),
  "zhen/localSkillPreview": method("localSkillPreview", localSkillDraftSchema, "Preview a local SKILL.md directory or one-level library before trusting it.", [["folder", z25.string().min(1).max(4096)], ["mode", localSkillMode]]),
  "zhen/localSkillBody": method("localSkillBody", localSkillBodySchema, "Read one digest-matching instruction body from a selected local directory.", [["folder", z25.string().min(1).max(4096)], ["directory", z25.string().max(200).refine((value) => !value || !value.startsWith(".") && !/[\\/:\0]/.test(value))], ["digest", digestSchema]]),
  "zhen/localSkillConnect": method("localSkillConnect", z25.void(), "Trust a displayed local directory and its future changes without installing programs.", [["folder", z25.string().min(1).max(4096)], ["mode", localSkillMode], ["digest", digestSchema], ["confirmation", z25.literal(LOCAL_SKILL_POLICY)]]),
  "zhen/localSkillDisable": method("localSkillDisable", z25.void(), "Stop advertising and loading a local skill source.", [["id", z25.uuid()]]),
  "zhen/localSkillDisconnect": method("localSkillDisconnect", z25.void(), "Forget a local source without deleting its files.", [["id", z25.uuid()]]),
  "zhen/gatewayCheckPreview": method("gatewayCheckPreview", gatewayCheckPreviewSchema, "Prepare one fixed 32-token Flash check without sending a model request."),
  "zhen/gatewayCheckHistory": method("gatewayCheckHistory", z25.array(gatewayCheckReceiptSchema).max(10), "Read bounded credential-free connection-check receipts."),
  "zhen/gatewayCheckRun": method("gatewayCheckRun", gatewayCheckReceiptSchema, "Explicitly confirm a fixed short paid check; a spent receipt cannot dispatch twice.", [["id", z25.uuid()], ["confirmation", z25.literal(GATEWAY_CHECK_POLICY)]]),
  "zhen/gatewayCheckCancel": method("gatewayCheckCancel", gatewayCheckReceiptSchema, "Revoke a preview or request cancellation without promising a refund.", [["id", z25.uuid()]]),
  "zhen/gatewayCatalog": method("gatewayCatalog", capabilityCatalogSchema, "Read the reviewed public capability inventory without submitting work."),
  "zhen/gatewayCatalogCheckSnapshot": method("gatewayCatalogCheckSnapshot", capabilityCheckSchema, "Read cached capability source changes."),
  "zhen/gatewayCatalogCheck": method("gatewayCatalogCheck", capabilityCheckSchema, "Compare fixed public source hashes and action facts without changing routing."),
  "zhen/gatewayCatalogAutomatic": method("gatewayCatalogAutomatic", z25.void(), "Control daily public capability metadata checks.", [["enabled", z25.boolean()]]),
  "zhen/mcpSnapshot": method("mcpSnapshot", mcpMarketViewSchema, "Read curated MCP installations, permissions and runtime state."),
  "zhen/mcpRestart": method("mcpRestart", z25.void(), "Drain calls and reload the same enabled MCP connection.", [["id", mcpId]]),
  "zhen/mcpRepair": method("mcpRepair", z25.void(), "Disable/drain, re-download and retain the previous program; renewed explicit trust is required.", [["id", mcpId], ["version", mcpReleaseSchema.shape.version]]),
  "zhen/mcpRestoreArchive": method("mcpRestoreArchive", z25.void(), "Restore a hash-matching quarantined program while leaving it disabled.", [["archiveId", z25.uuid()]]),
  "zhen/mcpCheck": method("mcpCheck", mcpMarketViewSchema, "Check metadata for the fixed MCP sources."),
  "zhen/mcpAutomatic": method("mcpAutomatic", z25.void(), "Control daily MCP checks and inactive compatible downloads for enabled sources.", [["enabled", z25.boolean()]]),
  "zhen/mcpInstall": method("mcpInstall", z25.void(), "Download a reviewed exact MCP release without lifecycle hooks.", [["id", mcpId], ["version", mcpReleaseSchema.shape.version], ["integrity", mcpReleaseSchema.shape.integrity]]),
  "zhen/mcpSelect": method("mcpSelect", z25.void(), "Trust a retained MCP program for one exact project.", [["id", mcpId], ["version", mcpReleaseSchema.shape.version], ["workspace", z25.string().min(1).max(4096)]]),
  "zhen/mcpDisable": method("mcpDisable", z25.void(), "Block new calls immediately and drain ongoing calls.", [["id", mcpId]]),
  "zhen/mcpForget": method("mcpForget", z25.void(), "Remove a disabled connection while retaining data and installed versions.", [["id", mcpId]]),
  "zhen/status": method("status", statusSchema, "Read provider credential presence without a paid request."),
  "zhen/githubAccessInfo": method("githubAccessInfo", githubAccessSchema, "Read first-party GitHub credential presence only."),
  "zhen/githubSaveCredential": method("githubSaveCredential", z25.void(), "Save a first-party GitHub read credential through Host credentials.", [["value", githubCredentialValue]]),
  "zhen/githubRemoveCredential": method("githubRemoveCredential", z25.void(), "Remove the writable first-party GitHub credential and stop pending source reads."),
  "zhen/saveCredential": method("saveCredential", z25.void(), "Save a credential through the Host credential service.", [["value", z25.string().min(8).max(4096).regex(/^\S+$/)]]),
  "zhen/removeCredential": method("removeCredential", z25.void(), "Remove the locally stored Seedance credential."),
  "zhen/wallet": method("wallet", walletSchema, "Read the Seedance wallet from the Host."),
  "zhen/marketList": method("marketList", z25.array(marketItemSchema), "Read the local skill catalog."),
  "zhen/marketFeedSnapshot": method("marketFeedSnapshot", skillFeedSnapshotSchema, "Read cached first-party skill update metadata."),
  "zhen/marketFeedCheck": method("marketFeedCheck", skillFeedSnapshotSchema, "Download bounded instruction candidates from the fixed repository."),
  "zhen/marketFeedAutomatic": method("marketFeedAutomatic", z25.void(), "Control daily candidate downloads without activation.", [["enabled", z25.boolean()]]),
  "zhen/marketAutoPolicy": method("marketAutoPolicy", skillAutoPolicySchema, "Read the persisted first-party standalone-text automatic-update policy."),
  "zhen/marketAutoUpdates": method("marketAutoUpdates", z25.void(), "Choose whether validated fixed-source text updates can be scheduled for the next Host start.", [["enabled", z25.boolean()]]),
  "zhen/marketPauseAuto": method("marketPauseAuto", z25.void(), "Pause or resume automatic updates for an installed source skill.", [["id", skillId], ["paused", z25.boolean()]]),
  "zhen/marketPreview": method("marketPreview", skillPackageSchema, "Preview an exact instruction version.", [["id", skillId], ["digest", digestSchema], ["version", selectedVersion]]),
  "zhen/marketSelect": method("marketSelect", z25.void(), "Install or stage a reviewed instruction version.", [["id", skillId], ["digest", digestSchema], ["version", selectedVersion]]),
  "zhen/marketDisable": method("marketDisable", z25.void(), "Disable new skill loads.", [["id", skillId]]),
  "zhen/marketCancelPending": method("marketCancelPending", z25.void(), "Cancel a staged skill version.", [["id", skillId]]),
  "zhen/marketVersions": method("marketVersions", z25.array(skillPackageSchema), "List retained local versions.", [["id", skillId]]),
  "zhen/marketFork": method("marketFork", skillId, "Save an independent personal skill.", [["id", skillId], ["digest", digestSchema], ["body", z25.string().min(1).max(6e4)], ["version", selectedVersion]]),
  "zhen/canvasDiscover": method("canvasDiscover", canvasDiscoverySchema, "Find and fingerprint local managed Canvas CLI installations without executing them."),
  "zhen/canvasSetupDiscover": method("canvasSetupDiscover", canvasSetupDiscoverySchema, "Owner setup: read bounded desktop executable paths and CLI metadata; never execute candidates or pair."),
  "zhen/canvasConnectionCheck": method("canvasConnectionCheck", canvasConnectionCheckSchema, "Owner setup: discover live instances and perform the already-reviewed CLI exact handshake without reading credentials or pairing."),
  "zhen/canvasPairingSnapshot": method("canvasPairingSnapshot", canvasPairingSchema, "Read this connection UI pairing progress or verify a stored session without returning secrets."),
  "zhen/canvasPairingBegin": method("canvasPairingBegin", canvasPairingSchema, "Explicitly request pairing for the authoritative Canvas window to approve.", [["handoff", z25.boolean().default(false)], ["writable", z25.boolean().default(false)], ["runnable", z25.boolean().default(false)], ["assetTransfer", z25.boolean().default(false)]]),
  "zhen/canvasPairingComplete": method("canvasPairingComplete", canvasPairingSchema, "Claim a window-approved pairing once and save only through the original CLI secureStore."),
  "zhen/canvasStatus": method("canvasStatus", canvasSchema, "Read the existing canvas compatibility status."),
  "zhen/canvasTools": method("canvasTools", canvasToolCatalogSchema.nullable(), "Read and cross-check the existing versioned Canvas planning catalog."),
  "zhen/canvasWorkflowSnapshot": method("canvasWorkflowSnapshot", canvasWorkflowSchema.nullable(), "Read non-secret native workflow application progress."),
  "zhen/canvasWorkspaces": method("canvasWorkspaces", canvasWorkspacesSchema, "List native Canvas targets for explicit UI planning."),
  "zhen/canvasWorkflowModels": method("canvasWorkflowModels", canvasModelsSchema, "Read scoped public native models/readiness for explicit UI selection without settings or credentials.", [["input", canvasModelsQuery]]),
  "zhen/canvasWorkflowAssets": method("canvasWorkflowAssets", canvasAssetsSchema, "Read scoped public native reference metadata without media URLs or file contents.", [["input", canvasAssetsQuery]]),
  "zhen/canvasWorkflowPreview": method("canvasWorkflowPreview", canvasWorkflowSchema, "Prepare a native creative plan without writes or Provider calls.", [["input", canvasWorkflowInput]]),
  "zhen/canvasWorkflowApprove": method("canvasWorkflowApprove", canvasWorkflowSchema, "Human UI confirmation requests authoritative Canvas window approval.", [["id", z25.uuid()], ["confirmation", z25.boolean()]]),
  "zhen/canvasWorkflowComplete": method("canvasWorkflowComplete", canvasWorkflowSchema, "Explicitly check a native window approval and apply its bound structure once.", [["id", z25.uuid()]]),
  "zhen/canvasRunSnapshot": method("canvasRunSnapshot", canvasRunViewSchema.nullable(), "Read references for the current native run quote without secrets."),
  "zhen/canvasRunNodes": method("canvasRunNodes", canvasRunNodesSchema, "Read bounded native node/schema metadata for explicit selection.", [["projectId", z25.string().min(1).max(160)], ["canvasId", z25.string().min(1).max(160)], ["offset", z25.number().int().min(0).max(1e5).default(0)]]),
  "zhen/canvasRunQuote": method("canvasRunQuote", canvasRunViewSchema, "Prepare a native run plan; price remains unknown and no intent is reserved.", [["selection", canvasRunSelection]]),
  "zhen/canvasRunApprove": method("canvasRunApprove", canvasRunViewSchema, "Human review and explicit unknown-price acceptance request native window approval.", [["quoteId", z25.uuid()], ["confirmed", z25.boolean()], ["unknownPriceAccepted", z25.boolean()]]),
  "zhen/canvasRunSubmit": method("canvasRunSubmit", canvasRunViewSchema, "Explicit native window completion may reserve one durable intent. No repeat after ambiguity.", [["quoteId", z25.uuid()]]),
  "zhen/canvasRunRefresh": method("canvasRunRefresh", canvasRunViewSchema, "GET-only native operation/approval lookup; never retries submission.", [["quoteId", z25.uuid()]]),
  "zhen/canvasTasksList": method("canvasTasksList", canvasTaskListSchema, "Read at most 100 native intents owned by the current pairing in an explicit canvas; no local paid ledger.", [["scope", canvasTaskScope]]),
  "zhen/canvasTaskDetail": method("canvasTaskDetail", canvasTaskDetailSchema, "GET-only original intent and bounded completion evidence summary without URLs or raw error messages.", [["reference", canvasTaskReference]]),
  "zhen/defaultArtInfo": method("defaultArtInfo", defaultArtInfoSchema, "Read the confirmed local default-art manifest summary without a Host path."),
  "zhen/defaultArtChunk": method("defaultArtChunk", defaultArtChunkSchema, "Read one bounded chunk of an already captured, hash-pinned raster; no arbitrary file access.", [["request", defaultArtChunkRequest]]),
  "zhen/canvasTransferSnapshot": method("canvasTransferSnapshot", canvasTransferViewSchema.nullable(), "Read local saved-media handoff references without paths or approval secrets."),
  "zhen/canvasTransferPreview": method("canvasTransferPreview", canvasTransferViewSchema, "Preview an owned export receipt in an explicit native project/canvas.", [["input", canvasTransferInput]]),
  "zhen/canvasTransferApprove": method("canvasTransferApprove", canvasTransferViewSchema, "Human review requests native file-copy or placement approval.", [["id", z25.uuid()], ["confirmed", z25.boolean()]]),
  "zhen/canvasTransferComplete": method("canvasTransferComplete", canvasTransferViewSchema, "Check authoritative window approval and complete the bound local copy/placement once.", [["id", z25.uuid()]]),
  "zhen/canvasTransferPlacement": method("canvasTransferPlacement", canvasTransferViewSchema, "Preview placement of the already managed native asset; no Provider call.", [["id", z25.uuid()]]),
  "zhen/canvasTransferRefresh": method("canvasTransferRefresh", canvasTransferViewSchema, "Read original native asset/patch/approval progress; never resubmit after ambiguity.", [["id", z25.uuid()]]),
  "zhen/canvasCandidates": method("canvasCandidates", canvasCandidatesSchema, "Read process-local creative plans observed in accepted Canvas tool results."),
  "zhen/canvasCandidateAdopt": method("canvasCandidateAdopt", canvasWorkflowSchema, "Select an existing native chat plan for human review; no replanning, window approval or mutation.", [["id", z25.uuid()]]),
  "zhen/canvasCandidateRemove": method("canvasCandidateRemove", z25.void(), "Forget only a local inbox entry without changing native Canvas plans.", [["id", z25.uuid()]]),
  "zhen/connectCanvas": method("connectCanvas", canvasSchema, "Connect a user-selected installed canvas CLI.", [["root", z25.string().min(1).max(4096)], ["instance", z25.string().regex(/^[A-Za-z0-9._-]{0,128}$/)], ["expectedDigest", z25.string().regex(/^(?:|[a-f0-9]{64})$/).default("")]]),
  "zhen/disconnectCanvas": method("disconnectCanvas", z25.void(), "Disconnect the local canvas adapter."),
  "zhen/updatesSnapshot": method("updatesSnapshot", updateReportSchema, "Read cached public update metadata."),
  "zhen/updatesCheck": method("updatesCheck", updateReportSchema, "Check fixed official public metadata sources."),
  "zhen/updatesAutomatic": method("updatesAutomatic", z25.void(), "Control automatic public metadata checks.", [["enabled", z25.boolean()]]),
  "zhen/knowledgeBinding": method("knowledgeBinding", bindingSchema, "Read the explicit workspace binding.", [["project", projectInput]]),
  "zhen/bindKnowledge": method("bindKnowledge", bindingSchema, "Bind a local knowledge space to an exact working directory.", [["project", projectInput], ["directory", z25.string().max(4096)]]),
  "zhen/setKnowledgeAgentAccess": method("setKnowledgeAgentAccess", z25.void(), "Set the separate permission for agent retrieval.", [["project", projectInput], ["collectionId", z25.string().uuid()], ["enabled", z25.boolean()]]),
  "zhen/knowledgeCollections": method("knowledgeCollections", z25.array(collectionSchema), "List local collections.", [["project", projectInput]]),
  "zhen/ragBackendStatus": method("ragBackendStatus", ragBackendStatusSchema, "Read local retrieval backend availability."),
  "zhen/ragBackendConfigure": method("ragBackendConfigure", ragBackendStatusSchema, "Choose or pause a local retrieval backend without changing collection grants.", [["selected", ragBackendId], ["enabled", z25.boolean()], ["expectedRevision", z25.uuid()]]),
  "zhen/createKnowledge": method("createKnowledge", collectionSchema, "Authorize a local folder.", [["project", projectInput], ["name", z25.string().min(1).max(100)], ["folder", z25.string().min(1).max(4096)]]),
  "zhen/indexKnowledge": method("indexKnowledge", importSchema, "Index an authorized local collection.", [["project", projectInput], ["collectionId", z25.string().uuid()]]),
  "zhen/knowledgeImportReport": method("knowledgeImportReport", knowledgeImportReportSchema.nullable(), "Read bounded local import diagnostics for the current collection revision.", [["project", projectInput], ["collectionId", z25.string().uuid()]]),
  "zhen/searchKnowledge": method("searchKnowledge", z25.array(hitSchema), "Search only the selected project.", [["project", projectInput], ["query", z25.string().max(200)]]),
  "zhen/setKnowledgeAccess": method("setKnowledgeAccess", z25.void(), "Change collection permissions.", [["project", projectInput], ["collectionId", z25.string().uuid()], ["enabled", z25.boolean()], ["cloudProvider", z25.enum(["", "seedance"])]]),
  "zhen/knowledgeCitation": method("knowledgeCitation", hitSchema, "Revalidate a citation before use.", [["project", projectInput], ["hitId", z25.string().uuid()], ["epoch", z25.number().int().positive()], ["provider", z25.literal("seedance")]]),
  "zhen/knowledgeSource": method("knowledgeSource", ragSourceSchema, "Read an authorized index snapshot; no arbitrary path or cloud transfer.", [["project", projectInput], ["hitId", z25.string().uuid()], ["epoch", z25.number().int().positive()]])
} }, z25);

// packages/dsh-zhen/src/typert.ts
var TYPERT = {
  package: "dsh-zhen",
  face: "host",
  schemas: [],
  model: { services: [], events: [], objects: [] },
  get invocations() {
    return TYPERT_REMOTE.descriptors;
  }
};
export {
  TYPERT
};
