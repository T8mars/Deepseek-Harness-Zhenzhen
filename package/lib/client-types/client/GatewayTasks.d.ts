import React from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
export declare function GatewayTasks({ api, onSettings, onConnections }: {
    api: ZhenRemote;
    onSettings: () => void;
    onConnections: () => void;
}): React.ReactElement;
