import type { CanvasConfig } from './canvas.ts';
import type { CanvasWorkflowInput, CanvasWorkflowView, CanvasWorkspaces, CanvasModels, CanvasModelsQuery } from './canvas-workflow-schema.ts';
import type { CanvasAssets, CanvasAssetsQuery } from './canvas-reference-schema.ts';
import type { CanvasInboxEntry } from './canvas-inbox.ts';
/** UI-only two-step application of native creative plans. No Agent tool, model
 * submission, private patch executor or automatic approval is registered. */
export declare class CanvasWorkflow {
    private readonly file;
    private readonly configured;
    private queue;
    private closed;
    constructor(file: string, configured: () => CanvasConfig | undefined);
    close(): void;
    private serial;
    private current;
    private read;
    private save;
    private binding;
    private matches;
    private currentSession;
    private readModels;
    models(input: CanvasModelsQuery): Promise<CanvasModels>;
    private referenceScope;
    private readAssets;
    assets(input: CanvasAssetsQuery): Promise<CanvasAssets>;
    private readReferences;
    private referencesCurrent;
    private required;
    snapshot(): CanvasWorkflowView | null;
    private available;
    private stage;
    adopt(entry: CanvasInboxEntry): Promise<CanvasWorkflowView>;
    workspaces(): Promise<CanvasWorkspaces>;
    preview(input: CanvasWorkflowInput): Promise<CanvasWorkflowView>;
    approve(id: string, confirmation: boolean): Promise<CanvasWorkflowView>;
    complete(id: string): Promise<CanvasWorkflowView>;
}
