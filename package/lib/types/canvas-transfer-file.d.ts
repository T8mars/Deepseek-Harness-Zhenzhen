import type { GatewayMediaReceipt } from './gateway-media-schema.ts';
/** Receipt-owned local files only. Native import independently snapshots and
 * verifies the same content again before copying into its managed asset store. */
export declare function verifyTransferFile(receipt: GatewayMediaReceipt, maxBytes: number, active: () => boolean): Promise<void>;
