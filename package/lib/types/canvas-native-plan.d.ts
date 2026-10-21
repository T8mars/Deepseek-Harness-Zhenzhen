import { z } from 'zod';
import type { CanvasWorkflowView } from './canvas-workflow-schema.ts';
/** Native public creative-plan projection, including non-generation L1 actions. */
export declare const nativeCreativePlanSchema: z.ZodObject<{
    schema: z.ZodLiteral<"t8-creative-plan-v1">;
    planId: z.ZodString;
    planDigest: z.ZodString;
    projectId: z.ZodString;
    canvasId: z.ZodString;
    canvasRevision: z.ZodNumber;
    action: z.ZodString;
    kind: z.ZodString;
    brief: z.ZodObject<{
        goal: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        profile: z.ZodOptional<z.ZodString>;
        reuseAssetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    ready: z.ZodBoolean;
    candidateCount: z.ZodNumber;
    questions: z.ZodArray<z.ZodObject<{
        question: z.ZodString;
    }, z.core.$strip>>;
    impact: z.ZodObject<{
        patchOperationCount: z.ZodNumber;
    }, z.core.$strip>;
    visibleAssumptions: z.ZodObject<{
        models: z.ZodRecord<z.ZodString, z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
        }, z.core.$strip>>;
        ratio: z.ZodOptional<z.ZodString>;
        durationSec: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    modelDecisionReceipt: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        schema: z.ZodString;
        attachmentEvidenceDigest: z.ZodString;
        providerCalls: z.ZodOptional<z.ZodNumber>;
        canvasWrites: z.ZodOptional<z.ZodNumber>;
        decisions: z.ZodOptional<z.ZodArray<z.ZodObject<{
            required: z.ZodBoolean;
            status: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>>>;
    patchId: z.ZodNullable<z.ZodString>;
    expiresAt: z.ZodISODateTime;
}, z.core.$strip>;
export type NativeCreativePlan = z.infer<typeof nativeCreativePlanSchema>;
export declare const nativePlanBindingSchema: z.ZodObject<{
    action: z.ZodLiteral<"creative.apply">;
    sessionId: z.ZodUUID;
    projectId: z.ZodString;
    canvasId: z.ZodString;
    planDigest: z.ZodString;
}, z.core.$strip>;
export type NativePlanBinding = z.infer<typeof nativePlanBindingSchema>;
export declare function nativePlanView(plan: NativeCreativePlan, id?: `${string}-${string}-${string}-${string}-${string}`): CanvasWorkflowView;
