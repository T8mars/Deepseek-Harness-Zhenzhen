import type { DefaultArtInfo, DefaultArtChunkRequest, DefaultArtChunk } from './default-art-schema.ts';
export declare class DefaultArt {
    private view;
    private readonly files;
    private closed;
    constructor(config: {
        root?: string;
        digest?: string;
    });
    info(): DefaultArtInfo;
    chunk(input: DefaultArtChunkRequest): DefaultArtChunk;
    close(): void;
}
