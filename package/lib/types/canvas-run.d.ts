import type { CanvasConfig } from './canvas.ts';
import type { CanvasRunSelection, CanvasRunView, CanvasRunNodes } from './canvas-run-schema.ts';
/** UI-only native quote/approval/intent references. The native run_intents,
 * Run/NodeRun/Attempt ledger owns all reservation and Provider execution. */
export declare class CanvasRuns {
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
    snapshot(): CanvasRunView | null;
    private runtime;
    private matches;
    private require;
    nodes(projectId: string, canvasId: string, offset?: number): Promise<CanvasRunNodes>;
    quote(input: CanvasRunSelection): Promise<CanvasRunView>;
    private approval;
    approve(quoteId: string, confirmed: boolean, unknownPriceAccepted: boolean): Promise<CanvasRunView>;
    private intent;
    submit(quoteId: string): Promise<CanvasRunView>;
    refresh(quoteId: string): Promise<CanvasRunView>;
}
