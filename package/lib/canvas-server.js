#!/usr/bin/env node

// packages/dsh-zhen/src/canvas-server.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// packages/dsh-zhen/src/canvas.ts
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

// packages/dsh-zhen/src/canvas-contract.ts
import { z } from "zod";
var canvasEntity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/);
var canvasInstance = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
var version = z.string().max(60).regex(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/);
var digest = z.string().regex(/^[a-f0-9]{64}$/);
var toolName = z.string().regex(/^zcanvas_[a-z][a-z0-9_]{2,127}$/);
var canvasDirectOperation = z.enum(["plan", "preview", "inspect", "verify"]);
var previewScopes = /* @__PURE__ */ new Set(["canvas:read", "asset:read", "asset:transfer", "run:read", "browser:handoff"]);
var canvasPreviewScopes = z.array(z.string().refine((value) => previewScopes.has(value))).min(1).max(5).refine((value) => new Set(value).size === value.length);
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
var canvasPlanRequest = z.object({
  tool: toolName,
  version,
  operation: canvasDirectOperation,
  projectId: canvasEntity,
  canvasId: canvasEntity,
  clientRequestId: canvasEntity.optional(),
  input: z.record(z.string(), z.unknown()).refine((value) => boundedCanvasInput(value), "Only bounded high-level creative input is supported.")
}).strict();
var canvasInspectionRequest = z.object({
  tool: z.enum(["inspectCanvas", "inspectNodeSchema", "inspectRun", "searchAssets", "searchSubflows", "validateCanvas", "simulateExecutionPlan", "estimateRun"]),
  projectId: canvasEntity.max(160),
  canvasId: canvasEntity.max(160),
  requestId: canvasEntity.max(160).optional(),
  input: z.record(z.string(), z.unknown()).refine((value) => boundedCanvasInput(value, false), "Inspection input exceeded supported JSON limits.")
}).strict();
var canvasInspectionResultSchema = z.object({
  schema: z.literal("t8-canvas-agent-tool-result-v1"),
  tool: canvasInspectionRequest.shape.tool,
  requestId: canvasEntity.max(160),
  projectId: canvasEntity.max(160),
  canvasId: canvasEntity.max(160),
  canvasRevision: z.number().int().positive(),
  actorId: z.string().max(256),
  role: z.string().max(80),
  authority: z.unknown(),
  nodeSchemaDigest: digest,
  readOnly: z.literal(true),
  truncated: z.boolean(),
  data: z.unknown(),
  digest
});
var policy = z.object({ operation: z.string().min(1).max(80), riskLevel: z.enum(["L0", "L1", "L2", "L3"]), approvalRequired: z.boolean(), boundary: z.string().max(100), requiredScopes: z.array(z.string().max(80)).max(16) });
var publicTool = z.object({
  name: toolName,
  version,
  capabilityId: z.string().min(1).max(150),
  creatorLabel: z.string().max(240),
  category: z.string().max(100),
  requestSchema: z.literal("t8-versioned-creative-tool-request-v1"),
  resultSchema: z.literal("t8-versioned-creative-tool-result-v1"),
  defaultOperation: canvasDirectOperation,
  directOperations: z.array(canvasDirectOperation).min(1).max(4),
  operations: z.array(policy).min(1).max(16)
}).strict();
var canvasToolCatalogSchema = z.object({
  schema: z.literal("t8-versioned-creative-tool-catalog-v1"),
  protocol: z.literal("t8-versioned-creative-tool-v1"),
  capabilityManifestVersion: version,
  capabilityManifestDigest: digest,
  capabilityGraphDigest: digest,
  tools: z.array(publicTool).min(1).max(256)
}).strict().superRefine((value, context) => {
  if (new Set(value.tools.map((tool) => tool.name)).size !== value.tools.length || value.tools.some((tool) => tool.version !== value.capabilityManifestVersion || !tool.directOperations.includes(tool.defaultOperation) || new Set(tool.directOperations).size !== tool.directOperations.length || new Set(tool.operations.map((operation) => operation.operation)).size !== tool.operations.length || tool.directOperations.some((operation) => !tool.operations.some((policy2) => policy2.operation === operation && policy2.riskLevel === "L0" && policy2.approvalRequired === false && policy2.boundary === "local-read" && canvasPreviewScopes.safeParse(policy2.requiredScopes).success)))) context.addIssue({ code: "custom", message: "Canvas direct-operation boundary changed." });
});
function projectCanvasSurfaces(raw) {
  const surfaces = z.object({
    schema: z.literal("t8-creative-capability-surfaces-v1"),
    capabilityManifestVersion: version,
    sourceDigest: digest,
    capabilityGraphDigest: digest,
    capabilities: z.array(z.object({ id: z.string(), creatorLabel: z.string(), category: z.string(), agentTool: z.object({
      name: toolName,
      version,
      protocol: z.literal("t8-versioned-creative-tool-v1"),
      requestSchema: z.literal("t8-versioned-creative-tool-request-v1"),
      resultSchema: z.literal("t8-versioned-creative-tool-result-v1"),
      defaultOperation: canvasDirectOperation,
      directOperations: z.array(canvasDirectOperation)
    }), ui: z.object({ operations: z.array(policy) }) })).min(1).max(256)
  }).parse(raw);
  return canvasToolCatalogSchema.parse({
    schema: "t8-versioned-creative-tool-catalog-v1",
    protocol: "t8-versioned-creative-tool-v1",
    capabilityManifestVersion: surfaces.capabilityManifestVersion,
    capabilityManifestDigest: surfaces.sourceDigest,
    capabilityGraphDigest: surfaces.capabilityGraphDigest,
    tools: surfaces.capabilities.map((capability) => ({
      name: capability.agentTool.name,
      version: capability.agentTool.version,
      capabilityId: capability.id,
      creatorLabel: capability.creatorLabel,
      category: capability.category,
      requestSchema: capability.agentTool.requestSchema,
      resultSchema: capability.agentTool.resultSchema,
      defaultOperation: capability.agentTool.defaultOperation,
      directOperations: capability.agentTool.directOperations,
      operations: capability.ui.operations
    }))
  });
}
function sameCanvasCatalog(left, right) {
  const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, value2]) => [key, canonical(value2)])) : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}
var canvasPlanResultSchema = z.object({
  schema: z.literal("t8-versioned-creative-tool-result-v1"),
  tool: z.object({ name: toolName, version, capabilityId: z.string(), operation: canvasDirectOperation, requestAction: z.string() }),
  contract: z.object({
    protocol: z.literal("t8-versioned-creative-tool-v1"),
    capabilityManifestDigest: digest,
    capabilityGraphDigest: digest,
    riskLevel: z.literal("L0"),
    approvalRequired: z.literal(false),
    requiredScopes: canvasPreviewScopes
  }),
  request: z.object({ clientRequestId: canvasEntity.nullable(), projectId: canvasEntity, canvasId: canvasEntity }),
  readOnly: z.literal(true),
  directInternalAccess: z.literal(false),
  sideEffects: z.object({ canvasWrites: z.literal(0), providerCalls: z.literal(0), fileWrites: z.literal(0) }),
  data: z.unknown()
});

// packages/dsh-zhen/src/canvas-setup-schema.ts
import { z as z3 } from "zod";

// packages/dsh-zhen/src/canvas-discovery-schema.ts
import { z as z2 } from "zod";
var canvasInstallCandidateSchema = z2.object({
  root: z2.string().min(1).max(4096),
  digest: z2.string().regex(/^[a-f0-9]{64}$/),
  cliVersion: z2.string().min(1).max(64),
  skillVersion: z2.string().min(1).max(64),
  nodeSchemaDigest: z2.string().regex(/^[a-f0-9]{64}$/),
  providerCatalogDigest: z2.string().regex(/^[a-f0-9]{64}$/)
}).strict();
var canvasDiscoverySchema = z2.object({ candidates: z2.array(canvasInstallCandidateSchema).max(8), issues: z2.array(z2.string().max(200)).max(8) }).strict();

// packages/dsh-zhen/src/canvas-setup-schema.ts
var canvasSetupDiscoverySchema = z3.object({
  candidates: z3.array(canvasInstallCandidateSchema.extend({ source: z3.enum(["running-desktop", "managed"]) }).strict()).max(8),
  issues: z3.array(z3.string().max(200)).max(8)
}).strict();
var canvasConnectionCheckSchema = z3.object({
  binding: z3.object({ root: z3.string().min(1).max(4096), digest: z3.string().regex(/^[a-f0-9]{64}$/), instance: z3.string().regex(/^[A-Za-z0-9._-]{0,128}$/) }).strict().nullable(),
  state: z3.enum(["not-configured", "not-running", "choose-instance", "needs-review", "incompatible", "ready", "error"]),
  code: z3.string().regex(/^[A-Z][A-Z0-9_]{0,80}$/),
  message: z3.string().max(400),
  instances: z3.array(z3.object({ id: z3.string().regex(/^[A-Za-z0-9._-]{1,128}$/), version: z3.string().max(64), port: z3.number().int().min(1).max(65535) }).strict()).max(16)
}).strict();

// packages/dsh-zhen/src/canvas.ts
var loadedCliDigests = /* @__PURE__ */ new Map();
var CanvasError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
function inspectCanvasCli(path, instance = "") {
  if (!isAbsolute(path) || path.length > 4096 || !/^[A-Za-z0-9._-]{0,128}$/.test(instance)) throw new CanvasError("CLI_PATH_INVALID", "\u8BF7\u9009\u62E9\u672C\u673A zcanvas-cli \u7684\u7EDD\u5BF9\u76EE\u5F55\u3002");
  const root = realpathSync.native(path);
  const manifestPath = join(root, "manifest.json");
  if (lstatSync(manifestPath).size > 65536) throw new CanvasError("CLI_MANIFEST_INVALID", "CLI \u6E05\u5355\u8FC7\u5927\u3002");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.schema !== "t8-zcanvas-manifest-v1" || manifest.controlProtocol !== "t8-agent-control-v1") throw new CanvasError("CLI_MANIFEST_INVALID", "\u8BF7\u9009\u62E9\u53D7\u652F\u6301\u7684\u753B\u5E03 CLI \u76EE\u5F55\u3002");
  const hash = createHash("sha256");
  let files = 0, bytes = 0;
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const full = join(directory, name), stat = lstatSync(full);
      if (stat.isSymbolicLink()) throw new CanvasError("CLI_LINK_REFUSED", "CLI \u76EE\u5F55\u542B\u7B26\u53F7\u94FE\u63A5\uFF0C\u8BF7\u9009\u62E9\u5B8C\u6574\u7684\u5DF2\u5B89\u88C5\u7248\u672C\u3002");
      if (stat.isDirectory()) {
        if (name === "node_modules" || name === ".git") throw new CanvasError("CLI_DIRECTORY_INVALID", "\u8BF7\u9009\u62E9 zcanvas-cli \u5B50\u76EE\u5F55\u3002");
        walk(full);
      } else if (stat.isFile()) {
        if (++files > 512 || (bytes += stat.size) > 40 * 1024 * 1024) throw new CanvasError("CLI_DIRECTORY_INVALID", "CLI \u6587\u4EF6\u8D85\u51FA\u652F\u6301\u8303\u56F4\u3002");
        const data = readFileSync(full);
        hash.update(relative(root, full).replaceAll("\\", "/")).update("\0").update(String(data.length)).update("\0").update(data);
      } else throw new CanvasError("CLI_DIRECTORY_INVALID", "CLI \u6587\u4EF6\u7C7B\u578B\u4E0D\u652F\u6301\u3002");
    }
  };
  walk(root);
  for (const file of ["src/agentClient.cjs", "src/discovery.cjs", "src/secureStore.cjs"]) if (!lstatSync(join(root, file)).isFile()) throw new CanvasError("CLI_INCOMPLETE", "CLI \u5B89\u88C5\u4E0D\u5B8C\u6574\u3002");
  return { root, digest: hash.digest("hex"), instance };
}
var CanvasBridge = class {
  constructor(config) {
    this.config = config;
  }
  modules;
  load() {
    const current = inspectCanvasCli(this.config.root, this.config.instance);
    if (current.root !== this.config.root || current.digest !== this.config.digest) throw new CanvasError("CLI_CHANGED", "\u753B\u5E03 CLI \u5DF2\u53D8\u5316\uFF0C\u8BF7\u5728\u8FDE\u63A5\u9875\u5BA1\u9605\u5E76\u91CD\u65B0\u8FDE\u63A5\u3002");
    if (!this.modules) {
      const require2 = createRequire(import.meta.url);
      if (loadedCliDigests.get(current.root) !== current.digest) {
        for (const filename of Object.keys(require2.cache)) {
          let canonical = filename;
          try {
            canonical = realpathSync.native(filename);
          } catch {
          }
          const rel = relative(current.root, canonical);
          if (rel && rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel)) delete require2.cache[filename];
        }
        loadedCliDigests.set(current.root, current.digest);
      }
      this.modules = { client: require2(join(current.root, "src/agentClient.cjs")), discovery: require2(join(current.root, "src/discovery.cjs")), store: require2(join(current.root, "src/secureStore.cjs")) };
    }
    return this.modules;
  }
  async paired() {
    const { client, store } = this.load();
    const instance = await client.selectInstance(this.config.instance);
    const session = store.loadSession(instance.instanceId);
    if (!session?.accessToken || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) throw new CanvasError("PAIRING_REQUIRED", "\u8BF7\u5148\u5728\u8FDE\u63A5\u9875\u914D\u5BF9\uFF0C\u5E76\u5728\u753B\u5E03\u7A97\u53E3\u6279\u51C6\u6240\u9700\u6743\u9650\u3002");
    return { client, instance, accessToken: session.accessToken };
  }
  /** Host connection UI only. This is never registered as an Agent/MCP tool. */
  async pairingRuntime() {
    const { client, store } = this.load();
    for (const method of ["configuredInstances", "loadPending", "storePending", "deletePending", "loadSession", "storeSession"]) {
      if (typeof store[method] !== "function") throw new CanvasError("CLI_PAIRING_UNSUPPORTED", "\u5F53\u524D\u753B\u5E03\u5DE5\u5177\u4E0D\u652F\u6301\u754C\u9762\u914D\u5BF9\uFF0C\u8BF7\u5728\u753B\u5E03\u8BBE\u7F6E\u4E2D\u66F4\u65B0 Agent \u5DE5\u5177\u3002");
    }
    const instance = await client.selectInstance(this.config.instance);
    return { client, store, instance };
  }
  /** Explicit Host UI only; never exposed through Canvas MCP. */
  async workflowRuntime() {
    const { client, store, instance } = await this.pairingRuntime();
    const session = store.loadSession(instance.instanceId);
    if (!session?.accessToken || !session.sessionId || session.origin !== instance.origin || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) throw new CanvasError("PAIRING_REQUIRED", "\u8BF7\u5148\u5B8C\u6210\u6709\u6548\u7684\u753B\u5E03\u7A97\u53E3\u914D\u5BF9\u3002");
    for (const method of ["storeApproval", "loadApproval", "deleteApproval"]) if (typeof store[method] !== "function") throw new CanvasError("CLI_APPROVAL_UNSUPPORTED", "\u8BF7\u66F4\u65B0\u753B\u5E03 Agent \u5DE5\u5177\u540E\u4F7F\u7528\u7A97\u53E3\u5BA1\u6279\u3002");
    const result = (await client.requestAgentControl(instance, "/api/agent-control/v1/session", { accessToken: session.accessToken })).data;
    if (result.sessionId !== session.sessionId || typeof result.actorId !== "string" || !result.actorId || result.actorId.length > 256 || !Array.isArray(result.scopes) || !result.scopes.every((scope) => typeof scope === "string") || !result.scopes.includes("canvas:read")) throw new CanvasError("PAIRING_SESSION_INVALID", "\u753B\u5E03\u914D\u5BF9\u8EAB\u4EFD\u6216\u8BFB\u53D6\u6743\u9650\u4E0D\u4E00\u81F4\u3002");
    return { instance, client, store, sessionId: session.sessionId, actorId: result.actorId, accessToken: session.accessToken, scopes: result.scopes };
  }
  localCatalog() {
    const file = join(this.config.root, "generated/creative-capability-surfaces.json");
    if (!lstatSync(file).isFile() || lstatSync(file).size > 1024 * 1024) throw new CanvasError("CAPABILITY_CATALOG_INVALID", "\u753B\u5E03\u80FD\u529B\u6587\u4EF6\u7F3A\u5931\u6216\u8D85\u51FA\u652F\u6301\u8303\u56F4\uFF0C\u8BF7\u66F4\u65B0 CLI\u3002");
    return projectCanvasSurfaces(JSON.parse(readFileSync(file, "utf8")));
  }
  async checkedCatalog(connection) {
    const expected = this.localCatalog();
    const actual = canvasToolCatalogSchema.parse((await connection.client.requestAgentControl(connection.instance, "/api/agent-control/v1/capability-tools", { accessToken: connection.accessToken })).data);
    if (!sameCanvasCatalog(expected, actual)) throw new CanvasError("CAPABILITY_CATALOG_CHANGED", "\u753B\u5E03\u9AD8\u5C42\u80FD\u529B\u4E0E\u5DF2\u5BA1\u9605 CLI \u4E0D\u4E00\u81F4\uFF0C\u8BF7\u66F4\u65B0\u5E76\u91CD\u65B0\u8FDE\u63A5\u3002");
    return actual;
  }
  async inspect(input) {
    const parsed = canvasInspectionRequest.parse(input), request = { ...parsed, requestId: parsed.requestId ?? randomUUID() };
    const { client, instance, accessToken } = await this.paired();
    const data = canvasInspectionResultSchema.parse((await client.requestAgentControl(instance, "/api/agent-control/v1/tools", { accessToken, method: "POST", body: request })).data);
    if (data.tool !== request.tool || data.requestId !== request.requestId || data.projectId !== request.projectId || data.canvasId !== request.canvasId) throw new CanvasError("INSPECTION_RESULT_MISMATCH", "\u753B\u5E03\u68C0\u67E5\u7ED3\u679C\u4E0E\u5F53\u524D\u9879\u76EE\u3001\u753B\u5E03\u6216\u8BF7\u6C42\u4E0D\u4E00\u81F4\u3002");
    return data;
  }
  async plan(input) {
    const request = canvasPlanRequest.parse(input), connection = await this.paired();
    const catalog = await this.checkedCatalog(connection), tool = catalog.tools.find((tool2) => tool2.name === request.tool);
    if (!tool || tool.version !== request.version || !tool.directOperations.includes(request.operation)) throw new CanvasError("CAPABILITY_OPERATION_REFUSED", "\u8BE5\u80FD\u529B\u6216\u7248\u672C\u672A\u5F00\u653E\u6B64\u89C4\u5212\u64CD\u4F5C\uFF0C\u8BF7\u5148\u8BFB\u53D6\u5F53\u524D\u80FD\u529B\u6E05\u5355\u3002");
    const policy2 = tool.operations.find((policy3) => policy3.operation === request.operation);
    if (!policy2 || policy2.riskLevel !== "L0" || policy2.approvalRequired) throw new CanvasError("CAPABILITY_OPERATION_REFUSED", "\u5199\u5165\u548C\u4ED8\u8D39\u6267\u884C\u5FC5\u987B\u4F7F\u7528\u4E13\u95E8\u7684\u5BA1\u6279\u6D41\u7A0B\u3002");
    const { client, instance, accessToken } = connection;
    const data = canvasPlanResultSchema.parse((await client.requestAgentControl(instance, "/api/agent-control/v1/capability-tools/invoke", {
      accessToken,
      method: "POST",
      body: { schema: "t8-versioned-creative-tool-request-v1", ...request }
    })).data);
    if (data.tool.name !== request.tool || data.tool.version !== request.version || data.tool.capabilityId !== tool.capabilityId || data.tool.operation !== request.operation || data.request.projectId !== request.projectId || data.request.canvasId !== request.canvasId || data.request.clientRequestId !== (request.clientRequestId ?? null) || data.contract.capabilityManifestDigest !== catalog.capabilityManifestDigest || data.contract.capabilityGraphDigest !== catalog.capabilityGraphDigest || JSON.stringify(data.contract.requiredScopes) !== JSON.stringify(policy2.requiredScopes)) throw new CanvasError("CAPABILITY_RESULT_MISMATCH", "\u753B\u5E03\u8FD4\u56DE\u7684\u89C4\u5212\u5F15\u7528\u4E0E\u5F53\u524D\u8BF7\u6C42\u4E0D\u4E00\u81F4\uFF0C\u672A\u5F00\u653E\u6267\u884C\u3002");
    return data;
  }
  async read(operation, id = "", scope) {
    if (operation === "status") {
      const { client: client2, discovery } = this.load();
      const instances = await discovery.discoverInstances();
      const selected = this.config.instance ? instances.find((item) => item.instanceId === this.config.instance) : instances.length === 1 ? instances[0] : void 0;
      if (!selected) throw new CanvasError(instances.length > 1 ? "APP_INSTANCE_AMBIGUOUS" : "APP_NOT_RUNNING", instances.length > 1 ? "\u53D1\u73B0\u591A\u4E2A\u753B\u5E03\u5B9E\u4F8B\uFF0C\u8BF7\u6307\u5B9A\u5B9E\u4F8B ID\u3002" : "\u5C1A\u672A\u53D1\u73B0\u8FD0\u884C\u4E2D\u7684\u753B\u5E03\u3002");
      return (await client2.requestAgentControl(selected, "/api/agent-control/v1/status")).data;
    }
    const { client, instance, accessToken } = await this.paired();
    const paths = {
      capabilities: "/capabilities",
      workspaces: "/workspaces",
      models: "/models",
      "capability-graph": "/capability-graph",
      "capability-tools": "/capability-tools",
      task: "/run-intents/",
      "creator-session": "/creator-sessions/"
    };
    if (!(operation in paths)) throw new CanvasError("OPERATION_REFUSED", "\u5F53\u524D\u9002\u914D\u5668\u672A\u5F00\u653E\u6B64\u64CD\u4F5C\u3002");
    if ((operation === "task" || operation === "creator-session") && !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new CanvasError("INVALID_REFERENCE", "\u4EFB\u52A1\u6216\u4F1A\u8BDD\u5F15\u7528\u683C\u5F0F\u65E0\u6548\u3002");
    const scoped = operation === "task" || operation === "creator-session";
    if (scoped && (!scope || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(scope.projectId) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(scope.canvasId))) throw new CanvasError("SCOPE_REQUIRED", "\u67E5\u8BE2\u539F\u4EFB\u52A1\u6216\u521B\u4F5C\u4F1A\u8BDD\u9700\u8981\u660E\u786E\u7684\u9879\u76EE\u548C\u753B\u5E03\u5F15\u7528\u3002");
    const suffix = scoped ? encodeURIComponent(id) + `?projectId=${encodeURIComponent(scope.projectId)}&canvasId=${encodeURIComponent(scope.canvasId)}` : "";
    if (operation === "capability-tools") return this.checkedCatalog({ client, instance, accessToken });
    return (await client.requestAgentControl(instance, "/api/agent-control/v1" + paths[operation] + suffix, { accessToken })).data;
  }
  async status() {
    try {
      const data = await this.read("status");
      return { configured: true, root: this.config.root, digest: this.config.digest, instance: this.config.instance, connected: true, code: "OK", message: "\u753B\u5E03\u63A7\u5236\u9762\u5DF2\u54CD\u5E94\uFF1B\u4E1A\u52A1\u64CD\u4F5C\u4ECD\u9700\u517C\u5BB9\u68C0\u67E5\u4E0E\u73B0\u6709\u914D\u5BF9\u3002", compat: Object.hasOwn(data, "compat") ? data.compat : data };
    } catch (error) {
      const safe = safeCanvasError(error);
      return { configured: true, root: this.config.root, digest: this.config.digest, instance: this.config.instance, connected: false, code: safe.code, message: safe.message, compat: null };
    }
  }
  /** Owner UI diagnosis only. Native exact handshake, no pairing or credential-store reads. */
  async connectionCheck() {
    let instances = [];
    const result = (state, code, message) => canvasConnectionCheckSchema.parse({ binding: this.config, state, code, message, instances });
    try {
      const { client, discovery } = this.load(), live = await discovery.discoverInstances();
      for (const item of live.slice(0, 16)) {
        try {
          const value = { id: item.instanceId, version: String(item.appVersion ?? "").slice(0, 64), port: Number(new URL(item.origin).port) };
          const parsed = canvasConnectionCheckSchema.shape.instances.element.safeParse(value);
          if (parsed.success) instances.push(parsed.data);
        } catch {
        }
      }
      if (live.length > 16) return result("error", "TOO_MANY_INSTANCES", "\u68C0\u6D4B\u5230\u8FC7\u591A\u753B\u5E03\u7A97\u53E3\u3002\u8BF7\u5173\u95ED\u4E0D\u4F7F\u7528\u7684\u753B\u5E03\u540E\u91CD\u65B0\u68C0\u6D4B\u3002");
      if (!live.length) return result("not-running", "APP_NOT_RUNNING", "\u5C1A\u672A\u627E\u5230\u8FD0\u884C\u4E2D\u7684\u753B\u5E03\u3002\u8BF7\u542F\u52A8\u684C\u9762\u753B\u5E03\uFF0C\u518D\u70B9\u51FB\u201C\u91CD\u65B0\u68C0\u6D4B\u201D\u3002");
      if (this.config.instance && !live.some((item) => item.instanceId === this.config.instance)) return result("choose-instance", "INSTANCE_CHANGED", "\u539F\u5148\u8FDE\u63A5\u7684\u753B\u5E03\u5DF2\u5173\u95ED\u6216\u91CD\u542F\uFF0C\u8BF7\u4ECE\u4E0B\u65B9\u9009\u62E9\u5F53\u524D\u7A97\u53E3\u3002");
      if (!this.config.instance && live.length > 1) return result("choose-instance", "APP_INSTANCE_AMBIGUOUS", "\u68C0\u6D4B\u5230\u591A\u4E2A\u8FD0\u884C\u4E2D\u7684\u753B\u5E03\uFF0C\u8BF7\u9009\u62E9\u672C\u6B21\u8981\u4F7F\u7528\u7684\u7A97\u53E3\u3002\u65E0\u9700\u586B\u5199\u5B9E\u4F8B ID\u3002");
      this.load();
      await client.selectInstance(this.config.instance);
      this.load();
      return result("ready", "COMPATIBLE", "\u753B\u5E03\u7248\u672C\u4E0E\u8FDE\u63A5\u5DE5\u5177\u5339\u914D\uFF0C\u53EF\u4EE5\u5728\u4E0B\u65B9\u5B8C\u6210\u7A97\u53E3\u914D\u5BF9\u3002");
    } catch (error) {
      const safe = safeCanvasError(error);
      if (safe.code === "CLI_CHANGED" || safe.code === "ENOENT") return result("needs-review", safe.code, "\u8FDE\u63A5\u5DE5\u5177\u5DF2\u66F4\u65B0\u6216\u79FB\u52A8\u3002\u8BF7\u91CD\u65B0\u68C0\u6D4B\uFF0C\u9009\u62E9\u6B63\u5728\u8FD0\u884C\u7684\u684C\u9762\u753B\u5E03\u5E76\u8FDE\u63A5\u3002");
      if (safe.code.endsWith("_MISMATCH") || safe.code === "APP_VERSION_INCOMPATIBLE") return result("incompatible", safe.code, "\u5F53\u524D\u8FDE\u63A5\u5DE5\u5177\u4E0E\u753B\u5E03\u7248\u672C\u4E0D\u540C\u3002\u8BF7\u70B9\u51FB\u201C\u91CD\u65B0\u68C0\u6D4B\u201D\uFF0C\u4F18\u5148\u8FDE\u63A5\u201C\u6B63\u5728\u8FD0\u884C\u7684\u684C\u9762\u753B\u5E03\u201D\u3002");
      return result(safe.code === "APP_NOT_RUNNING" ? "not-running" : "error", safe.code, safe.message);
    }
  }
};
function safeCanvasError(error) {
  if (error instanceof CanvasError) return error;
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "CANVAS_UNAVAILABLE";
  const messages = {
    APP_NOT_RUNNING: "\u5C1A\u672A\u627E\u5230\u8FD0\u884C\u4E2D\u7684\u753B\u5E03\uFF0C\u8BF7\u542F\u52A8\u684C\u9762\u753B\u5E03\u540E\u5728\u753B\u5E03\u8FDE\u63A5\u9875\u91CD\u65B0\u68C0\u6D4B\u3002",
    APP_INSTANCE_AMBIGUOUS: "\u68C0\u6D4B\u5230\u591A\u4E2A\u753B\u5E03\uFF0C\u8BF7\u5728\u753B\u5E03\u8FDE\u63A5\u9875\u9009\u62E9\u8981\u4F7F\u7528\u7684\u7A97\u53E3\u3002",
    AGENT_CONTROL_TIMEOUT: "\u8FDE\u63A5\u753B\u5E03\u8D85\u65F6\uFF0C\u8BF7\u786E\u8BA4\u753B\u5E03\u4ECD\u5728\u8FD0\u884C\uFF0C\u518D\u5728\u753B\u5E03\u8FDE\u63A5\u9875\u91CD\u65B0\u68C0\u6D4B\u3002",
    APP_CONNECTION_FAILED: "\u753B\u5E03\u6682\u65F6\u65E0\u6CD5\u54CD\u5E94\uFF0C\u8BF7\u5728\u753B\u5E03\u8FDE\u63A5\u9875\u91CD\u65B0\u68C0\u6D4B\u3002",
    PAIRING_REQUIRED: "\u753B\u5E03\u5C1A\u672A\u5B8C\u6210\u914D\u5BF9\uFF0C\u8BF7\u5728\u753B\u5E03\u8FDE\u63A5\u9875\u8FDE\u63A5\uFF0C\u5E76\u5728\u684C\u9762\u753B\u5E03\u7A97\u53E3\u6279\u51C6\u3002",
    CREDENTIAL_STORE_BUSY: "\u53E6\u4E00\u8FDB\u7A0B\u6B63\u5728\u66F4\u65B0\u753B\u5E03\u914D\u5BF9\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002",
    PAIRING_PROGRESS_CHANGED: "\u914D\u5BF9\u8FDB\u5EA6\u5DF2\u88AB\u5176\u4ED6\u8FDB\u7A0B\u66F4\u65B0\uFF0C\u8BF7\u68C0\u67E5\u5F53\u524D\u914D\u5BF9\u3002",
    PAIRING_ALREADY_PENDING: "\u753B\u5E03\u5DF2\u6709\u5F85\u786E\u8BA4\u8FDE\u63A5\uFF0C\u8BF7\u5148\u5728\u753B\u5E03\u7A97\u53E3\u5904\u7406\u3002"
  };
  if (/^[A-Z][A-Z0-9_]{0,80}$/.test(code) && code.endsWith("_MISMATCH")) return new CanvasError(code, "\u753B\u5E03\u4E0E\u8FDE\u63A5\u5DE5\u5177\u7684\u7248\u672C\u4E0D\u5339\u914D\u3002\u8BF7\u5728\u753B\u5E03\u8FDE\u63A5\u9875\u91CD\u65B0\u68C0\u6D4B\uFF0C\u8FDE\u63A5\u6B63\u5728\u8FD0\u884C\u7684\u684C\u9762\u753B\u5E03\uFF1B\u4E0D\u8981\u91CD\u590D\u53D1\u8D77\u914D\u5BF9\u3002");
  if (/^[A-Z][A-Z0-9_]{0,80}$/.test(code)) return new CanvasError(code, messages[code] ?? "\u753B\u5E03\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u68C0\u67E5\u5E94\u7528\u3001\u914D\u5BF9\u4E0E CLI \u517C\u5BB9\u72B6\u6001\u3002");
  return new CanvasError("CANVAS_UNAVAILABLE", "\u753B\u5E03\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u8BF7\u68C0\u67E5\u5E94\u7528\u4E0E\u8FDE\u63A5\u8BBE\u7F6E\u3002");
}

// packages/dsh-zhen/src/canvas-mcp.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z as z4 } from "zod";
function safeOutput(value, key = "") {
  if (/^(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|signature|cookie)$/i.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => safeOutput(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, safeOutput(item, field)]));
  if (typeof value === "string") return value.replace(/\bBearer\s+[^\s,;]+/gi, "[redacted]").replace(/https?:\/\/[^\s"'<>]+/g, (text) => {
    try {
      const url = new URL(text);
      return url.search || url.hash || url.username || url.password ? url.origin + url.pathname + (url.search ? "?[redacted]" : "") + (url.hash ? "#[redacted]" : "") : text;
    } catch {
      return "[redacted-url]";
    }
  });
  return value;
}
function createCanvasMcp(bridge2) {
  const server2 = new McpServer({ name: "dsh-zhen-canvas", version: "0.1.0" }, { maxToolInputElements: 16, instructions: "Read canvas_status, then workspaces and canvas_capability_tools. Use exact tool versions, explicit project/canvas ids and declared L0 operations for plans/previews. These tools do not apply, run, approve or submit paid generation. A plan is not approval or an accepted task. Planning may replace an earlier in-memory plan; preserve the latest plan references. Existing Canvas pairing scopes still apply to local asset/delivery/browser previews. Successful native creative plans appear in Creator Space > Connections > Chat plans for human review; selecting preserves the original plan and does not approve or apply it. Finish pending window approvals before requesting another replacement plan." });
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const response = async (task, preserveCompat = false) => {
    try {
      const raw = await task();
      const data = safeOutput(raw);
      if (preserveCompat && "compat" in raw) data.compat = raw.compat;
      const text = JSON.stringify(data);
      if (Buffer.byteLength(text, "utf8") > 256 * 1024) throw new Error("response limit");
      return { content: [{ type: "text", text }], structuredContent: data };
    } catch (error) {
      const safe = safeCanvasError(error);
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ code: safe.code, message: safe.message }) }] };
    }
  };
  const call = (operation, id) => response(() => bridge2.read(operation, id), operation === "status");
  for (const [name, operation, description] of [
    ["canvas_status", "status", "Read the native public compatibility report unchanged. pairingRequired:true is an authentication policy, NOT the current pairing state. Use canvas_workspaces next to check existing access; never switch to shell or another CLI."],
    ["canvas_capabilities", "capabilities", "Read current canvas capabilities after the official CLI handshake."],
    ["canvas_workspaces", "workspaces", "List projects and canvases allowed by the existing pairing."],
    ["canvas_models", "models", "Read the canvas model catalog. Does not generate or submit."],
    ["canvas_capability_graph", "capability-graph", "Read the existing capability graph and runtime readiness."],
    ["canvas_capability_tools", "capability-tools", "Read exact versioned high-level tools, direct L0 operations and scopes; cross-check the reviewed CLI. No internal handler bindings are exposed."]
  ]) server2.registerTool(name, { description, inputSchema: z4.object({}).strict(), annotations }, () => call(operation));
  for (const [name, operation, description] of [
    ["canvas_task_status", "task", "Query an existing run intent. Never resubmit it."],
    ["canvas_creator_session", "creator-session", "Read an existing creator session."]
  ]) server2.registerTool(name, { description, inputSchema: z4.object({ id: z4.string().regex(/^[A-Za-z0-9_-]{1,128}$/), projectId: canvasEntity, canvasId: canvasEntity }).strict(), annotations }, ({ id, projectId, canvasId }) => response(() => bridge2.read(operation, id, { projectId, canvasId })));
  server2.registerTool("canvas_inspect", { description: "Inspect the current canvas/nodes/run, search assets/subflows, validate or simulate/estimate with the eight existing read-only tools. Explicit project/canvas ids are required. Simulation does not apply changes; unknown cost is not a budget guarantee.", inputSchema: canvasInspectionRequest, annotations: { ...annotations, idempotentHint: false } }, (input) => response(async () => {
    if (!bridge2.inspect) throw new Error("Canvas inspection unavailable.");
    return bridge2.inspect(input);
  }));
  server2.registerTool("canvas_plan", { description: "Use one exact advertised high-level tool/version for a plan, preview, inspect or verify operation. Supports the Canvas creative families without applying edits, running nodes, approving, paying, uploading or packaging. Local import/delivery/browser previews require their existing pairing scopes. Never treat a plan as a submitted task or authorization.", inputSchema: canvasPlanRequest, annotations: { ...annotations, idempotentHint: false } }, (input) => response(async () => {
    if (!bridge2.plan) throw new Error("Canvas planning unavailable.");
    return bridge2.plan(input);
  }));
  return server2;
}

// packages/dsh-zhen/src/canvas-server.ts
var args = process.argv.slice(2);
if (args.length !== 4 && args.length !== 6 || args[0] !== "--cli-root" || args[2] !== "--digest" || !/^[a-f0-9]{64}$/.test(args[3]) || args.length === 6 && args[4] !== "--instance") {
  process.stderr.write("Usage: dsh-zhen-canvas-mcp --cli-root <installed-cli-directory> --digest <reviewed-sha256> [--instance <id>]\n");
  process.exit(2);
}
var bridge = new CanvasBridge({ root: args[1], digest: args[3], instance: args[5] ?? "" });
var server = createCanvasMcp(bridge);
await server.connect(new StdioServerTransport());
