import type { DefaultArtInfo } from 'dsh-zhen';
export type ArtSlot = 'portrait' | 'portrait-dark' | 'mark' | 'mark-dark' | 'hero-mark' | 'hero-mark-dark';
export type ArtMode = 'auto' | 'stage' | 'peek' | 'mark' | 'off';
export interface ArtPreferences {
    mode: ArtMode;
    x: number;
    y: number;
    scale: number;
    artist: string;
    source: string;
    license: string;
}
export interface ArtAsset {
    blob: Blob;
    name: string;
    width: number;
    height: number;
    url: string;
}
interface StoredArt {
    loaded: boolean;
    assets: Partial<Record<ArtSlot, ArtAsset>>;
    preferences: ArtPreferences;
    storageError: boolean;
}
export interface ArtSnapshot extends StoredArt {
    customSlots: ArtSlot[];
    defaultArt: {
        status: 'none' | 'loading' | 'ready' | 'unavailable';
        pack: Extract<DefaultArtInfo, {
            state: 'ready';
        }>['pack'] | null;
    };
}
export declare const DEFAULT_ART_PREFERENCES: ArtPreferences;
/** The caller owns default Blob URLs; browser imports never enter this map. */
export declare function setDefaultArt(status: ArtSnapshot['defaultArt']['status'], pack?: ArtSnapshot['defaultArt']['pack'], assets?: StoredArt['assets']): void;
export declare function useArt(): ArtSnapshot;
export declare function saveArt(slot: ArtSlot, file: File): Promise<void>;
export declare function removeArt(slot: ArtSlot): Promise<void>;
export declare function saveArtPreferences(next: ArtPreferences): Promise<void>;
/** Directory import reads only manifest-listed files, with one atomic storage transaction. */
export declare function importArtDirectory(files: File[]): Promise<void>;
export {};
