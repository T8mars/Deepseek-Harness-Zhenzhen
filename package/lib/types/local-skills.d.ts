import type { SkillProvider } from '@deepseek-ai/dsh-skill';
import type { LocalSkillDraft, LocalSkillBody, LocalSkillMode, LocalSkillView } from './local-skills-schema.ts';
/** Local mutable sources, separate from immutable published market releases.
 * Only SKILL.md is read; resources retain their original paths. No install hook,
 * dependency, program or provider action is executed by connection/discovery.
 */
export declare class LocalSkills {
    private readonly file;
    private readonly pollMs;
    private sources;
    private serialized;
    private readonly listeners;
    private readonly watches;
    private closed;
    private generation;
    constructor(file: string, pollMs?: number);
    private reload;
    private save;
    subscribe(listener: () => void): () => void;
    private changed;
    private root;
    private read;
    private scan;
    preview(folder: string, mode: LocalSkillMode): Promise<LocalSkillDraft>;
    body(folder: string, directory: string, expectedDigest: string): Promise<LocalSkillBody>;
    connect(folder: string, mode: LocalSkillMode, expectedDigest: string, policy: string): Promise<void>;
    disable(id: string): void;
    disconnect(id: string): void;
    private syncWatches;
    private collect;
    list(): Promise<LocalSkillView[]>;
    provider(): SkillProvider;
    close(): void;
}
