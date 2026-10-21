export interface ArtDimensions {
    type: 'image/png' | 'image/jpeg' | 'image/webp';
    width: number;
    height: number;
}
export declare const MAX_ART_BYTES: number;
export type ArtManifestSlot = 'hero-portrait' | 'hero-mark' | 'sidebar-mark';
export interface ArtManifestAsset {
    src: string;
    w?: number;
    h?: number;
}
export interface ArtManifest {
    schema: 'dsh-zhen-character-set';
    version: 1;
    id: string;
    displayName: {
        'zh-CN': string;
        en?: string;
    };
    credit: {
        artist: string;
        source: string;
        url: string;
    };
    license: {
        spdx: string;
        summary: string;
        notice?: string;
        redistribution: 'allowed' | 'denied' | 'unknown';
        commercialUse: 'allowed' | 'denied' | 'unknown';
        derivativeOfCommunityCharacter: boolean;
        confirmedByUser: boolean;
        confirmedAt: string | null;
    };
    focus: {
        x: number;
        y: number;
        scale: number;
    };
    slots: Partial<Record<ArtManifestSlot, ArtManifestAsset>>;
    variants: {
        dark: Partial<Record<ArtManifestSlot, ArtManifestAsset>>;
    };
}
export declare function artPath(value: unknown): string;
export declare function validateArtManifest(input: unknown, release?: boolean): ArtManifest;
export declare function artDimensions(bytes: Uint8Array): ArtDimensions;
