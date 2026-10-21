import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CanvasOperation } from './canvas.ts';
import type { CanvasPlanRequest, CanvasInspectionRequest } from './canvas-contract.ts';
export interface CanvasReader {
    read(operation: CanvasOperation, id?: string, scope?: {
        projectId: string;
        canvasId: string;
    }): Promise<Record<string, unknown>>;
    plan?(request: CanvasPlanRequest): Promise<Record<string, unknown>>;
    inspect?(request: CanvasInspectionRequest): Promise<Record<string, unknown>>;
}
/** No pairing, spawning, writing, or paid side effects occur during server creation/listing. */
export declare function createCanvasMcp(bridge: CanvasReader): McpServer;
