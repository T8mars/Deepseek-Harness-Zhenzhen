import type { CanvasConfig } from './canvas.ts';
import type { CanvasPairingView } from './canvas-pairing-schema.ts';
/** A non-secret locator binds only this UI's pairing to the original CLI store.
 * Poll secrets and access tokens never enter this file, Remote results or MCP. */
export declare class CanvasPairing {
    private readonly file;
    private readonly configured;
    private queue;
    private closed;
    private starting?;
    private completing?;
    constructor(file: string, configured: () => CanvasConfig | undefined);
    close(): void;
    private serial;
    private current;
    private binding;
    private read;
    private save;
    private clear;
    private own;
    private pending;
    private requirePending;
    private session;
    snapshot(): Promise<CanvasPairingView>;
    begin(handoff?: boolean, writable?: boolean, runnable?: boolean, assetTransfer?: boolean): Promise<CanvasPairingView>;
    complete(): Promise<CanvasPairingView>;
}
