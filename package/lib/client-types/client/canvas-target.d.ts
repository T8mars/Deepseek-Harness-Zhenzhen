import type { CanvasWorkspaces } from 'dsh-zhen';
type CanvasTarget = CanvasWorkspaces['canvases'][number];
/** UI identity includes the project; list positions and names are not identities. */
export declare function canvasTargetKey(target: Pick<CanvasTarget, 'projectId' | 'id'>): string;
export declare function selectedCanvasTarget(report: CanvasWorkspaces, key: string): CanvasTarget | undefined;
/** Keep the existing selection; only an explicitly complete singleton can be picked automatically. */
export declare function refreshedCanvasTarget(report: CanvasWorkspaces, previous?: string): string;
export {};
