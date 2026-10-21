import type { KnowledgeImportReport } from './knowledge-import-schema.ts';
export interface KnowledgeCollection {
    id: string;
    project: string;
    name: string;
    root: string;
    epoch: number;
    enabled: boolean;
    cloudProvider: string;
    agentEnabled: boolean;
    documents: number;
}
export interface KnowledgeHit {
    id: string;
    collectionId: string;
    collectionName: string;
    path: string;
    line: number;
    text: string;
    epoch: number;
    page?: number;
}
export interface KnowledgeSource {
    anchorId: string;
    sections: KnowledgeHit[];
    firstSection: number;
    totalSections: number;
    earlierId: string | null;
    laterId: string | null;
}
export interface ImportResult {
    indexed: number;
    skipped: number;
    failed: number;
}
export interface KnowledgeBinding {
    project: string;
    root: string;
    epoch: number;
}
export interface KnowledgeRetrievalScope {
    readonly project: string;
    readonly root: string;
    readonly bindingEpoch: number;
    readonly collections: readonly {
        readonly id: string;
        readonly epoch: number;
    }[];
}
export interface KnowledgeSelection {
    readonly id: string;
    readonly epoch: number;
}
export interface KnowledgeIndexPage {
    items: KnowledgeHit[];
    next: string | null;
}
/** NFKC text + Chinese character/bigram and Latin word terms, encoded for an FTS grammar-safe query. */
export declare function lexicalTerms(text: string): string[];
/** Own local index only. Collection authorization is evaluated on every search and citation read. */
export declare class KnowledgeStore {
    private readonly db;
    private readonly importReports;
    constructor(path: string);
    close(): void;
    /** Local owner diagnostics only; never return stale paths after an epoch change. */
    importReport(project: string, id: string): KnowledgeImportReport | null;
    binding(project: string): KnowledgeBinding | null;
    bind(project: string, directory: string): Promise<KnowledgeBinding | null>;
    hasSessionGrants(sessionId: string): boolean;
    /** Check every historical agent-retrieval grant before another provider request. */
    assertSessionAllowed(sessionId: string, provider: string, directory: string): Promise<void>;
    private retrievalScope;
    private scopeAt;
    /** Query-scoped pages for trusted local index builders; scanning does not grant model access. */
    retrievalPage(sessionId: string, provider: string, directory: string, scope: KnowledgeRetrievalScope, after: string | null): Promise<KnowledgeIndexPage>;
    /** A backend selects identifiers only. Canonical content and grants stay in this authority. */
    retrieveForAgent(sessionId: string, provider: string, directory: string, query: string, select?: (scope: KnowledgeRetrievalScope) => Promise<readonly KnowledgeSelection[]>): Promise<KnowledgeHit[]>;
    private collection;
    create(project: string, name: string, folder: string): Promise<KnowledgeCollection>;
    list(project: string): KnowledgeCollection[];
    setAccess(project: string, id: string, enabled: boolean, cloudProvider: string): void;
    setAgentAccess(project: string, id: string, enabled: boolean): void;
    index(project: string, id: string): Promise<ImportResult>;
    search(project: string, query: string, provider?: string): KnowledgeHit[];
    private questionSearch;
    /** Read a bounded window of the authorized local index, without a cloud grant. */
    source(project: string, hitId: string, epoch: number): KnowledgeSource;
    /** Model reads require a previous retrieval grant in this exact bound session. */
    sourceForAgent(sessionId: string, provider: string, directory: string, hitId: string, epoch: number): Promise<KnowledgeSource>;
    /** Revalidate a selected citation at use time. Caller must separately obtain cloud-send permission. */
    citation(project: string, hitId: string, epoch: number, provider: string): KnowledgeHit;
}
