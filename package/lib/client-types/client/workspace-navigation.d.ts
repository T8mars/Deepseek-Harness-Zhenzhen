export type WorkspaceSection = 'home' | 'settings' | 'knowledge' | 'market' | 'connections' | 'updates' | 'art' | 'tasks';
export interface WorkspaceNavigation {
    current(): WorkspaceSection;
    open(section: WorkspaceSection): void;
    subscribe(listener: (section: WorkspaceSection) => void): () => void;
    dispose(): void;
}
/** Per-client-plugin memory only. A route chosen before the workspace mounts is retained. */
export declare function createWorkspaceNavigation(): WorkspaceNavigation;
