import {z} from 'zod';
export const ragBackendId=z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const ragBackendSettingsSchema=z.object({schemaVersion:z.literal(1),selected:ragBackendId,enabled:z.boolean()}).strict();
export const ragBackendStatusSchema=z.object({selected:ragBackendId,enabled:z.boolean(),state:z.enum(['ready','paused','unavailable','invalid']),revision:z.uuid(),providers:z.array(z.object({id:ragBackendId,label:z.string().min(1).max(100)}).strict()).max(16)}).strict();
export type RagBackendStatus=z.infer<typeof ragBackendStatusSchema>;
export const ragBackendMessages={
  RAG_INVALID_QUERY:'请使用 1 至 200 字的关键词或中文问题。',
  RAG_ACCESS_CHANGED:'资料授权或工作目录已变化，请重新检索。',
  RAG_PAUSED:'本地会话检索已暂停。请在知识库中恢复；集合的外发和会话权限仍需单独授权。',
  RAG_BACKEND_UNAVAILABLE:'所选检索方式暂不可用。请在知识库中恢复本地检索，或启用对应扩展。',
  RAG_CONFIGURATION_INVALID:'检索设置无法读取。请在知识库中点击“恢复本地检索”。',
  RAG_BACKEND_CHANGED:'检索后端或设置已变化，本次结果未采用。请重新检索。',
  RAG_BACKEND_TIMEOUT:'本地检索超时，本次没有采用结果。请缩短问题或稍后重试。',
  RAG_BACKEND_FAILED:'本次检索未完成。请稍后重试，或在知识库中切换检索方式。',
  RAG_INVALID_RESULT:'检索后端返回了无效或未获授权的资料编号，本次结果未采用。',
  RAG_SETTINGS_CONFLICT:'另一窗口已修改检索设置。请刷新当前状态后再保存。',
} as const;
