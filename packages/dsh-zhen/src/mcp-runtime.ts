import type { Context } from '@deepseek-ai/cordis';
import type { ToolExecutionInput } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-working-directory';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import { fileURLToPath } from 'node:url';
import { McpMarket, canonicalMcpWorkspace } from './mcp-market.ts';
import type { McpId, McpMarketView, McpSelection } from './mcp-market-schema.ts';

export const MCP_NAMES = { memory: 'zhenmemory', filesystem: 'zhenfiles' } as const;
export function curatedMcpId(execution: Pick<ToolExecutionInput, 'name' | 'arguments'>): McpId | undefined {
  for (const id of ['memory', 'filesystem'] as const) {
    const server = MCP_NAMES[id];
    if (execution.name.startsWith(`mcp__${server}__`)) return id;
    if (['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'].includes(execution.name) && execution.arguments && typeof execution.arguments === 'object' && 'server' in execution.arguments && execution.arguments.server === server) return id;
  }
  return undefined;
}
const signature = (value: McpSelection): string => JSON.stringify([value.active, value.workspace, value.epoch]);
type RuntimeState = McpMarketView['recipes'][number]['runtime'];
interface Mounted { plugin?: Awaited<ReturnType<Context['plugin']>>; signature: string; running: number; state: RuntimeState; tail: Promise<void>; }

/** Uses only the published MCP plugin and ToolRuntime's monotonic guard seam. */
export class CuratedMcpRuntime {
  private mounted = new Map<McpId, Mounted>();
  private queue = Promise.resolve();
  private closed = false;
  constructor(private readonly ctx: Context, private readonly market: McpMarket) {
    ctx.effect(() => () => { this.closed = true; }, 'zhen: curated MCP owner');
    ctx.inject(['systemPrompt'], inner => inner.systemPrompt.section({ name: 'zhen:mcp-project-paths', order: inner.systemPrompt.getSectionOrder('MCP_SERVERS'), interpolate: false,
      text: () => market.active().some(item => item.id === 'filesystem') ? 'DSH-zhen 项目文件工具：首次使用先调用 list_allowed_directories，使用它回报的目录拼写作为绝对路径前缀。Windows 下不要改目录的大小写或使用短路径别名。工具仅能用于其绑定的项目。' : '' }));
    ctx.tools.guard(execution => {
      const id = curatedMcpId(execution);
      return id ? this.denial(id, execution) : undefined;
    });
    ctx.on('tools/execute', async (execution, next) => {
      const id = curatedMcpId(execution);
      if (!id) return next();
      const reason = this.denial(id, execution); if (reason) throw new Error(reason);
      const mounted = this.mounted.get(id)!; mounted.running++;
      const previous = mounted.tail; let release!: () => void;
      mounted.tail = new Promise<void>(resolve => { release = resolve; });
      try {
        // Reference servers own mutable local state. Serialize this connection's
        // calls instead of relying on model scheduling to prevent lost writes.
        await previous;
        execution.signal.throwIfAborted();
        await ctx.workingDirectory.ensure(execution.agent!, execution.signal);
        const changed = this.denial(id, execution); if (changed) throw new Error(changed);
        // Persist only connection generations; no arguments or result text.
        market.grant(execution.agent!.session.id, id);
        const result = await next();
        if (this.denial(id, execution)) throw new Error('调用期间项目或连接权限已变化，结果不再提供。已执行的操作无法撤销，请先检查项目。');
        return result;
      } finally {
        release();
        mounted.running--;
        if (!mounted.running && mounted.state === 'draining') void this.sync().catch(() => {});
      }
    });
  }
  state(id: McpId): RuntimeState { return this.mounted.get(id)?.state ?? 'idle'; }
  async quiesce(id: McpId): Promise<void> {
    if (this.market.active().some(item => item.id === id)) throw new Error('维护前必须先停用连接。');
    await this.sync();
    const current = this.mounted.get(id);
    if (current?.running) await current.tail;
    await this.sync();
    if (this.mounted.get(id)?.plugin) throw new Error('MCP 尚未完全断开，不能替换程序目录。');
  }
  async restart(id: McpId): Promise<void> {
    if (!this.market.active().some(item => item.id === id)) throw new Error('请先启用此连接。');
    const current = this.mounted.get(id);
    if (current) { current.state = 'draining'; current.signature = ''; await current.tail; }
    await this.sync();
    if (this.market.active().some(item => item.id === id) && this.state(id) !== 'ready') throw new Error('MCP 重新加载失败，请核对程序与项目目录。');
  }
  private denial(id: McpId, execution: Pick<ToolExecutionInput, 'agent'>): string | undefined {
    try {
      const selected = this.market.active().find(item => item.id === id), mounted = this.mounted.get(id);
      if (!selected || !mounted?.plugin || mounted.state !== 'ready' || mounted.signature !== signature(selected)) return '此 MCP 连接未启用或正在切换，请检查连接页。';
      if (!execution.agent || canonicalMcpWorkspace(this.ctx.workingDirectory.get(execution.agent.session)) !== selected.workspace) return '此 MCP 只允许在其绑定的项目会话中调用。';
      // Recheck at the tool boundary too: a prepared call can outlive a model
      // request and must not regain authority after a connection is re-enabled.
      try { this.market.assertSession(execution.agent.session.id, selected.workspace); }
      catch { return '此会话的 MCP 授权已失效。重新启用连接后，请新建会话继续。'; }
    } catch { return '无法复核此 MCP 的项目权限，请检查连接页。'; }
    return undefined;
  }
  sync(): Promise<void> {
    return this.queue = this.queue.catch(() => {}).then(async () => {
      if (this.closed) return;
      for (const id of ['memory', 'filesystem'] as const) {
        const selected = this.market.active().find(item => item.id === id), current = this.mounted.get(id);
        if (current?.plugin && selected && current.signature === signature(selected)) continue;
        if (current?.running) { current.state = 'draining'; continue; }
        await current?.plugin?.dispose(); this.mounted.delete(id);
        if (!selected) continue;
        const record: Mounted = { signature: signature(selected), running: 0, state: 'error', tail: Promise.resolve() }; this.mounted.set(id, record);
        try {
          const program = this.market.launch(id, selected.active);
          record.plugin = await this.ctx.plugin(mcpClient, mcpClient.Config({ transport: 'stdio', serverName: MCP_NAMES[id], command: process.execPath,
            args: [fileURLToPath(new URL('./mcp-server.js', import.meta.url)), '--id', id, '--directory', program.directory, '--digest', program.digest, '--workspace', selected.workspace, '--data', this.market.dataPath(id, selected.workspace)],
            env: {}, cwd: program.directory, toolCallTimeoutMs: 30000, failOnStartupError: true, maxInstructionBytes: 4096, reconnect: { enabled: false } }));
          record.state = 'ready';
        } catch { record.state = 'error'; }
      }
    });
  }
}
