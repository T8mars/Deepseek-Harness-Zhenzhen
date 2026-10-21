import type { McpId, McpRelease, McpInstallation, McpSelection, McpMarketSnapshot } from './mcp-market-schema.ts';
export declare function canonicalMcpWorkspace(path: string): string;
export declare function mcpChildEnvironment(extra?: Record<string, string>): NodeJS.ProcessEnv;
export declare function mcpNodeCompatible(range: string): boolean;
/** The complete installed JS dependency tree is pinned, including the lockfile.
 * Data lives outside this tree. Bin shims are never used by the launcher. */
export declare function inspectMcpInstallation(directory: string): {
    digest: string;
    packages: number;
};
export declare function inspectMcpRelease(idInput: string, version: string, fetcher?: typeof fetch, signal?: AbortSignal): Promise<McpRelease>;
declare function installDependencies(root: string, cache: string, signal?: AbortSignal): Promise<void>;
export declare class McpMarket {
    private readonly fetcher;
    private readonly installer;
    readonly root: string;
    private state;
    private readonly grants;
    private checking?;
    private installing;
    private automaticRunning?;
    private readonly downloadAttempts;
    constructor(root: string, fetcher?: typeof fetch, installer?: typeof installDependencies);
    snapshot(): McpMarketSnapshot;
    isMaintaining(id: McpId): boolean;
    close(): void;
    grant(sessionId: string, id: McpId): void;
    hasSessionGrants(sessionId: string): boolean;
    assertSession(sessionId: string, workspace: string): void;
    private save;
    setAutomatic(enabled: boolean): void;
    private directory;
    check(signal?: AbortSignal): Promise<McpMarketSnapshot>;
    automaticCheck(signal?: AbortSignal): Promise<void>;
    private removeStage;
    private prepareProgram;
    private archiveDirectory;
    private replaceProgram;
    /** Re-download an existing root version; transitive resolution may change.
     * Always leaves this connection disabled for a new explicit trust decision. */
    repair(idInput: string, version: string, quiesce: () => Promise<void>, signal?: AbortSignal): Promise<void>;
    restoreArchive(archiveId: string, quiesce: () => Promise<void>): Promise<void>;
    /** Download/resolve with lifecycle hooks disabled. Does not execute the server. */
    install(idInput: string, version: string, integrity: string, signal?: AbortSignal): Promise<McpInstallation>;
    select(idInput: string, version: string, workspace: string): McpSelection;
    disable(idInput: string): void;
    forget(idInput: string): void;
    launch(idInput: string, version: string): {
        directory: string;
        entry: string;
        digest: string;
    };
    active(): McpSelection[];
    dataPath(id: McpId, workspace: string): string;
}
export {};
