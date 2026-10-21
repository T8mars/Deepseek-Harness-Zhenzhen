import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { KnowledgeStore } from './knowledge.ts';
import type { ZhenRag } from './rag-service.ts';
export interface RetrievalContext {
    sessionId: string;
    provider: string;
    directory: string;
}
export declare function createRagTool(store: () => KnowledgeStore, context: (execution: ToolRunContext) => Promise<RetrievalContext>, backend?: () => ZhenRag): ToolDefinition;
export declare function createRagOpenTool(store: () => KnowledgeStore, context: (execution: ToolRunContext) => Promise<RetrievalContext>, backend?: () => ZhenRag): ToolDefinition;
