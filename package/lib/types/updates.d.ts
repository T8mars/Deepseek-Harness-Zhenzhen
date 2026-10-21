import type { UpdateSource, UpdateReport } from './update-schema.ts';
import type { GithubAccess } from './github-access.ts';
export interface UpdateBaseline {
    dsh: string;
    canvas: string;
    canvasRevision?: string;
    zhen: string;
    gateway: string;
}
type Fetcher = typeof fetch;
export declare function readPublic(url: string, fetcher?: Fetcher, signal?: AbortSignal, maxBytes?: number): Promise<string>;
/** Public metadata only. Discovery never downloads or executes application code. */
export declare function discoverUpdates(baseline: UpdateBaseline, fetcher?: Fetcher, signal?: AbortSignal, github?: GithubAccess): Promise<UpdateSource[]>;
export declare class UpdateMonitor {
    private readonly filename;
    private readonly baseline;
    private readonly fetcher;
    private readonly github?;
    private pending?;
    constructor(filename: string, baseline: UpdateBaseline, fetcher?: Fetcher, github?: GithubAccess | undefined);
    snapshot(): UpdateReport;
    private save;
    setAutomatic(enabled: boolean): void;
    check(signal?: AbortSignal): Promise<UpdateReport>;
    automaticCheck(signal?: AbortSignal): Promise<void>;
}
export {};
