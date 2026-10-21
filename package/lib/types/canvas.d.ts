import type { CanvasPlanRequest, CanvasInspectionRequest } from './canvas-contract.ts';
import type { CanvasConnectionCheck } from './canvas-setup-schema.ts';
export interface CanvasConfig {
    root: string;
    digest: string;
    instance: string;
}
export interface CanvasConnection {
    configured: boolean;
    root: string;
    digest: string;
    instance?: string;
    connected: boolean;
    code: string;
    message: string;
    compat: unknown;
}
type Instance = {
    instanceId: string;
    origin: string;
    appVersion?: string;
};
type CliClient = {
    selectInstance(id: string): Promise<Instance>;
    requestAgentControl(instance: Instance, path: string, options?: {
        accessToken?: string;
        method?: 'POST';
        body?: unknown;
        timeoutMs?: number;
    }): Promise<{
        data: Record<string, unknown>;
        ok: boolean;
    }>;
};
export interface CanvasPairingRuntime {
    instance: Instance;
    client: CliClient;
    store: {
        configuredInstances(): {
            pending: Array<{
                instanceId: string;
                origin: string;
                pairingId: string;
                userCode: string;
                expiresAt: string;
            }>;
        };
        loadPending(id: string): {
            origin: string;
            pairingId: string;
            pollSecret: string;
            userCode: string;
            expiresAt: string;
        } | null;
        storePending(instance: Instance, pairing: Record<string, unknown>): unknown;
        deletePending(id: string, options?: {
            expectedPairingId: string;
            expectedOrigin: string;
        }): unknown;
        loadSession(id: string): {
            origin?: string;
            sessionId?: string;
            accessToken: string;
            expiresAt: string;
        } | null;
        storeSession(instance: Instance, session: Record<string, unknown>): unknown;
    };
}
export interface CanvasWorkflowRuntime {
    instance: Instance;
    client: CliClient;
    accessToken: string;
    sessionId: string;
    actorId: string;
    scopes: string[];
    store: CanvasPairingRuntime['store'] & {
        storeApproval(instance: Instance, approval: Record<string, unknown>): unknown;
        loadApproval(instanceId: string, approvalId: string): Record<string, unknown> | null;
        deleteApproval(instanceId: string, approvalId: string): unknown;
    };
}
export type CanvasOperation = 'status' | 'capabilities' | 'workspaces' | 'models' | 'capability-graph' | 'capability-tools' | 'task' | 'creator-session';
export declare class CanvasError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** Fingerprint a user-selected, already installed CLI, including its complete resource closure. */
export declare function inspectCanvasCli(path: string, instance?: string): CanvasConfig;
/** Thin adapter: reuse the official CLI discovery, exact handshake and secureStore. */
export declare class CanvasBridge {
    readonly config: CanvasConfig;
    private modules?;
    constructor(config: CanvasConfig);
    private load;
    private paired;
    /** Host connection UI only. This is never registered as an Agent/MCP tool. */
    pairingRuntime(): Promise<CanvasPairingRuntime>;
    /** Explicit Host UI only; never exposed through Canvas MCP. */
    workflowRuntime(): Promise<CanvasWorkflowRuntime>;
    private localCatalog;
    private checkedCatalog;
    inspect(input: CanvasInspectionRequest): Promise<Record<string, unknown>>;
    plan(input: CanvasPlanRequest): Promise<Record<string, unknown>>;
    read(operation: CanvasOperation, id?: string, scope?: {
        projectId: string;
        canvasId: string;
    }): Promise<Record<string, unknown>>;
    status(): Promise<CanvasConnection>;
    /** Owner UI diagnosis only. Native exact handshake, no pairing or credential-store reads. */
    connectionCheck(): Promise<CanvasConnectionCheck>;
}
export declare function safeCanvasError(error: unknown): CanvasError;
export {};
