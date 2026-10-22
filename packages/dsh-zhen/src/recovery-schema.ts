import {z} from 'zod';
import {backupComponentSchema} from './backup-center-schema.ts';

const count=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const recoveryFactSchema=z.enum(['profiles','packages','sessions','images','files','skillRoots','skillVersions','collections','matching','changed','missing','records','media','workspaces']);
export const recoveryFactLabels:Record<z.infer<typeof recoveryFactSchema>,string>={profiles:'应用配置',packages:'插件与依赖',sessions:'会话',images:'图片附件',files:'文件',skillRoots:'技能来源',skillVersions:'保留技能版本',collections:'知识集合',matching:'与索引一致的原件',changed:'已变化的原件',missing:'缺失项',records:'生成与检查记录',media:'作品索引',workspaces:'工作区'};
export const recoveryWarningSchema=z.enum(['COMPONENT_DETAILS_UNAVAILABLE','PACKAGE_UNAVAILABLE','PROFILE_REVIEW_REQUIRED','SOURCE_MISSING','SOURCE_CHANGED','MEDIA_EXCLUDED','WORKSPACE_REVIEW_REQUIRED','PATH_REBINDING_REQUIRED','PERMISSIONS_REVIEW_REQUIRED']);
export const recoveryWarningLabels:Record<z.infer<typeof recoveryWarningSchema>,string>={COMPONENT_DETAILS_UNAVAILABLE:'该范围未提供详细数量，请保留原备份。',PACKAGE_UNAVAILABLE:'部分插件或依赖未能完成装配。',PROFILE_REVIEW_REQUIRED:'部分应用配置需要进一步处理。',SOURCE_MISSING:'部分来源或原件缺失。',SOURCE_CHANGED:'部分原件与原索引或记录不一致。',MEDIA_EXCLUDED:'部分作品原件未进入备份，已保留索引。',WORKSPACE_REVIEW_REQUIRED:'工作区顺序、待变更或引用仍需处理。',PATH_REBINDING_REQUIRED:'原目录引用仍需统一关联到恢复后的目录。',PERMISSIONS_REVIEW_REQUIRED:'权限需要重新审阅，旧授权不会自动启用。'};
export const recoverySummarySchema=z.object({kind:backupComponentSchema,counts:z.partialRecord(recoveryFactSchema,count),warnings:z.array(recoveryWarningSchema).max(16).refine(rows=>new Set(rows).size===rows.length)}).strict();
export type RecoverySummary=z.infer<typeof recoverySummarySchema>;
export const recoveryPreviewSchema=z.object({root:z.string().min(1).max(4096),createdAt:z.iso.datetime(),checkedAt:z.iso.datetime().nullable(),integrity:z.enum(['at-creation','unchanged','changed','unavailable']),files:count,bytes:count,links:count,components:z.array(recoverySummarySchema).max(6),activated:z.literal(false),readyForActivation:z.literal(false),wholeApplicationRestore:z.literal(false)}).strict().refine(value=>value.integrity==='at-creation'?value.checkedAt===null:value.checkedAt!==null);
export type RecoveryPreview=z.infer<typeof recoveryPreviewSchema>;
