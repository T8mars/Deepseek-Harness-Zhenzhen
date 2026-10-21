import { z } from 'zod';
export declare const ragBackendId: z.ZodString;
export declare const ragBackendSettingsSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    selected: z.ZodString;
    enabled: z.ZodBoolean;
}, z.core.$strict>;
export declare const ragBackendStatusSchema: z.ZodObject<{
    selected: z.ZodString;
    enabled: z.ZodBoolean;
    state: z.ZodEnum<{
        ready: "ready";
        invalid: "invalid";
        unavailable: "unavailable";
        paused: "paused";
    }>;
    revision: z.ZodUUID;
    providers: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type RagBackendStatus = z.infer<typeof ragBackendStatusSchema>;
export declare const ragBackendMessages: {
    readonly RAG_INVALID_QUERY: "请使用 1 至 200 字的关键词或中文问题。";
    readonly RAG_ACCESS_CHANGED: "资料授权或工作目录已变化，请重新检索。";
    readonly RAG_PAUSED: "本地会话检索已暂停。请在知识库中恢复；集合的外发和会话权限仍需单独授权。";
    readonly RAG_BACKEND_UNAVAILABLE: "所选检索方式暂不可用。请在知识库中恢复本地检索，或启用对应扩展。";
    readonly RAG_CONFIGURATION_INVALID: "检索设置无法读取。请在知识库中点击“恢复本地检索”。";
    readonly RAG_BACKEND_CHANGED: "检索后端或设置已变化，本次结果未采用。请重新检索。";
    readonly RAG_BACKEND_TIMEOUT: "本地检索超时，本次没有采用结果。请缩短问题或稍后重试。";
    readonly RAG_BACKEND_FAILED: "本次检索未完成。请稍后重试，或在知识库中切换检索方式。";
    readonly RAG_INVALID_RESULT: "检索后端返回了无效或未获授权的资料编号，本次结果未采用。";
    readonly RAG_SETTINGS_CONFLICT: "另一窗口已修改检索设置。请刷新当前状态后再保存。";
};
