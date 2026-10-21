import type { CapabilityCatalog, CapabilityPage, CapabilityCheck } from './capability-schema.ts';
export declare function readCapabilityCatalog(): CapabilityCatalog;
export declare function searchCapabilities(catalog: CapabilityCatalog, query?: string, family?: string, offset?: number): CapabilityPage;
export declare function createCapabilityTool(catalog: () => CapabilityCatalog): import("@deepseek-ai/dsh-tools").ToolDefinition;
export declare class CapabilityMonitor {
    private readonly file;
    private readonly catalog;
    private readonly fetcher;
    private pending?;
    constructor(file: string, catalog: CapabilityCatalog, fetcher?: typeof fetch);
    snapshot(): CapabilityCheck;
    private save;
    setAutomatic(automatic: boolean): void;
    check(signal?: AbortSignal): Promise<CapabilityCheck>;
    automaticCheck(signal?: AbortSignal): Promise<void>;
}
