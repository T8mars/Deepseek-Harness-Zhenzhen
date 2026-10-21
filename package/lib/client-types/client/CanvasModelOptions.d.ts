import React from 'react';
import type { ZhenRemote } from 'dsh-zhen/remote';
import type { CanvasModels, CanvasModelChoices, CanvasWorkflowInput } from 'dsh-zhen';
export declare function NativeModelSelect({ page, choice, disabled, onChange, id }: {
    page?: CanvasModels;
    choice?: {
        provider: string;
        model: string;
    };
    disabled: boolean;
    onChange: (choice?: {
        provider: string;
        model: string;
    }) => void;
    id: string;
}): React.ReactElement;
export declare function CanvasModelOptions({ api, projectId, canvasId, kind, online, disabled, value, onChange }: {
    api: ZhenRemote;
    projectId: string;
    canvasId: string;
    kind: CanvasWorkflowInput['kind'];
    online: boolean;
    disabled: boolean;
    value: CanvasModelChoices;
    onChange: (value: CanvasModelChoices) => void;
}): React.ReactElement;
