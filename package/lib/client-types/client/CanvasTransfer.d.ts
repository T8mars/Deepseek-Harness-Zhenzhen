import React from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
export declare function CanvasTransferPanel({ api, receiptId, onConnections }: {
    api: ZhenRemote;
    receiptId: string;
    onConnections: () => void;
}): React.ReactElement;
