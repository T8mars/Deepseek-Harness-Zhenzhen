import type { KnowledgeStore, KnowledgeHit, KnowledgeSource, KnowledgeSelection, KnowledgeIndexPage } from './knowledge.ts';
import type { RagBackendStatus } from './rag-backend-schema.ts';
export interface RagContext {
    sessionId: string;
    provider: string;
    directory: string;
}
export interface RagProviderScope {
    readonly project: string;
    readonly collections: readonly {
        readonly id: string;
        readonly epoch: number;
    }[];
    readonly signal: AbortSignal;
    lexical(): readonly KnowledgeSelection[];
    scan(after?: string | null): Promise<KnowledgeIndexPage>;
}
/** Trusted Host extension. Returns identifiers, never its own snippets or permission decisions. */
export interface RagSearchProvider {
    readonly id: string;
    readonly label: string;
    search(query: string, scope: RagProviderScope): Promise<readonly KnowledgeSelection[]> | readonly KnowledgeSelection[];
}
export declare class ZhenRag {
    private readonly store;
    private readonly file?;
    private readonly timeoutMs;
    private readonly providers;
    private settings;
    private valid;
    private closed;
    private revision;
    private operations;
    constructor(store: () => KnowledgeStore, file?: string | undefined, timeoutMs?: number);
    register(provider: RagSearchProvider): () => void;
    private changed;
    snapshot(): RagBackendStatus;
    configure(selected: string, enabled: boolean, expectedRevision: string): RagBackendStatus;
    assertAvailable(): void;
    assertRevision(revision: string): void;
    search(context: RagContext, query: string, signal: AbortSignal): Promise<KnowledgeHit[]>;
    source(context: RagContext, id: string, epoch: number, signal: AbortSignal): Promise<KnowledgeSource>;
    close(): void;
}
