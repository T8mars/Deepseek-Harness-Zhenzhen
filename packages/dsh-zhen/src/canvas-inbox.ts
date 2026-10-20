import { randomUUID } from 'node:crypto';
import { canvasPlanRequest, canvasPlanResultSchema } from './canvas-contract.ts';
import { nativeCreativePlanSchema, nativePlanBindingSchema, nativePlanView } from './canvas-native-plan.ts';
import type { NativeCreativePlan, NativePlanBinding } from './canvas-native-plan.ts';
import { canvasCandidateSchema, canvasCandidatesSchema } from './canvas-inbox-schema.ts';
import type { CanvasCandidateView } from './canvas-inbox-schema.ts';
import type { CanvasConfig } from './canvas.ts';
export interface CanvasPlanCapture { config: CanvasConfig; sessionId: string; callId: string; }
export interface CanvasInboxEntry { config: CanvasConfig; plan: NativeCreativePlan; binding: NativePlanBinding; view: CanvasCandidateView; }
const sameConfig = (a: CanvasConfig, b: CanvasConfig) => a.root === b.root && a.digest === b.digest && a.instance === b.instance;
/** Bounded process-local final-result inbox. No disk, network, native approval,
 * mutation or Agent-submitted plan carrier is accepted here. */
export class CanvasInbox {
  private readonly entries = new Map<string, CanvasInboxEntry>();
  clear(): void { this.entries.clear(); }
  private prune(): void { for (const [id, entry] of this.entries) if (Date.parse(entry.plan.expiresAt) <= Date.now()) this.entries.delete(id); }
  observe(capture: CanvasPlanCapture, current: CanvasConfig | undefined, args: unknown, value: unknown): void {
    if (!current || !sameConfig(capture.config, current)) return;
    const request = canvasPlanRequest.safeParse(args);
    const packet = canvasPlanResultSchema.safeParse(value && typeof value === 'object' && 'structuredContent' in value ? value.structuredContent : undefined);
    if (!request.success || !packet.success) return;
    const result = packet.data, expected = request.data;
    if (result.tool.name !== expected.tool || result.tool.version !== expected.version || result.tool.operation !== expected.operation || result.request.projectId !== expected.projectId || result.request.canvasId !== expected.canvasId || result.request.clientRequestId !== (expected.clientRequestId ?? null)) return;
    const plan = nativeCreativePlanSchema.safeParse(result.data), binding = nativePlanBindingSchema.safeParse(result.data && typeof result.data === 'object' && 'approvalBinding' in result.data ? result.data.approvalBinding : undefined);
    if (!plan.success || !binding.success || Date.parse(plan.data.expiresAt) <= Date.now() || Date.parse(plan.data.expiresAt) > Date.now() + 31 * 60 * 1000 || plan.data.projectId !== expected.projectId || plan.data.canvasId !== expected.canvasId || binding.data.projectId !== expected.projectId || binding.data.canvasId !== expected.canvasId || binding.data.planDigest !== plan.data.planDigest) return;
    this.prune();
    for (const [id, entry] of this.entries) if (entry.view.sourceSessionId === capture.sessionId && entry.view.sourceCallId === capture.callId) this.entries.delete(id);
    const id = randomUUID();
    const view = canvasCandidateSchema.parse({ id, sourceSessionId: capture.sessionId, sourceCallId: capture.callId, receivedAt: new Date().toISOString(), tool: expected.tool, preview: nativePlanView(plan.data, id) });
    this.entries.set(id, { config: { ...capture.config }, plan: plan.data, binding: binding.data, view });
    while (this.entries.size > 16) this.entries.delete(this.entries.keys().next().value!);
  }
  list(config: CanvasConfig | undefined): CanvasCandidateView[] {
    this.prune();
    // The list is a short locator preview. Adoption uses the retained original
    // plan and returns its complete review, so polling does not retransmit it.
    return canvasCandidatesSchema.parse([...this.entries.values()].filter(entry => config && sameConfig(config, entry.config)).reverse().map(entry => ({ ...entry.view, preview: { ...entry.view.preview, goal: entry.view.preview.goal.slice(0, 241), models: [], questions: [] } })));
  }
  get(id: string, config: CanvasConfig | undefined): CanvasInboxEntry | undefined { this.prune(); const entry = this.entries.get(id); return entry && config && sameConfig(config, entry.config) ? structuredClone(entry) : undefined; }
  remove(id: string): void { this.entries.delete(id); }
}
