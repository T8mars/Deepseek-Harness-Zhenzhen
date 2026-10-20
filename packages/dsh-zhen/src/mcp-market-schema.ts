import { z } from 'zod';

export const mcpId = z.enum(['memory', 'filesystem']);
const version = z.string().max(60).regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const mcpReleaseSchema = z.object({
  id: mcpId, version, integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/),
  gitHead: z.string().regex(/^[a-f0-9]{40}$/), node: z.string().max(200),
  license: z.string().max(200), checkedAt: z.iso.datetime(),
}).strict();
export const mcpInstallationSchema = z.object({ release: mcpReleaseSchema, digest: sha, packages: z.number().int().min(1).max(1000), installedAt: z.iso.datetime() }).strict();
export const mcpArchiveSchema = z.object({ archiveId: z.uuid(), installation: mcpInstallationSchema, retainedAt: z.iso.datetime(), programRetained: z.boolean(), verified: z.boolean() }).strict();
export const mcpSelectionSchema = z.object({ id: mcpId, active: version, pending: z.union([version, z.literal('')]), enabled: z.boolean(), workspace: z.string().max(4096), epoch: z.number().int().positive() }).strict();
export const mcpMarketSnapshotSchema = z.object({
  schemaVersion: z.literal(2).default(2), archives: z.array(mcpArchiveSchema).max(100).default([]),
  automatic: z.boolean(), checkedAt: z.string().max(40), message: z.string().max(300), nextEpoch: z.number().int().positive().default(1),
  candidates: z.array(mcpReleaseSchema).max(2), installations: z.array(mcpInstallationSchema).max(100), selections: z.array(mcpSelectionSchema).max(2),
}).strict().superRefine((value, context) => {
  if (new Set(value.archives.map(item => item.archiveId)).size !== value.archives.length || new Set(value.candidates.map(item => item.id)).size !== value.candidates.length || new Set(value.selections.map(item => item.id)).size !== value.selections.length || new Set(value.installations.map(item => `${item.release.id}@${item.release.version}`)).size !== value.installations.length || value.selections.some(item => item.epoch >= value.nextEpoch)) context.addIssue({ code: 'custom', message: 'Invalid MCP version or grant identity.' });
});
export type McpId = z.infer<typeof mcpId>;
export type McpRelease = z.infer<typeof mcpReleaseSchema>;
export type McpInstallation = z.infer<typeof mcpInstallationSchema>;
export type McpArchive = z.infer<typeof mcpArchiveSchema>;
export type McpSelection = z.infer<typeof mcpSelectionSchema>;
export type McpMarketSnapshot = z.infer<typeof mcpMarketSnapshotSchema>;
export const mcpMarketViewSchema = z.object({ snapshot: mcpMarketSnapshotSchema, node: z.string().max(40), incompatible: z.array(z.string().max(100)).max(100), recipes: z.array(z.object({
  id: mcpId, title: z.string(), package: z.string(), version, integrity: z.string(), gitHead: z.string(), node: z.string(), license: z.string(), description: z.string(), access: z.string(),
  runtime: z.enum(['idle', 'ready', 'draining', 'error', 'unavailable']),
  maintenance: z.boolean().default(false),
}).strict()).max(2) }).strict();
export type McpMarketView = z.infer<typeof mcpMarketViewSchema>;

export const MCP_RECIPES = {
  memory: { id: 'memory', title: '项目记忆', package: '@modelcontextprotocol/server-memory', version: '2026.8.31', integrity: 'sha512-ljj/3S4aGjxdNSQWw6gucKKGnTLdBPWxzapyY/MT2tOVyZwvxChvevXSLPwx59nKJAlVpUVW+cOlnVRXRwiqMQ==', entry: 'dist/index.js',
    gitHead: 'a40bc270fb5ece62673f8a1196f57116d885c5eb', node: '', license: 'SEE LICENSE IN LICENSE', description: '在当前项目的独立记忆文件中记录实体、关系和观察。', access: '读写此连接的记忆数据；工具结果会提供给会话所选模型。' },
  filesystem: { id: 'filesystem', title: '项目文件', package: '@modelcontextprotocol/server-filesystem', version: '2026.8.31', integrity: 'sha512-kKaFkyAh6oipvc9+EAbJ552JafnMnOq5nzmzWkp1jJdBhTAAGpmIpWihUG1+rfNhmEFM98gUZDdCHCDD4v6a7Q==', entry: 'dist/index.js',
    gitHead: 'a40bc270fb5ece62673f8a1196f57116d885c5eb', node: '', license: 'SEE LICENSE IN LICENSE', description: '通过官方参考服务器整理所选项目中的文件。', access: '可读写所选项目目录；工具结果会提供给会话所选模型。' },
} as const;
