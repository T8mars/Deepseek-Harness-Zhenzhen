import type { CanvasConfig } from './canvas.ts';
import type { CanvasTaskScope, CanvasTaskReference, CanvasTaskList, CanvasTaskDetail } from './canvas-task-schema.ts';
/** Read the existing native ledger only. No local task ledger, Provider request,
 * submission, retry, cancellation, approval or polling side effect. */
export declare class CanvasTasks {
    private readonly configured;
    private closed;
    constructor(configured: () => CanvasConfig | undefined);
    close(): void;
    private current;
    private read;
    private checked;
    private summary;
    list(input: CanvasTaskScope): Promise<CanvasTaskList>;
    detail(input: CanvasTaskReference): Promise<CanvasTaskDetail>;
}
