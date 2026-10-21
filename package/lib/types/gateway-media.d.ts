import type { GatewayMediaTicket, GatewayMediaReceipt } from './gateway-media-schema.ts';
export declare class GatewayMediaError extends Error {
    readonly code: 'UNAVAILABLE' | 'EXPIRED' | 'BUSY' | 'DIRECTORY' | 'FILE' | 'LIMIT' | 'CANCELLED';
    constructor(code: 'UNAVAILABLE' | 'EXPIRED' | 'BUSY' | 'DIRECTORY' | 'FILE' | 'LIMIT' | 'CANCELLED');
}
/** Explicit exports only. Source capabilities live in memory; receipts retain
 * the user's output path/hash but never the URL or a copy of generated content.
 */
export declare class GatewayMedia {
    private readonly sources;
    private readonly taskExists;
    private readonly now;
    private readonly root;
    private readonly rootIdentity;
    private readonly db;
    private readonly tickets;
    private readonly completed;
    private active?;
    private generation;
    private closed;
    constructor(root: string, sources: (id: string) => Promise<string[]>, taskExists: (id: string) => boolean, now?: () => number);
    private owned;
    list(): GatewayMediaReceipt[];
    receipt(id: string): GatewayMediaReceipt | undefined;
    forget(id: string): void;
    preview(taskRecordId: string): Promise<GatewayMediaTicket[]>;
    save(id: string, folder: string): Promise<GatewayMediaReceipt>;
    private export;
    cancel(id: string): void;
    revokeTask(id: string): void;
    invalidate(): void;
    close(): Promise<void>;
}
