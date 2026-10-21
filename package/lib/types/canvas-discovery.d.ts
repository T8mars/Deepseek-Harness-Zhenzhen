import type { CanvasDiscovery, CanvasInstallCandidate } from './canvas-discovery-schema.ts';
/** Inert inventory of an application-bundled CLI. Does not execute its code. */
export declare function inspectCanvasInstall(root: string): CanvasInstallCandidate;
/** Match the Canvas installer's documented default/managed discovery roots.
 * Reads metadata and fingerprints only: no require(), process, pairing or HTTP. */
export declare function discoverCanvasInstalls(options?: {
    env?: NodeJS.ProcessEnv;
    home?: string;
}): CanvasDiscovery;
