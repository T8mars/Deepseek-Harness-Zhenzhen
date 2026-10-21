import React from 'react';
import { z } from 'zod';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { CanvasWorkflowView } from 'dsh-zhen';
declare const projection: z.ZodObject<{
    schema: z.ZodLiteral<"t8-creative-plan-v1">;
    planId: z.ZodString;
    planDigest: z.ZodString;
    projectId: z.ZodString;
    canvasId: z.ZodString;
    kind: z.ZodString;
    brief: z.ZodObject<{
        goal: z.ZodString;
    }, z.core.$strip>;
    ready: z.ZodBoolean;
    expiresAt: z.ZodISODateTime;
    approvalBinding: z.ZodObject<{
        action: z.ZodLiteral<"creative.apply">;
        sessionId: z.ZodUUID;
        projectId: z.ZodString;
        canvasId: z.ZodString;
        planDigest: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type CanvasPlanPresentation = Pick<z.infer<typeof projection>, 'planId' | 'planDigest' | 'kind' | 'ready' | 'expiresAt'> & {
    goal: string;
};
/** A recorded result is display metadata; it never authorizes applying or running a plan. */
export declare function canvasPlanPresentation(block: {
    isError: boolean;
    content: readonly {
        type: string;
        text?: string;
    }[];
}): CanvasPlanPresentation | null;
type PlanApi = Pick<ZhenRemote, 'canvasCandidates' | 'canvasCandidateAdopt'>;
/** Recheck current server-owned candidates before selecting the exact original plan. */
export declare function reviewCanvasPlan(api: PlanApi, plan: CanvasPlanPresentation, callId: string): Promise<CanvasWorkflowView>;
export declare function CanvasPlanCard({ plan, busy, notice, onReview, onConnections, inspect }: {
    plan: CanvasPlanPresentation;
    busy: boolean;
    notice: string;
    onReview: () => void;
    onConnections: () => void;
    inspect?: () => void;
}): React.ReactElement;
export declare function CanvasPlanToolView(props: ToolCallViewProps & {
    api: PlanApi;
    onOpen: () => void;
}): React.ReactElement;
export {};
