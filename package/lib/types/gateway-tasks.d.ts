import type { GatewayTaskSpec, GatewayTaskProtocol, GatewayTaskCode, GatewayTaskObservation, GatewayTaskRecord } from './gateway-task-schema.ts';
export declare class GatewayTaskError extends Error {
    readonly code: GatewayTaskCode;
    readonly retryMs: number;
    constructor(code: GatewayTaskCode, retryMs?: number);
}
export declare const GATEWAY_TASK_PATHS: Readonly<Record<GatewayTaskProtocol, string>>;
/** Extract safe task facts only. Provider text, prompt, titles, lyrics, quota,
 * legacy cost fields and signed result URLs never enter public observations.
 */
export declare function parseGatewayTask(spec: GatewayTaskSpec, input: unknown, collect?: (sources: string[]) => void): GatewayTaskObservation;
/** Fixed authenticated GETs only. No submit, retry-create, delete or media fetch. */
export declare function readGatewayTask(spec: GatewayTaskSpec, key: string, fetcher?: typeof fetch, signal?: AbortSignal, collect?: (sources: string[]) => void): Promise<GatewayTaskObservation>;
type ResolveKey = () => Promise<string | undefined>;
/** Owned status metadata. No generated media, response bodies or signed URLs.
 * Explicit tracking may resume after restart; each GET resolves ctx.credentials.
 */
export declare class GatewayTasks {
    private readonly resolveKey;
    private readonly fetcher;
    private readonly now;
    private readonly db;
    private active?;
    private closed;
    private generation;
    private readonly media;
    constructor(file: string, resolveKey: ResolveKey, fetcher?: typeof fetch, now?: () => number);
    private get;
    private save;
    list(): GatewayTaskRecord[];
    add(input: GatewayTaskSpec): GatewayTaskRecord;
    tracking(id: string, enabled: boolean): GatewayTaskRecord;
    remove(id: string): void;
    mediaSources(id: string): Promise<string[]>;
    refresh(id: string): Promise<GatewayTaskRecord>;
    private query;
    automatic(): Promise<void>;
    invalidate(): void;
    close(): Promise<void>;
}
export {};
