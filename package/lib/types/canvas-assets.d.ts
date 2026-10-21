import type { CanvasAsset, CanvasAssets, CanvasAssetsQuery, CanvasReferenceKey } from './canvas-reference-schema.ts';
/** Metadata only: do not retain native locators, media URLs, settings or prompts. */
export declare function canvasAssetView(projectId: string, input: unknown): CanvasAsset;
export declare function canvasAssetsView(input: CanvasAssetsQuery, data: unknown): CanvasAssets;
export declare function canvasAssetKey(asset: CanvasAsset): CanvasReferenceKey;
/** Compare the published t8-model-decision-receipt-v1 attachment evidence.
 * C50 includes fixed vectors produced independently by the original native
 * function and a separate original-native fresh-TEMP integration probe. */
export declare function nativeAttachmentDigest(assets: CanvasAsset[]): string;
