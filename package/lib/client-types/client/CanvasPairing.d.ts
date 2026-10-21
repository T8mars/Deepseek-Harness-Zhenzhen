import React from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
export declare function CanvasPairingPanel({ api, online, onPairedChange }: {
    api: ZhenRemote;
    online: boolean;
    onPairedChange?: (paired: boolean) => void;
}): React.ReactElement;
