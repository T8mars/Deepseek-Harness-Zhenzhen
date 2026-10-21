import type { SkillProvider } from '@deepseek-ai/dsh-skill';
import type { MarketItem, SkillPackage, SkillAutoPolicy } from './market-schema.ts';
export declare function verifySkill(input: unknown): SkillPackage;
export declare function readBundledCatalog(): SkillPackage[];
/** Own immutable instruction store. Never writes upstream skill or session directories. */
export declare class SkillMarket {
    private readonly db;
    private readonly catalog;
    private readonly bundled;
    private listeners;
    constructor(filename: string, catalog: SkillPackage[]);
    close(): void;
    subscribe(listener: () => void): () => void;
    private changed;
    private selected;
    private automaticEnabled;
    /** Internal receipt for bytes actually fetched through the fixed source.
     * This is local provenance bookkeeping, not a publisher signature. */
    recordVerifiedFeed(inputs: SkillPackage[], revision: string): void;
    hasVerifiedFeed(inputs: SkillPackage[], revision: string): boolean;
    autoPolicy(): SkillAutoPolicy;
    setAutoUpdates(enabled: boolean): void;
    pauseAutoUpdate(id: string, paused: boolean): void;
    /** Only the fixed, fully validated text feed can schedule this path. A user's
     * source policy replaces per-release confirmation, never tool authorization. */
    stageAutomaticUpdates(inputs: SkillPackage[], revision: string): number;
    private stored;
    private save;
    /** Validate the entire first-party text feed before replacing any candidates.
     * No selection, running body or personal fork is changed by discovery. */
    validateRemoteCatalog(inputs: SkillPackage[]): SkillPackage[];
    offerRemoteCatalog(inputs: SkillPackage[]): void;
    list(): MarketItem[];
    preview(id: string, digest: string, version?: string): SkillPackage;
    select(id: string, digest: string, version?: string): void;
    disable(id: string): void;
    cancelPending(id: string): void;
    versions(id: string): SkillPackage[];
    fork(id: string, digest: string, body: string, version?: string): string;
    provider(): SkillProvider;
}
export declare function skillBody(content: string): string;
