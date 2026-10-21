export declare class GithubReadError extends Error {
    readonly code: 'AUTH' | 'NOT_FOUND' | 'RATE_LIMIT' | 'UNAVAILABLE' | 'CHANGED' | 'RESPONSE';
    constructor(code: 'AUTH' | 'NOT_FOUND' | 'RATE_LIMIT' | 'UNAVAILABLE' | 'CHANGED' | 'RESPONSE');
}
export declare function githubReadMessage(error: unknown): string;
export interface GithubReadSession {
    commit(): Promise<string>;
    feed(revision: string, maxBytes: number): Promise<string>;
    releases(): Promise<string>;
    assertCurrent(): Promise<void>;
    close(): void;
}
/** Fixed first-party read surface only. Credentials come from ctx.credentials;
 * authenticated reads never go to raw URLs, a redirect, or another repository. */
export declare class GithubAccess {
    private readonly credential;
    private readonly fetcher;
    private generation;
    private closed;
    private readonly active;
    constructor(credential: () => Promise<string | undefined>, fetcher?: typeof fetch);
    invalidate(): void;
    close(): void;
    begin(signal?: AbortSignal): Promise<GithubReadSession>;
}
