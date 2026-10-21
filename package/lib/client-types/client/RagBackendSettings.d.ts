import React from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { RagBackendStatus } from 'dsh-zhen';
export declare function RagBackendControls({ status, busy, onConfigure }: {
    status: RagBackendStatus;
    busy: boolean;
    onConfigure: (selected: string, enabled: boolean) => void;
}): React.ReactElement;
export declare function RagBackendSettings({ api }: {
    api: Pick<ZhenRemote, 'ragBackendStatus' | 'ragBackendConfigure'>;
}): React.ReactElement;
