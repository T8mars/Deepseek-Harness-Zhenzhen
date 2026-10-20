# 给画布 Agent 的 DSH 接入交接

2026-10-20，以下保留 DSH-zhen 开发检查点 `v0.1.0-dev.3` 的历史交接。

> 当前复核：用户已让画布Agent完成3.3.7并推送，DSH已只读确认源码后端状态与兼容字段。
> 最新结果、DSH侧报告修正及下一步见[3.3.7复核交接](canvas-agent-v3.3.7-review.md)。
> 当前桌面已打开仍无法配对：源码CLI与安装版图谱摘要不同，安装资源CLI逐项匹配，见[最新配套工具交接](canvas-agent-installed-cli-compat.md)。
> 之前“已打开却找不到”、旧CLI不同步及浏览器审批问题，见[历史现场交接](canvas-agent-instance-discovery.md)。
> 下面的旧基线、暂缓发版和故障记录仅供历史定位，不应重新叠加旧补丁。
> 新增参考素材/编辑合同问题见[0050交接](canvas-agent-reference-assets.md)，网关动作覆盖见[0049交接](canvas-agent-api-coverage.md)。

## 用户当时决定（0033）

用户明确要求：**DSH Agent 不再修改画布；需要的画布改动由画布 Agent 接手。**
用户当时选择暂缓画布发版。本文不是新版本升级、生产构建、推送、tag 或
Release 授权；此前建议的 v3.3.7 没有获准。先完成源码审核与本地验证。

可将以下指令连同本文交给画布 Agent：

> 请接手 DSH-zhen 的画布接入修复。先读取画布自己的 AGENTS.md、根 SKILL.md、
> docs/project-context-current.md，再核对工作树与本文快照。工作区已有未提交
> 修改，先审核差异，不要重新叠加补丁或覆盖文件。请在画布原控制面内完成
> 兼容修复与限定验证，反馈接口能力、CLI 摘要、测试证据及剩余问题。
> 当前暂缓发版，不执行版本升级、生产构建、推送、tag 或 Release。

## 已有工作与恢复材料

| 项目 | 0032 检查时的快照；接手时必须重查 |
| --- | --- |
| DSH 仓库 | `T8mars/Deepseek-Harness-Zhenzhen`，目前私有 |
| DSH 备份 | `v0.1.0-dev.3`，提交 `0a51b6d654538cc6aaa2a9ceead954f063624c02` |
| 画布开发目录 | `E:\PenguinPravite\T8-penguin-canvas`，worktree 门识别为 core |
| 画布分支 / HEAD | `codex/release-v3.0.8-volcengine-assets-ux` / `e6702dc7770bcbe7d4895be22a06f4c7123a085b` |
| 画布产品版本 | `3.3.6`；已发布 v3.3.6 Tag 固定在 `dadb10e6521dfbca7d888ceec3dbd7d5de7284a2`，不是补丁基线 |
| 未提交改动 | 38 个相关文件：25 个已跟踪修改、13 个新增；当时 staged/unmerged 都为 0 |
| 实际安装版 | `F:\Program Files\T8-PenguinCanvas\T8-PenguinCanvas.exe`，3.3.6；没有修改安装版文件 |

这些画布工作区改动在用户指定职责边界前已存在，尚未提交、生产构建或发布。
DSH Agent 已停止进一步画布修改，保留现状；请画布 Agent 审核、修订或采用，
不能将它们当作干净工作树，也不能执行 reset/clean/覆盖来撤销。

完整备份位于 DSH 仓库的 [integrations/canvas](../../integrations/canvas/README.md)：

- `manifest.json`：精确基线、38 项路径及原始/恢复后 SHA-256。
- `native-dsh-integration-v1.patch`：完整文本补丁，SHA-256
  `97ac620aac1aa2ed470063cfa2605d1f9888984baa6bf59f7166a5ebaf23c1aa`。
- Native MIT 声明保留。旧 `native-assets-v1.patch` 仅为早期7文件记录；不要叠加两份补丁。

补丁供审阅和恢复，**不要直接应用到已有这些改动的工作树**。DSH 的
`npm run verify:canvas-backup -- --canvas-root "<绝对可信源码路径>"`
只读取基线 Git 对象，在新建系统 TEMP 重建并逐项核对，不修改画布仓库。
不得将 DSH 根 `roadmap.md`、`skill.md`、`AGENTS.md`、`anents.md` 搬入交付物。

## 两个实际连接故障

1. 安装版 `/api/status` 返回200，但 `/api/agent-control/v1/status` 返回400：
   `AGENT_CONTROL_REQUEST_INVALID` / `Agent Control compatibility manifest is unavailable`。
   provider 清单实际位于 `resources/backend-enc/shared/creativeModelCatalog.json`；
   原查找遗漏该候选。`agentControlCompatibility.js` 已有单行工作区修复，
   `agentControlCompatibility.test.cjs` 先失败后通过，普通资源目录优先级保留。
2. 发现目录有976条旧记录。原 CLI 在验证心跳前截取前256个文件，新实例
   可能被挡住。`discovery.cjs` 的工作区修复先筛普通文件、按更新时间优先，
   无效/过期/重复项不占有效窗口；JSON 心跳仍为权威。限制为32768目录项、
   总内容8MiB、单文件32KiB、有效候选/探测256个，文件打开前后复核。
   不清理用户旧记录，不绕过版本握手。5项专项覆盖旧窗口、限额与文件增长。

源码测试不能证明安装版已修好。用户暂缓发版期间，正式安装版仍存在上述限制。
不要复制源码覆盖安装目录、伪造发现记录或手改兼容摘要来让握手通过。

## 其余接入改动，请连同已有差异审核

| 范围 | 文件与要求 |
| --- | --- |
| 配对存储 | `tools/zcanvas-cli/src/secureStore.cjs`、新增 `secureStoreTransactions.cjs`、`cli.cjs`。原 v1 JSON/DPAPI 保持；协作写入锁、旧快照拒绝、单一配方签名身份、配对/会话条件提交和精确清理。保证仅适用于参与新版协调的写入方。 |
| 运行恢复 | `agentControlRuns.js`、`agentControlApprovals.js`、`routes/agentControl.js`。一份计划绑定一个 operationId；按原 RunIntent 查询恢复。审批按 action/operation/session/project/canvas 查找；不返回其他会话结果。 |
| 素材交接 | `agentControlAssets.js`、`projectDatabase.js` 与路由。导入器延迟到批准后初始化；保留 metadata.size；原 AssetUploadManager/Blob/Patch 权威；相同内容和原 Patch 的只读恢复，不重复放置。 |
| Provider 写入 | `providers/seedanceNz.js`。有 Idempotency-Key 不代表可在模糊失败后重放付费写入。只保留明确的请求前 TLS 错误码处理与原任务查询。 |
| 生成清单 | 对照 manifest 中10份能力生成产物与工具 manifest（含覆盖文档）。通过原 feature-sync 生成，39动作、319目录项、84节点；不要手改摘要或伪造兼容。 |
| 专题与回归 | manifest 包含10个相关测试文件、5篇专题及 features/current-context。原始未修改测试也在下面的77项矩阵中。 |

现有高层能力仍为39项、73个L0规划/预览操作。DSH Agent 只有10个读/规划
工具；本文不要求开放任意写入工具、直接 Provider 提交或另起付费账本。

## DSH 依赖的最小原生合同

- 原 `/status` compat 原样回报；可选 `runControl.schema=t8-agent-run-control-v1`
  与 `assetControl.schema=t8-agent-asset-control-v1` 标记供 DSH 检查功能就绪。
- 同作用域 GET 恢复：`run-start-approvals/by-operation/:operationId`、
  `run-intents/by-operation/:operationId`、`asset-import-approvals/by-operation/:operationId`、
  `asset-place-approvals/by-operation/:operationId`，均位于 `/api/agent-control/v1/`。
- 素材查询支持精确 contentHash，并带项目/画布/revision；
  `GET patches/:patchId` 只返回最小公开应用回执，不能泄露原请求、秘密或完整变更。
- 付费流程保持预览 → DSH 人工确认 → 原生窗口批准 → 单次提交 → 原任务查询。
  原 RunIntent → Run → NodeRun → Attempt → Provider 链保持权威。
  收到 task_id 或受理不明后不能提供重发；不能启用付费 Auto review。
- 令牌走原 secureStore，不放环境变量；MCP 不调用 `/api/settings/raw`。
  不能从其他工具复制用户凭据，也不默认发出付费请求。

## 已验证、待验证与未验证

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| 画布原生16文件77项；发现修复5项包含其中。feature-sync、三 worktree 门、保护文件摘要与上下文预算通过 | 由画布 Agent 审核当前差异、必要的相邻回归、精确兼容版本与 CLI 交付 | 不能声称画布全项目测试通过；已有3项相邻基线失败见下文 |
| DSH 275项回归通过；完整38文件备份从真实基线 Git 对象在系统TEMP恢复并逐项校验 | 真人窗口批准、实际安装版发现与配对 | 尚未升级/构建/发布画布，未读取用户历史库 |
| 独立原生TEMP SQLite：image/video/script/Story、实际MCP聊天方案交接、graph.node-add、1个原RunIntent、1个AssetUpload/Blob/Patch素材及一次放置；丢回执GET恢复 | 真实网关结果下载、创作者完整工作流、付费结果与账单 | 窗口由测试IPC模拟，导出记录元数据由测试写入；Provider调用0，不是实际付费或真人窗口证据 |

77项涉及以下16个文件（均在 `tests/`，后缀 `.test.cjs`）：

```text
agentControlApprovals       agentControlApprovalRecovery
agentControlRuns            agentControlRunRecovery
agentControlAssets          agentControlAssetPlace
agentControlCompatibility   agentControlDiscovery
zcanvasDiscoveryWindow      zcanvasSecureStore
zcanvasSecureStoreConcurrency  zcanvasAuthTransactions
zcanvasRecipeStore          zcanvasInstaller
zcanvasPackaging            seedanceNzReplayBoundary
```

使用画布原 Electron Node 的受限串行测试入口，避免本机 Node 的 SQLite ABI
不匹配。先读同次失败报告再决定修复，不能为绿测削弱断言或跳过故障。
之前保留的相邻基线失败：B3瞬态图片回下载旧断言预期502/实际202、CLI
本地化命令清单、创作技能文档旧行数上限；此前在原HEAD也复现，77项未覆盖。

DSH工作目录中的原始本机证据（ignored，不作为公开附件）：
`.runtime/native-integration-0032-tests.log`、
`.runtime/native-discovery-window-baseline.log`、
`.runtime/native-discovery-window-current.log`、
`.runtime/evidence/native-canvas-asset-transfer.json`、
`.runtime/native-backup-0032-verification-current.log`。

## 请画布 Agent 回传的结果

1. 实际开发目录、branch、HEAD、采用/修订的精确文件与差异；不要覆盖并发工作。
2. 原 compat、功能标记、支持的权限/恢复语义及 CLI 整树摘要。
   本次所测 CLI 摘要为 `8a474a98bf33797018df9fe7fa9126ca55891100e64c87f91885bfc65b81b110`；
   DSH 正在运行的连接仍保存旧 pin，DSH 不会静默替换信任。
3. 已验证/待验证/未验证各自的命令、报告路径与局限。需要 DSH 侧调整的合同
   单独列出，DSH Agent 仅修改 DSH；画布 Agent 接管原生源码。
4. 当前保持不发版。后续若需要正式版本与安装验收，再由用户向画布 Agent
   明确授权；正式 v3.3.6 标签与资产保持冻结。

本交接已整理，**尚未由画布 Agent 接收、审核或完成**。
