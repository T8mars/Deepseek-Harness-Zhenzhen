import type { ZhenRemote } from 'dsh-zhen/remote';
import type { DefaultArtInfo, DefaultArtAsset } from 'dsh-zhen';
export interface TransferredArt {
    info: DefaultArtInfo;
    assets: Map<string, {
        descriptor: DefaultArtAsset;
        bytes: Uint8Array<ArrayBuffer>;
    }>;
}
/** Shared by the real client and transport contracts. No URLs or file paths
 * enter an image element; only complete, digest-checked raster bytes do. */
export declare function transferDefaultArt(api: Pick<ZhenRemote, 'defaultArtInfo' | 'defaultArtChunk'>, active?: () => boolean): Promise<TransferredArt>;
