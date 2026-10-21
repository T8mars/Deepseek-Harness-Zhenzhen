import type { SkillProvider } from '@deepseek-ai/dsh-skill';
import type { GithubSkillSpec, GithubSkillSourceView, GithubSkillSummary, GithubSkillPreview, GithubSkillFilePreview } from './github-skills-schema.ts';
export declare class GithubSkillError extends Error {
    constructor(message: string);
}
export declare function githubSkillPath(path: string, allowEmpty?: boolean): string;
export declare function normalizeGithubSkillSpec(input: GithubSkillSpec): GithubSkillSpec;
type TreeEntry = {
    path: string;
    type: string;
    mode: string;
    sha: string;
    size?: number;
};
export declare function githubTreeHash(entries: TreeEntry[]): string;
/** Public GitHub data snapshots. No Git checkout, hook, dependency installer,
 * ambient credential or repository-supplied command participates in download.
 */
export declare class GithubSkills {
    private readonly fetcher;
    private readonly root;
    private sources;
    private serialized;
    private readonly listeners;
    private readonly mounted;
    private busy;
    private closed;
    private readonly lifetime;
    private downloading?;
    constructor(root: string, fetcher?: typeof fetch);
    private owned;
    private get stateFile();
    private reload;
    private save;
    subscribe(listener: () => void): () => void;
    private changed;
    private releaseRoot;
    private release;
    private verify;
    list(): GithubSkillSourceView[];
    history(id: string): GithubSkillSummary[];
    inspect(id: string, digest: string): GithubSkillPreview;
    file(id: string, digest: string, location: 'package' | 'origin', path: string): GithubSkillFilePreview;
    private raw;
    download(input: GithubSkillSpec, signal?: AbortSignal): Promise<GithubSkillPreview>;
    approve(id: string, digest: string, confirmation: string): void;
    disable(id: string): void;
    forget(id: string): void;
    cancelPending(id: string): void;
    cancelDownload(): void;
    automatic(id: string, enabled: boolean): void;
    check(id: string, signal?: AbortSignal): Promise<void>;
    automaticCheck(signal?: AbortSignal): Promise<void>;
    deleteRelease(id: string, digest: string): void;
    provider(): SkillProvider;
    close(): void;
}
export {};
