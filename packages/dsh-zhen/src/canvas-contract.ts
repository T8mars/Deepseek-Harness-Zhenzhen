import { z } from 'zod';

export const canvasEntity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
// Native instance IDs are base64url and may start with '-' or '_'. They are
// distinct from project/node identities; retain older bounded local references.
export const canvasInstance = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const version = z.string().max(60).regex(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const toolName = z.string().regex(/^zcanvas_[a-z][a-z0-9_]{2,127}$/);
export const canvasDirectOperation = z.enum(['plan', 'preview', 'inspect', 'verify']);
const previewScopes = new Set(['canvas:read','asset:read','asset:transfer','run:read','browser:handoff']);
export const canvasPreviewScopes = z.array(z.string().refine(value => previewScopes.has(value))).min(1).max(5).refine(value => new Set(value).size === value.length);
const forbidden = new Set(['handler','service','method','route','endpoint','baseurl','targeturl','url','headers','authorization','credential','credentials','cookie','cookies','token','accesstoken','refreshtoken','apikey','secret','providerpayload','providerrequest','requestinit','rawbody','sql','database','db','dom','selector','reactflow','zustand','sourcecode','sourcefile','sourcepath','command','shell','argv','process','childprocess','patch','canvaspatch','operations','nodes','edges','path','prototype','proto','constructor']);

/** Bound JSON before crossing into the installed CLI; no executable carrier. */
export function boundedCanvasInput(value: unknown, highLevel = true): boolean {
  let entries = 0;
  const visit = (item: unknown, depth: number): boolean => {
    if (depth > 12) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item === 'string') return new TextEncoder().encode(item).length <= 48 * 1024;
    if (!item || typeof item !== 'object') return false;
    if (Array.isArray(item)) { entries += item.length; return entries <= 2048 && item.every(value => visit(value, depth + 1)); }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) return false;
    const pairs = Object.entries(item); entries += pairs.length;
    return entries <= 2048 && pairs.every(([key, value]) => key.length <= 128 && !(highLevel && forbidden.has(key.replace(/[^A-Za-z0-9]/g, '').toLowerCase())) && visit(value, depth + 1));
  };
  try { return !!value && !Array.isArray(value) && typeof value === 'object' && visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= 64 * 1024; }
  catch { return false; }
}
export const canvasPlanRequest = z.object({
  tool: toolName, version, operation: canvasDirectOperation,
  projectId: canvasEntity, canvasId: canvasEntity,
  clientRequestId: canvasEntity.optional(),
  input: z.record(z.string(), z.unknown()).refine(value => boundedCanvasInput(value), 'Only bounded high-level creative input is supported.'),
}).strict();
export type CanvasPlanRequest = z.infer<typeof canvasPlanRequest>;

export const canvasInspectionRequest = z.object({
  tool: z.enum(['inspectCanvas','inspectNodeSchema','inspectRun','searchAssets','searchSubflows','validateCanvas','simulateExecutionPlan','estimateRun']),
  projectId: canvasEntity.max(160), canvasId: canvasEntity.max(160), requestId: canvasEntity.max(160).optional(),
  input: z.record(z.string(), z.unknown()).refine(value => boundedCanvasInput(value, false), 'Inspection input exceeded supported JSON limits.'),
}).strict();
export type CanvasInspectionRequest = z.infer<typeof canvasInspectionRequest>;
export const canvasInspectionResultSchema = z.object({ schema: z.literal('t8-canvas-agent-tool-result-v1'), tool: canvasInspectionRequest.shape.tool,
  requestId: canvasEntity.max(160), projectId: canvasEntity.max(160), canvasId: canvasEntity.max(160), canvasRevision: z.number().int().positive(),
  actorId: z.string().max(256), role: z.string().max(80), authority: z.unknown(), nodeSchemaDigest: digest,
  readOnly: z.literal(true), truncated: z.boolean(), data: z.unknown(), digest });

const policy = z.object({ operation: z.string().min(1).max(80), riskLevel: z.enum(['L0','L1','L2','L3']), approvalRequired: z.boolean(), boundary: z.string().max(100), requiredScopes: z.array(z.string().max(80)).max(16) });
const publicTool = z.object({ name: toolName, version, capabilityId: z.string().min(1).max(150), creatorLabel: z.string().max(240), category: z.string().max(100),
  requestSchema: z.literal('t8-versioned-creative-tool-request-v1'), resultSchema: z.literal('t8-versioned-creative-tool-result-v1'),
  defaultOperation: canvasDirectOperation, directOperations: z.array(canvasDirectOperation).min(1).max(4), operations: z.array(policy).min(1).max(16) }).strict();
export const canvasToolCatalogSchema = z.object({ schema: z.literal('t8-versioned-creative-tool-catalog-v1'), protocol: z.literal('t8-versioned-creative-tool-v1'), capabilityManifestVersion: version,
  capabilityManifestDigest: digest, capabilityGraphDigest: digest, tools: z.array(publicTool).min(1).max(256) }).strict().superRefine((value, context) => {
    if (new Set(value.tools.map(tool => tool.name)).size !== value.tools.length || value.tools.some(tool => tool.version !== value.capabilityManifestVersion || !tool.directOperations.includes(tool.defaultOperation) || new Set(tool.directOperations).size !== tool.directOperations.length || new Set(tool.operations.map(operation => operation.operation)).size !== tool.operations.length || tool.directOperations.some(operation => !tool.operations.some(policy => policy.operation === operation && policy.riskLevel === 'L0' && policy.approvalRequired === false && policy.boundary === 'local-read' && canvasPreviewScopes.safeParse(policy.requiredScopes).success)))) context.addIssue({ code: 'custom', message: 'Canvas direct-operation boundary changed.' });
  });
export type CanvasToolCatalog = z.infer<typeof canvasToolCatalogSchema>;

/** Projection only; internal handler/service bindings never leave the CLI. */
export function projectCanvasSurfaces(raw: unknown): CanvasToolCatalog {
  const surfaces = z.object({ schema: z.literal('t8-creative-capability-surfaces-v1'), capabilityManifestVersion: version, sourceDigest: digest, capabilityGraphDigest: digest,
    capabilities: z.array(z.object({ id: z.string(), creatorLabel: z.string(), category: z.string(), agentTool: z.object({ name: toolName, version,
      protocol: z.literal('t8-versioned-creative-tool-v1'), requestSchema: z.literal('t8-versioned-creative-tool-request-v1'), resultSchema: z.literal('t8-versioned-creative-tool-result-v1'),
      defaultOperation: canvasDirectOperation, directOperations: z.array(canvasDirectOperation) }), ui: z.object({ operations: z.array(policy) }) })).min(1).max(256) }).parse(raw);
  return canvasToolCatalogSchema.parse({ schema: 't8-versioned-creative-tool-catalog-v1', protocol: 't8-versioned-creative-tool-v1', capabilityManifestVersion: surfaces.capabilityManifestVersion,
    capabilityManifestDigest: surfaces.sourceDigest, capabilityGraphDigest: surfaces.capabilityGraphDigest,
    tools: surfaces.capabilities.map(capability => ({ name: capability.agentTool.name, version: capability.agentTool.version, capabilityId: capability.id, creatorLabel: capability.creatorLabel, category: capability.category,
      requestSchema: capability.agentTool.requestSchema, resultSchema: capability.agentTool.resultSchema, defaultOperation: capability.agentTool.defaultOperation,
      directOperations: capability.agentTool.directOperations, operations: capability.ui.operations })) });
}

export function sameCanvasCatalog(left: CanvasToolCatalog, right: CanvasToolCatalog): boolean {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key, value]) => [key, canonical(value)])) : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

export const canvasPlanResultSchema = z.object({ schema: z.literal('t8-versioned-creative-tool-result-v1'),
  tool: z.object({ name: toolName, version, capabilityId: z.string(), operation: canvasDirectOperation, requestAction: z.string() }),
  contract: z.object({ protocol: z.literal('t8-versioned-creative-tool-v1'), capabilityManifestDigest: digest, capabilityGraphDigest: digest,
    riskLevel: z.literal('L0'), approvalRequired: z.literal(false), requiredScopes: canvasPreviewScopes }),
  request: z.object({ clientRequestId: canvasEntity.nullable(), projectId: canvasEntity, canvasId: canvasEntity }),
  readOnly: z.literal(true), directInternalAccess: z.literal(false), sideEffects: z.object({ canvasWrites: z.literal(0), providerCalls: z.literal(0), fileWrites: z.literal(0) }), data: z.unknown(),
});
