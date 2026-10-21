export interface PdfTextPage {
    page: number;
    text: string;
}
export declare const PDF_TEXT_LIMITS: Readonly<{
    inputBytes: number;
    textBytes: number;
    pages: 200;
    timeoutMs: 30000;
    heapMiB: 256;
    pending: 4;
}>;
/** Fixed local decoder only; no user paths, credentials or source text in argv/logs.
 * The heap flag bounds the V8 heap, not all native decoder memory. Completion
 * waits for process close, including timeout and authorization cancellation. */
export declare function extractPdfPages(input: Uint8Array, assertCurrent?: () => void, timeoutMs?: number): Promise<PdfTextPage[]>;
