export { DOCX_LIMITS } from './docx-parse.ts';
/** Fixed local child, binary IPC only. The archive inflater has its own bounded
 * output; heapMiB is an additional V8 limit, not an OS memory guarantee. */
export declare function extractDocxText(input: Uint8Array, assertCurrent?: () => void, timeoutMs?: number): Promise<string>;
