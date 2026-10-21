export declare class MediaDownloadError extends Error {
    readonly code: 'SOURCE' | 'NETWORK' | 'EXPIRED' | 'LIMIT' | 'FORMAT' | 'CANCELLED' | 'FILE';
    constructor(code: 'SOURCE' | 'NETWORK' | 'EXPIRED' | 'LIMIT' | 'FORMAT' | 'CANCELLED' | 'FILE');
}
export declare function publicMediaAddress(address: string): boolean;
/** Every DNS answer must be public. The chosen answer is supplied directly to
 * the HTTP connection, so it cannot be resolved again between check and use.
 */
export declare function mediaTarget(raw: string, signal: AbortSignal): Promise<{
    url: URL;
    address: string;
    family: 4 | 6;
}>;
export interface MediaBytes {
    bytes: number;
    sha256: string;
    extension: string;
    mime: string;
}
export declare const MEDIA_MAX_BYTES: number;
/** Anonymous media GET only: no API Authorization, cookie, Referer or ambient
 * proxy/agent. Redirect targets are checked and pinned separately. No decoding,
 * archive extraction or program execution is performed.
 */
export declare function downloadMedia(raw: string, file: string, signal?: AbortSignal, maxBytes?: number, beforeWrite?: () => void): Promise<MediaBytes>;
