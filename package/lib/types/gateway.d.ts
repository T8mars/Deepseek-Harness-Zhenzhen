/** Host-only, bounded read operations. No media submit operation is exported. */
export interface Wallet {
    amount: number;
    usedAmount: number;
    currency: string;
    checkedAt: string;
}
export declare class GatewayError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function readWallet(key: string, fetcher?: typeof fetch, signal?: AbortSignal): Promise<Wallet>;
