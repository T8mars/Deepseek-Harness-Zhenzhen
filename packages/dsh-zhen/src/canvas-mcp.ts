import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { safeCanvasError } from './canvas.ts';
import type { CanvasOperation } from './canvas.ts';
import { canvasPlanRequest, canvasInspectionRequest, canvasEntity } from './canvas-contract.ts';
import type { CanvasPlanRequest, CanvasInspectionRequest } from './canvas-contract.ts';

export interface CanvasReader {
  read(operation: CanvasOperation, id?: string, scope?: { projectId: string; canvasId: string }): Promise<Record<string, unknown>>;
  plan?(request: CanvasPlanRequest): Promise<Record<string, unknown>>;
  inspect?(request: CanvasInspectionRequest): Promise<Record<string, unknown>>;
}

function safeOutput(value: unknown, key = ''): unknown {
  if (/^(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|signature|cookie)$/i.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map(item => safeOutput(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, safeOutput(item, field)]));
  if (typeof value === 'string') return value.replace(/\bBearer\s+[^\s,;]+/gi, '[redacted]').replace(/https?:\/\/[^\s"'<>]+/g, text => { try { const url = new URL(text); return url.search || url.hash || url.username || url.password ? url.origin + url.pathname + (url.search ? '?[redacted]' : '') + (url.hash ? '#[redacted]' : '') : text; } catch { return '[redacted-url]'; } });
  return value;
}

/** No pairing, spawning, writing, or paid side effects occur during server creation/listing. */
export function createCanvasMcp(bridge: CanvasReader): McpServer {
  const server = new McpServer({ name: 'dsh-zhen-canvas', version: '0.1.0' }, { maxToolInputElements: 16, instructions: 'Read canvas_status, then workspaces and canvas_capability_tools. Use exact tool versions, explicit project/canvas ids and declared L0 operations for plans/previews. These tools do not apply, run, approve or submit paid generation. A plan is not approval or an accepted task. Planning may replace an earlier in-memory plan; preserve the latest plan references. Existing Canvas pairing scopes still apply to local asset/delivery/browser previews. Successful native creative plans appear in Creator Space > Connections > Chat plans for human review; selecting preserves the original plan and does not approve or apply it. Finish pending window approvals before requesting another replacement plan.' });
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const response = async (task: () => Promise<Record<string, unknown>>, preserveCompat = false) => {
    try {
      const raw = await task();
      const data = safeOutput(raw) as Record<string, unknown>;
      if (preserveCompat && 'compat' in raw) data.compat = raw.compat;
      const text = JSON.stringify(data);
      if (Buffer.byteLength(text, 'utf8') > 256 * 1024) throw new Error('response limit');
      return { content: [{ type: 'text' as const, text }], structuredContent: data };
    } catch (error) {
      const safe = safeCanvasError(error);
      return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ code: safe.code, message: safe.message }) }] };
    }
  };
  const call = (operation: CanvasOperation, id?: string) => response(() => bridge.read(operation, id), operation === 'status');
  for (const [name, operation, description] of [
    ['canvas_status', 'status', 'Read the native public compatibility report unchanged. pairingRequired:true is an authentication policy, NOT the current pairing state. Use canvas_workspaces next to check existing access; never switch to shell or another CLI.'],
    ['canvas_capabilities', 'capabilities', 'Read current canvas capabilities after the official CLI handshake.'],
    ['canvas_workspaces', 'workspaces', 'List projects and canvases allowed by the existing pairing.'],
    ['canvas_models', 'models', 'Read the canvas model catalog. Does not generate or submit.'],
    ['canvas_capability_graph', 'capability-graph', 'Read the existing capability graph and runtime readiness.'],
    ['canvas_capability_tools', 'capability-tools', 'Read exact versioned high-level tools, direct L0 operations and scopes; cross-check the reviewed CLI. No internal handler bindings are exposed.'],
  ] as const) server.registerTool(name, { description, inputSchema: z.object({}).strict(), annotations }, () => call(operation));
  for (const [name, operation, description] of [
    ['canvas_task_status', 'task', 'Query an existing run intent. Never resubmit it.'],
    ['canvas_creator_session', 'creator-session', 'Read an existing creator session.'],
  ] as const) server.registerTool(name, { description, inputSchema: z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), projectId: canvasEntity, canvasId: canvasEntity }).strict(), annotations }, ({ id, projectId, canvasId }) => response(() => bridge.read(operation, id, { projectId, canvasId })));
  server.registerTool('canvas_inspect', { description: 'Inspect the current canvas/nodes/run, search assets/subflows, validate or simulate/estimate with the eight existing read-only tools. Explicit project/canvas ids are required. Simulation does not apply changes; unknown cost is not a budget guarantee.', inputSchema: canvasInspectionRequest, annotations: { ...annotations, idempotentHint: false } }, input => response(async () => {
    if (!bridge.inspect) throw new Error('Canvas inspection unavailable.');
    return bridge.inspect(input);
  }));
  server.registerTool('canvas_plan', { description: 'Use one exact advertised high-level tool/version for a plan, preview, inspect or verify operation. Supports the Canvas creative families without applying edits, running nodes, approving, paying, uploading or packaging. Local import/delivery/browser previews require their existing pairing scopes. Never treat a plan as a submitted task or authorization.', inputSchema: canvasPlanRequest, annotations: { ...annotations, idempotentHint: false } }, input => response(async () => {
    if (!bridge.plan) throw new Error('Canvas planning unavailable.');
    return bridge.plan(input);
  }));
  return server;
}
