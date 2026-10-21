/** Capture only manifest-listed raster files. Shared by the separate art ZIP
 * packer and the local default-art reader, without reading unlisted files. */
export declare function inspectArtSource(directory: string, { release }?: {
    release?: boolean | undefined;
}): {
    manifest: import("./client/art-validation.ts").ArtManifest;
    files: Map<string, Buffer<ArrayBufferLike>>;
    sha256: string;
};
