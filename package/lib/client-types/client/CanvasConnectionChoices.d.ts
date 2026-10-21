import React from 'react';
import type { CanvasSetupDiscovery } from 'dsh-zhen';
export declare function CanvasConnectionChoices({ discovery, busy, onConnect }: {
    discovery?: CanvasSetupDiscovery;
    busy: boolean;
    onConnect: (root: string, digest: string) => void;
}): React.ReactElement;
