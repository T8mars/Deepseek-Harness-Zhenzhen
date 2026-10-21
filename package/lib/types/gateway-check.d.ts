import type { PreparedLlmCall } from '@deepseek-ai/dsh-llm';
import type { GatewayCheckReceipt, GatewayCheckPreview } from './gateway-check-schema.ts';
type Prepare = (signal: AbortSignal) => Promise<PreparedLlmCall>;
/** One explicit short paid check, never a background task or an Agent tool.
 * Receipts contain fixed request facts and counts, never credentials/replies.
 */
export declare class GatewayChecks {
    private readonly prepare;
    private readonly now;
    private readonly db;
    private readonly owner;
    private readonly pending;
    private readonly active;
    private generation;
    private preparing;
    private closing;
    constructor(file: string, prepare: Prepare, now?: () => number);
    private save;
    private get;
    list(): GatewayCheckReceipt[];
    preview(): Promise<GatewayCheckPreview>;
    run(id: string, confirmation: string): Promise<GatewayCheckReceipt>;
    private execute;
    cancel(id: string): GatewayCheckReceipt;
    invalidate(): void;
    close(): Promise<void>;
}
export {};
