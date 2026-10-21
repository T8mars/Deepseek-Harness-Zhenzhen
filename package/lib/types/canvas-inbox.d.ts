import type { NativeCreativePlan, NativePlanBinding } from './canvas-native-plan.ts';
import type { CanvasCandidateView } from './canvas-inbox-schema.ts';
import type { CanvasConfig } from './canvas.ts';
export interface CanvasPlanCapture {
    config: CanvasConfig;
    sessionId: string;
    callId: string;
}
export interface CanvasInboxEntry {
    config: CanvasConfig;
    plan: NativeCreativePlan;
    binding: NativePlanBinding;
    view: CanvasCandidateView;
}
/** Bounded process-local final-result inbox. No disk, network, native approval,
 * mutation or Agent-submitted plan carrier is accepted here. */
export declare class CanvasInbox {
    private readonly entries;
    clear(): void;
    private prune;
    observe(capture: CanvasPlanCapture, current: CanvasConfig | undefined, args: unknown, value: unknown): void;
    list(config: CanvasConfig | undefined): CanvasCandidateView[];
    get(id: string, config: CanvasConfig | undefined): CanvasInboxEntry | undefined;
    remove(id: string): void;
}
