import React from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
export declare function Capabilities({ api, onConversation, onConnections }: {
    api: ZhenRemote;
    onConversation: () => void;
    onConnections: () => void;
}): React.ReactElement;
