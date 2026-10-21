import React from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { CanvasAsset, CanvasWorkflowInput } from 'dsh-zhen';
export declare function ReferenceSelection({ items, selected, disabled, onChange }: {
    items: CanvasAsset[];
    selected: CanvasAsset[];
    disabled: boolean;
    onChange: (items: CanvasAsset[]) => void;
}): React.ReactElement;
export declare function CanvasReferences({ api, projectId, canvasId, kind, online, disabled, value, onChange }: {
    api: ZhenRemote;
    projectId: string;
    canvasId: string;
    kind: CanvasWorkflowInput['kind'];
    online: boolean;
    disabled: boolean;
    value: CanvasAsset[];
    onChange: (items: CanvasAsset[]) => void;
}): React.ReactElement | null;
