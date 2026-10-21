export declare const DOCX_LIMITS: Readonly<{
    inputBytes: number;
    xmlBytes: number;
    metadataBytes: number;
    textBytes: number;
    entries: 512;
    depth: 128;
    timeoutMs: 30000;
    heapMiB: 256;
    pending: 4;
}>;
/** Main-story paragraphs/table cells in document order. Does not render Word,
 * execute fields/macros, load relationships or infer layout/page numbers. */
export declare function parseDocx(input: Uint8Array): string;
