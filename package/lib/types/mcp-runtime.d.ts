import type { Context } from '@deepseek-ai/cordis';
import type { ToolExecutionInput } from '@deepseek-ai/dsh-tools';
import { McpMarket } from './mcp-market.ts';
import type { McpId, McpMarketView } from './mcp-market-schema.ts';
export declare const MCP_NAMES: {
    readonly memory: "zhenmemory";
    readonly filesystem: "zhenfiles";
};
export declare function curatedMcpId(execution: Pick<ToolExecutionInput, 'name' | 'arguments'>): McpId | undefined;
type RuntimeState = McpMarketView['recipes'][number]['runtime'];
/** Uses only the published MCP plugin and ToolRuntime's monotonic guard seam. */
export declare class CuratedMcpRuntime {
    private readonly ctx;
    private readonly market;
    private mounted;
    private queue;
    private closed;
    constructor(ctx: Context, market: McpMarket);
    state(id: McpId): RuntimeState;
    quiesce(id: McpId): Promise<void>;
    restart(id: McpId): Promise<void>;
    private denial;
    sync(): Promise<void>;
}
export {};
