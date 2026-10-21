import React from 'react';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { KnowledgeSource } from 'dsh-zhen';
import { ragPresentationSchema } from 'dsh-zhen/remote';
/** Recorded metadata is display currency only, never authority for another read. */
export declare function ragPresentation(block: {
    isError: boolean;
    meta?: unknown;
}): ReturnType<typeof ragPresentationSchema.safeParse>;
export declare function SourceWindow({ source, onNavigate }: {
    source: KnowledgeSource;
    onNavigate?: (id: string, epoch: number) => void;
}): React.ReactElement;
export declare function RagToolView(props: ToolCallViewProps): React.ReactElement;
