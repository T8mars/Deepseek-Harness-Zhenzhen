# 加密备份与还原

当前提供 Host 库入口 `dsh-zhen/backup`，范围是公开持久化服务中的会话及其引用的本地附件。它是完整备份工作的基础，**尚不包含 profile、机器配置、用户技能、RAG 或界面入口，不能作为完整 M2/L2 还原验收**。

## 已实现的会话范围

- 通过 `SessionStore.flush` 和 `SessionPersistence.flush/list/open/read/stat` 读取逻辑数据，不复制会话的私有存储文件，不修改格式。
- 保留公开 header、完整事件、原始会话 ID、父子关系和精确 `inheritedEventCount`；已支持的未知可忽略事件原样保存。未知必需事件和需要迁移的会话拒绝备份或还原。
- 使用已发布 `sessionLogZipEntries` 收集规范事件中的附件，引用仍由原 SDK 判定。任意插件数据里的同名字段不被猜成附件或文件路径。
- 通过本地附件服务读写文件；规范化图片使用公开 `commitPreparedImageFile` 和读取验证保留原始身份，不重新压缩、不改写事件中的引用。当前明确支持已发布本地后端的 `sha256:` 身份。
- 备份前后执行持久化屏障，比较同一实例的全部会话集合、不透明 revision 和活动会话的公开事件序号；事件仍在缓冲区也会拒绝。源内容变化、服务被替换或活动会话尚无持久化所有者时拒绝发布，不静默遗漏。

## 加密与文件行为

文件格式为 `DSHZBKP1`：随机盐、固定 scrypt 参数和随机 nonce，AES-256-GCM 保护记录及其元数据。密码至少 12 个字符、UTF-8 编码最多 1024 字节，不写入凭据、环境变量或日志。密码无法从归档恢复。

写入只生成加密的独占临时文件；同步完成后以不覆盖已有文件的方式发布。正常文件系统优先使用硬链接；不支持时使用独占复制。独占复制的中断可能留下不完整加密文件，读取端会拒绝它。归档没有压缩层。

读取先在系统 TEMP 创建有界的独占加密快照，完整验证认证标签；密码错误或内容被改动时，不创建还原目录。随后流式解析，所有还原工作只在新建候选目录中进行，全部通过才返回候选路径。失败时只清理本次拥有的目录，不接触已有用户目录。

默认预算：加密归档 4 GiB、单记录 1 GiB、元数据 64 KiB、10 万条记录；会话逻辑内容 32 MiB、1 万个会话、本地图片 20 MiB。超限明确拒绝，后续界面需要展示原因与可选范围，不截断内容冒充完整备份。

凭据服务完全不参与，manifest 标记的是 `credentialStoresIncluded:false`。用户自己写进会话或附件的敏感文字仍属于其原始内容，因此归档始终加密；不能声称自动识别、删除所有敏感字符串。

## Host 调用

```ts
import {writeSessionBackup,restoreSessionBackup} from 'dsh-zhen/backup';

// resolve 在每次核对时重新取当前公开服务，便于识别服务替换。
const resolve=()=>({
  sessions:ctx.sessions,
  sessionPersistence:ctx.sessionPersistence,
  sessionQuery:ctx.sessionQuery,
  attachments:ctx.attachments,
});
await writeSessionBackup(absoluteBackupFile,password,resolve,{signal});
const candidate=await restoreSessionBackup(
  absoluteBackupFile,password,existingCandidateParent,{signal},
);
// candidate.activated === false；此处没有恢复 Agent 执行、替换 profile 或切换应用。
```

还原用全新公开 Cordis/Session/JSONL/本地附件服务；查询服务 `openAt:'never'`，不打开查询数据库。已有应用的会话、配置、凭据和任何画布数据不参与。候选目录不具备完整应用配置，不应直接当作运行环境切换。

## 验证与剩余工作

C88 验证流式加密、随机性、错误密码、损坏、预算、不覆盖、取消、元数据约束及临时快照生命周期。C89 使用固定已发布 SDK 和全新系统 TEMP，验证分支继承、257 个事件分页、活动持久化屏障、未知可忽略事件、图片与文件身份、缩放前尺寸、源变化拒绝，以及缺失附件/重复 ID/未知必需事件后的清理。

profile 的全部配置层、机器 patch、被同名技能遮蔽的用户技能及完整资源、依赖清单、RAG、预览、备份管理、候选激活和完整 L2 验收继续开发。仅恢复上述会话候选不等于完成这些项目，也不等于验证现有用户资料的灾难恢复。
