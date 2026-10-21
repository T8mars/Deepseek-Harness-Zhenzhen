import type { CanvasConfig } from './canvas.ts';
import type { GatewayMediaReceipt } from './gateway-media-schema.ts';
import type { CanvasTransferInput, CanvasTransferView } from './canvas-transfer-schema.ts';
/** UI references/progress only. Native AssetUploadManager, Blob store and
 * CanvasPatch remain the copy/placement authority. Never invokes generation. */
export declare class CanvasTransfer {
    private readonly file;
    private readonly configured;
    private readonly receipt;
    private queue;
    private closed;
    constructor(file: string, configured: () => CanvasConfig | undefined, receipt: (id: string) => GatewayMediaReceipt | undefined);
    close(): void;
    private serial;
    private current;
    private runtime;
    private read;
    private save;
    private require;
    private match;
    private ownedReceipt;
    private importMatches;
    private asset;
    private findAsset;
    private patchResult;
    snapshot(): CanvasTransferView | null;
    preview(input: CanvasTransferInput): Promise<CanvasTransferView>;
    private approval;
    approve(id: string, confirmed: boolean): Promise<CanvasTransferView>;
    private placeApprovalMatches;
    previewPlacement(id: string): Promise<CanvasTransferView>;
    complete(id: string): Promise<CanvasTransferView>;
    refresh(id: string): Promise<CanvasTransferView>;
}
