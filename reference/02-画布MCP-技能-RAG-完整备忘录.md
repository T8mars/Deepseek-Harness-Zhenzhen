# DSH-zhen x T8 画布对接备忘录：MCP / 创作 SKILL / 创作者 RAG

- 编写：画布对接顾问（只做规划，未写任何产品代码，未改动任何仓库）
- 日期：2026-10-19
- 受众：DSH-zhen 开发者、画布侧维护者、T8star（最终决策人）
- 状态：规划稿。所有事实带来源路径；无法从源码/文档确认的一律标「未核实」或「待实测」，没有臆造接口。

## 0. 路径别名与证据约定

| 别名 | 实际路径 |
|---|---|
| `CV/` | `/tmp/claude-0/-home-claude/91e4798b-1101-52aa-b272-a861cf0cdb8f/scratchpad/upstream/canvas/`（T8-penguin-canvas，package 3.3.6，`CV/docs/project-context-current.md`） |
| `DS/` | `/tmp/claude-0/-home-claude/91e4798b-1101-52aa-b272-a861cf0cdb8f/scratchpad/upstream/dsh/`（DeepSeek Harness 源码） |
| `SD` | `/tmp/claude-0/-home-claude/91e4798b-1101-52aa-b272-a861cf0cdb8f/scratchpad/work/seedance-docs/llms.txt`（`https://api.seedance.nz/docs/llms.txt` 的下载副本） |

- 行号写作 `文件:行号`，对应本次勘察时的快照；上游更新后需重新核对。
- 「未核实」= 没有读到相关源码或文档；「待实测」= 源码/文档有线索但行为必须跑起来才能确定。
- 画布根目录的 `SKILL.md` 与 `local-private/context-archive/...` 在本克隆中缺失（`scripts/read-project-context.cjs find/feature` 返回 ENOENT）。已改读 `CV/.agents/skills/zhenzhen-canvas/SKILL.md`、`CV/AGENTS.md`、`CV/docs/project-context-current.md`、`CV/docs/nodemap.md`。「根 SKILL.md 缺失」记为未核实项。

---

## 1. 结论先行（给 T8star 的一页纸）

1. **画布已经有一套成熟、带安全设计的 Agent 控制面**（`/api/agent-control/v1`：配对 + 分权 token + 39 个版本化创作能力 + 预览-批准-精确应用 + RunIntent + 血缘 + 交付）。MCP 不要去包原始 REST，而是做成这套控制面的**薄适配层**。
2. **MCP 放在画布仓库内**（建议 `tools/canvas-mcp/`），与 `tools/zcanvas-cli/` 共用 `agentClient` / `discovery` / `secureStore`，这样画布的「摘要全对才放行」版本握手永远对得上。传输选 **stdio**（P0），本机 Streamable-HTTP 留到多客户端共享时（P2）。
3. **付费安全是双门**：DSH 侧用 `tools/pre-execute` 返回 `ask`（附报价）作第一道门，画布窗口里的 Electron 审批卡是**唯一权威**的第二道门。付费 POST 一旦拿到 task_id 只许查询、永不重发。
4. **最大的缺口在画布侧而不是 DSH 侧**：画布没有价格表（`cost.known:false` / `pricing_registry_unavailable`），也不识别 Seedance 的 `usage.amount`，Seedance 视频按 Token 且只能事后得知用量，因此「报价」只能是**区间 + 假设**。
5. **集成路线**：P0 = 方案 iii（仅 MCP，DSH-zhen 独立窗口遥控画布）；P1 = 方案 i（把 DSH-zhen Web 嵌入画布侧栏）；P2 = 方案 ii（ACP 无头助手，把权限提示并进画布审批卡）。
6. **SKILL**：两边都是 Agent Skills 风格，可做「一份 SKILL.md 两边用」，画布专属字段放旁路 `catalog.json`。首批 15 个，其中 13 个有画布能力证据，2 个标「建议新增」。
7. **RAG**：画布已有素材语义索引（FTS5 trigram + 多语 MiniLM-L12 384 维 + RRF 混合检索，BLIP 描述、TrOCR）；Seedance **没有 embeddings 接口**（对 `SD` 全文检索 0 命中）。建议 DSH-zhen 侧做本地优先的独立 RAG MCP 服务（BM25/FTS5 为主，本地 ONNX 中文小模型为可选增强）。

需要 T8star 拍板的事项见 §8。

---

## 2. 问题一：画布现状勘察

### 2.1 数据模型

| 对象 | 事实 | 来源 |
|---|---|---|
| 存储 | better-sqlite3 项目库，`PROJECT_DATABASE_SCHEMA_VERSION = 33`，更高版本拒绝启动（防降级写入） | `CV/backend/src/services/projectDatabase.js:174,508` |
| 画布文档 | 表 `canvas_documents`、`canvas_snapshots`、`canvas_operations`（带 `canvas_operation_idempotency`、`canvas_patch_applications`），协作相关表 `collaboration_*` | 同上（`CREATE TABLE` 扫描） |
| 节点类型 | 共 84 种（`canvasNodeSchema.json` 的 `types`；生成面声明「83/83 节点」，差 1 项与内部/开发专用节点有关，具体未核实），含 `text` `image` `video` `audio` `script-master` `story` `director-storyboard` `video-edit` `localization-master` `subflow` `browser` `vibex` `llm` 等 | `CV/backend/src/shared/canvasNodeSchema.json`；`CV/.agents/skills/zhenzhen-canvas/SKILL.md` 发布说明 |
| 资产 | 表 `assets`、`asset_lineage`（含 events/tombstones）、`asset_tags`、`asset_collections`、`asset_blobs`、`asset_fingerprints`、`asset_duplicate_*`、`asset_access_policies`；语义索引 `asset_semantic_documents/embeddings/jobs/models/profiles` | `CV/backend/src/services/projectDatabase.js` |
| Run / Attempt | 表 `runs`、`node_runs`、`run_attempts`、`run_events`、`run_intents`、`run_output_commits`、`run_output_slot_reservations`、`run_retention_policies` | 同上 |
| 创作会话 | `creator_conversations/messages/actions/media_candidates/work_*/preferences/change_log` | 同上 |
| 审计 | 表 `audit_events` | 同上 |
| 成本字段 | `explicitAttemptCost(usage)` 只认 `totalCostUsd/total_cost_usd/totalCost/total_cost/costUsd/cost_usd/cost`，**不认 `amount`**，且命名按 USD | `CV/backend/src/services/runUsage.js:1-36` |

### 2.2 API 风格与认证

- 监听地址默认 `127.0.0.1:18766`（`HOST`/`PORT`）：`CV/backend/src/config.js:166-167`。
- 通用 `/api/*`：**没有 bearer 认证**，只靠回环绑定 + Origin / `Sec-Fetch-Site` 守卫（`CV/backend/src/server.js`）。已知风险：`GET /api/settings/raw` 向本机调用者返回明文密钥（`CV/backend/src/routes/settings.js`）；非 Windows 平台凭据存 0600 文件而非系统钥匙串（`CV/tools/zcanvas-cli/src/secureStore.cjs`）。**MCP 严禁读取 `/api/settings/raw`**。
- 控制面 `/api/agent-control/v1`（`CV/backend/src/routes/agentControl.js`，挂载于 `CV/backend/src/server.js:396`）：
  - 配对：`POST /pairings`、`POST /pairings/:id/poll`（:666,:678），签发分权 bearer（`canvas:read`、`canvas:write` 等，`agentControlAuth.js`）。
  - 能力：`GET /capabilities`、`/capability-graph`、`/capability-tools`、`POST /capability-tools/invoke`（:699-746）。
  - 只读工具：`POST /tools`（:802）仅允许 8 个：`inspectCanvas inspectNodeSchema inspectRun searchAssets searchSubflows validateCanvas simulateExecutionPlan estimateRun`（`CV/backend/src/services/canvasAgentTools.js:18-39`）。
  - 创作：`POST /creative-plans`（:1006）、`POST /creative-read`（:1178）、`POST /creative-approvals`（:1219）、`GET /models`（:1194）。
  - 执行：`POST /run-plans`（:842）、`/run-start-approvals`（:872）、`/run-retry-approvals`（:909）、`GET /run-intents`（:954）、`GET /run-intents/:id`（:973）、`POST /run-intents/:id/cancel`（:989）。
  - 资产/交付：`GET /assets`（:1305）、`/assets/:id`、`/assets/:id/lineage`、`GET /delivery/collect`、`POST /delivery-package-approvals`、`/delivery/verify`、`/asset-place-approvals`、`/asset-import-approvals`、`/asset-download-approvals`。
  - 补丁：`/patch-approvals`、`/patches`、`/patch-revert-approvals`；统一收口 `POST /approvals/:id/complete`（:1869）。
- **审批只能在画布窗口里批准/拒绝**（Electron IPC，`CV/electron/main.cjs`），内存存放、TTL 10 分钟，Agent 不能自批（`CV/backend/src/services/agentControlApprovals.js`；`CV/.agents/skills/zhenzhen-canvas/references/security.md`）。Web-only（非 Electron）模式能否审批：未核实。
- 风险分级 L0-L3：L0 只读/计划/预览；L1 可逆画布写；L2 生成/付费/导入/打包；见 `CV/tools/zcanvas-cli/generated/creative-capability-surfaces.json`（每个能力的 `ui.operations[].riskLevel`）。

### 2.3 四个相关模块的角色

| 模块 | 角色 | 来源 |
|---|---|---|
| `creatorAgent` / `creatorAgentV2` | 画布**内置**「创作者 Agent」会话后端（对话、动作、候选媒体、作品版本），数据落 `creator_*` 表。不是对外接口，不要从 MCP 直连 | `CV/backend/src/routes/creatorAgent.js`、`creatorAgentV2.js`（角色据路由与表名判断，细节未核实） |
| `creatorSkills` | **画布内置 Skill 包**的导入/安装/启停/更新（`/api/creator-skills` 下 `catalog` `import` `install` `:id/status` `:id/update` `:id/prepare`），格式 Agent Skills + 旁路 `catalog.json`，禁止可执行代码生效 | `CV/backend/src/routes/creatorSkills.js`、`services/creatorSkillPackages.js:10-24`、`CV/resources/creator-skills/` |
| `canvasAgentTools` | 受限只读工具执行器（8 个，见上），`estimateRun` 返回 `cost.known:false` / `pricing_registry_unavailable` | `CV/backend/src/services/canvasAgentTools.js:1298` |
| `agentControl*` | **对外 Agent 控制面**：配对/授权/注册表/兼容快照/创作/Run/资产/交付，是 MCP 应当包装的对象 | `CV/backend/src/services/agentControl*.js` |

### 2.4 已有 Seedance 适配器与对外 Agent 资产

- 适配器：`CV/backend/src/providers/seedanceNz.js`（6786 行）。付费 POST 的幂等头：请求头 `x-t8-provider-submission` 经 `providerSubmissionContext` 转成上游 `Idempotency-Key`（`CV/backend/src/services/providerSubmissionContext.js:7-30`，key 正则 `^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$`）。
- 网关事实（`SD`）：视频提交 `POST /v1/videos`（:13，旧 `/v1/video/generations` 仅兼容 :32），轮询 `GET /v1/videos/{task_id}`（:18，建议 3~5 秒 :159），钱包 `GET /api/usage/wallet/`（:31,:62-94，Bearer sk，非令牌额度），Seedance 视频按 Token 且**用量任务完成后才返回**（:1299-1349，「提交前只能估算区间」:1312），提交预扣、成功多退少补、失败全额退款。`usage.amount` 是最终实扣金额而非预扣（:47）。
- 无 embeddings 接口：`SD` 中检索 `embedding` 0 命中。
- 画布自带的 Agent 资产：`zcanvas` CLI（28 个命令，`CV/tools/zcanvas-cli/commandCatalog.json`）与 `zhenzhen-canvas` Skill（`CV/.agents/skills/zhenzhen-canvas/`）。manifest 版本 `0.1.0-dev`，协议 `t8-agent-control-v1` / `t8-canvas-patch-v1`，`minimumDesktopVersion 2.6.4`（`CV/tools/zcanvas-cli/manifest.json`）。

### 2.5 桥接先例（figma / photoshop / vibex）

- Photoshop 桥：默认只监听 127.0.0.1，扩到局域网前必须先有配对 token；薄客户端不保存密钥，密钥留在后端（`CV/docs/nodemap.md`、`CV/docs/project-context-current.md`）。**同一套「回环 + 配对 token + 密钥不出后端」约定就是 MCP 应遵循的约定。**
- VibeX / Browser 节点用 iframe/webview 内嵌外部页（`CV/src/components/nodes/VibeXNode.tsx`、`BrowserNode.tsx`）——方案 i 的画布侧先例。
- figma 桥的具体实现位置：未核实（本次未在 `CV/backend/src` 找到专门路由，只看到 Photoshop 的文档）。

### 2.6 哪些能力可直接包成 MCP 工具，哪些要画布新增接口

| 类别 | 判断 | 依据 |
|---|---|---|
| 直接包装（已有 `zcanvas_*` 能力或 `/tools` 只读工具） | 画布盘点/节点 schema/校验/模拟、资产搜索与血缘、模型目录、创作计划/预览/应用、Run 开始/重试/取消/状态、素材放置/导入、交付收集/打包 | §2.2 路由表；`creative-capability-surfaces.json` 39 个 `zcanvas_*` |
| 需画布新增（建议，均未实现） | (a) 当前选中节点/视口（只读）；(b) 钱包余额只读代理（密钥在画布后端，MCP 不得拿 key）；(c) 价格登记表 + 识别 `usage.amount`（否则 `executionPolicy` 的成本上限一旦配置就 fail-closed：`cost_estimate_unavailable`，见 `CV/backend/src/collaboration/executionPolicy.js:76`）；(d) 语义搜索暴露为 L0 能力（现仅在 `/api/project-assets/semantic/search`，`projectAssets.js:1038`，不在 agent-control 目录里）；(e) 提示词库/资源库只读检索（`/api/resources/*` 是否含提示词条目：未核实）；(f) 面向 MCP 的「批准结果长轮询」减少轮询 | §2.1-2.2 |
| 受限 | Run 在**画布前端**由 `host-renderer` worker 认领执行（`CV/src/components/Canvas.tsx`、`CV/backend/src/collaboration/runIntentAuthority.js`）：画布窗口必须打开，`run.start` 才会真正提交 | 同上 |

---

## 3. 问题二：T8 Canvas MCP 设计

### 3.1 传输建议

| 方案 | 结论 |
|---|---|
| **stdio（P0 推荐）** | DSH 原生支持 `transport: stdio`（`DS/packages/mcp/mcp-client/README.md:28,39`）。无需新监听端口，天然符合画布「只绑 127.0.0.1」约定；复用 `discovery.cjs` 找到本机画布实例，复用 `secureStore.cjs` 取已配对 token。注意 DSH 会先起一个**临时探测进程**再起正式进程（README:28）→ MCP 启动必须**无副作用、无配对、无网络写**，配对做成单独工具 `canvas_pair`。 |
| localhost Streamable-HTTP + 配对 token（P2） | 仅当同一 MCP 要被多个客户端（DSH-zhen、Claude Desktop 等）共享时才值得做。必须 `127.0.0.1` 绑定 + 固定 Origin 校验 + 配对 token，遵循 Photoshop 桥约定；DSH 侧 `headers` 可注入 `Authorization`（README:49-52）。 |
| 令牌如何到达 MCP | **不要放环境变量**：DSH 会清洗匹配 `/KEY|PASSWORD|SECRET|TOKEN/i` 的环境变量与 `DSH_*`（`DS/packages/mcp/mcp-client/README.md:137`）。用画布 secureStore；若必须传，只用 stdio 配置里显式 `env`（会落进 DSH YAML，不推荐）。 |

### 3.2 总体结构

```
创作者
  |
DSH-zhen (Cordis 进程)  <--- 自研插件 dsh-zhen-canvas-guard (tools/pre-execute + ctx.tools.guard)
  |  stdio MCP: mcp__t8canvas__<tool>
T8 Canvas MCP (tools/canvas-mcp, Node)  -- 复用 zcanvas-cli: agentClient / discovery / secureStore
  |  HTTP 127.0.0.1:18766  Authorization: Bearer <分权token>
画布后端 /api/agent-control/v1  --(Electron IPC 审批)--> 画布窗口(host-renderer 认领 RunIntent)
  |                                                          |
  +--------------------> Seedance 网关 https://api.seedance.nz <+
```

### 3.3 工具清单（29 个，要求 >= 15）

命名前缀：DSH 中显示为 `mcp__t8canvas__<tool>`（`DS/packages/mcp/mcp-client/README.md:75`）。**权限等级**四档：`read`（对应画布 L0）、`write`（L1，可逆画布写，需画布审批）、`run`（L1/L2 本地处理或排队执行，需画布审批）、`paid`（L2，会花钱，必须报价 + 双门）。「画布端点」列为实际要调用的现有接口；写「新增」的接口画布尚不存在。

| # | 工具 | 用途 | 输入 JSON-schema 要点 | 返回 | 副作用 | 等级 | 画布端点 |
|---|---|---|---|---|---|---|---|
| 1 | `canvas_status` | 握手：实例、版本、兼容、是否已配对 | `{}` | `{instance, desktopVersion, protocol, capabilityManifestVersion, digests, paired, scopes, compat:{ok,reasons[]}}` | 无 | read | `GET /status` `/session` `/capabilities` |
| 2 | `canvas_pair` | 发起配对并等待用户在画布里点同意 | `{scopes?:["canvas:read","canvas:write"], waitSeconds<=45}` | `{state:"pending"\|"paired"\|"denied"\|"expired"}` | 在画布弹配对确认；成功后 token 存 secureStore | write | `POST /pairings` + `/pairings/:id/poll` |
| 3 | `workspace_list` | 列项目与画布 | `{limit,offset}` | `[{projectId,canvasId,name,updatedAt}]` | 无 | read | `GET /workspaces` |
| 4 | `canvas_inspect` | 分页读画布节点/边 | `{projectId,canvasId,nodeOffset,nodeLimit<=100,edgeOffset,edgeLimit<=200}` | `{nodes[],edges[],counts,nextOffsets,digest}`（服务端分页，MCP 再做字节截断） | 无 | read | `POST /tools` `inspectCanvas` |
| 5 | `node_schema_inspect` | 节点类型/具体节点的参数 schema | `{type?,nodeId?,offset,limit,includeHidden?}` | schema 摘要 | 无 | read | `POST /tools` `inspectNodeSchema` |
| 6 | `canvas_validate` | 校验当前画布 | `{projectId,canvasId}` | `{ok,issues[]}` | 无 | read | `POST /tools` `validateCanvas` |
| 7 | `plan_simulate` | 对一个提案做模拟（不落盘） | `{proposal}` | 模拟后的图与告警 | 无 | read | `POST /tools` `simulateExecutionPlan` |
| 8 | `asset_search` | 在项目素材库检索（P0 用现有 `searchAssets`；P1 切语义搜索） | `{query,kind?,limit<=50,offset}` | `[{assetId,kind,name,tags,thumbnailRef,score?}]` | 无 | read | `POST /tools` `searchAssets`；语义版需**新增** L0 能力 |
| 9 | `asset_get` | 取素材详情与血缘 | `{assetId,includeLineage?}` | 元数据 + 血缘（不含二进制） | 无 | read | `GET /assets/:id`、`/lineage` |
| 10 | `subflow_search` | 搜索可复用子流程/工作流 | `{query,limit,offset}` | 列表 | 无 | read | `POST /tools` `searchSubflows` |
| 11 | `model_list` | 可用模型与参数范围（时长、分辨率、参考数上限） | `{kind:"image"\|"video"\|"audio"\|"llm",filter?}` | 模型目录裁剪（目录约 llm 34 / image 69 / video 136 / audio 19 项，见 `creativeModelCatalog.json`） | 无 | read | `GET /models` |
| 12 | `creative_read` | 读 Story/导演台/比较/交付清单 | `{action:"compare"\|"story.inspect"\|"director.inspect"\|"video-edit.deliver",input}` | 对应只读结果 | 无 | read | `POST /creative-read`（:1178；允许的 action 以 `agentControlCreative.js:5620` 为准） |
| 13 | `media_quote` | **报价**：生成创作计划 + 价格区间 + 钱包余额，不花钱 | `{kind,model,params:{seconds,resolution,refs[],...},maxSpend?}` | `{quoteId,planId,planDigest,estimate:{currency,low,high,basis,assumptions[]},wallet:{balance,asOf}\|null,expiresAt}` | 在 MCP 本地账本写 quote；画布端只做 plan，不落节点 | read | `POST /creative-plans`（operation=plan/preview）+ `GET /models` + 价格表（**新增**）+ 钱包（**新增**） |
| 14 | `canvas_apply_plan` | 把计划应用到画布（新建节点、连线、填 prompt），不触发生成 | `{planId,planDigest,quoteId?}` | `{approvalRequestId,state:"awaiting-canvas-approval"}` → 批准后 `{nodeIds[],patchId}` | 画布写，可回滚 | write | `POST /creative-approvals` + `/approvals/:id/complete` |
| 15 | `node_add` | 新增单个节点 | `{type,position?,params}` | 同上 | 画布写 | write | `zcanvas_canvas_node_add`（L1）经 `/capability-tools/invoke` |
| 16 | `node_edit_prompt` | 批量改提示词/参数 | `{edits:[{nodeId,patch}]}` | 同上 | 画布写，可回滚 | write | `/patch-approvals`（:1634） |
| 17 | `canvas_connect` | 连线/断线 | `{edges:[{from,to,port?}],mode:"add"\|"remove"}` | 同上 | 画布写 | write | `/patch-approvals` |
| 18 | `patch_revert` | 撤销一次 Agent 补丁 | `{patchId}` | 同上 | 画布写 | write | `/patch-revert-approvals`（:1695）、`GET /patches` |
| 19 | `asset_place` | 把已保存素材放到画布 | `{assetId,position?,targetNodeId?}` | 同上 | 画布写 | write | `/asset-place-approvals`（:1439） |
| 20 | `asset_import` | 导入外部素材（URL/本地文件） | `{source:{url\|path},kind,tags?}` | `{approvalRequestId}` → `{assetId}` | 下载并入库（大小/域名受画布策略约束，细节未核实） | run | `/asset-import-approvals`（:1560） |
| 21 | `image_submit` | 提交图片生成（**付费**） | `{quoteId,confirmToken}` | `{intentId,status:"queued"}` | 创建 RunIntent，由画布提交上游 | paid | `/run-plans` → `/run-start-approvals` |
| 22 | `video_submit` | 提交视频生成（**付费**） | 同上 | 同上 | 同上 | paid | 同上 |
| 23 | `audio_submit` | 提交音频/音乐生成（**付费**） | 同上 | 同上 | 同上 | paid | 同上 |
| 24 | `run_wait` | 长轮询 Run 状态（避开 DSH 60 秒工具超时） | `{intentId,waitSeconds<=45}` | `{status,progress?,completionVerified,assetIds[],cost?:{amount,currency,source},acceptance:"accepted"\|"unknown"\|"none"}` | 无（**只查询，绝不重发 POST**） | read | `GET /run-intents/:id`、`POST /tools` `inspectRun` |
| 25 | `run_retry` | 仅重试失败部分（**付费**，新审批） | `{intentId,failedOnly:true,quoteId}` | 同 `*_submit` | 新 RunIntent | paid | `/run-retry-approvals`（:909） |
| 26 | `run_cancel` | 取消排队/运行中的 Run | `{intentId}` | `{state}` | 取消不保证退款（以 Seedance 结算为准） | run | `/run-intents/:id/cancel`（:989） |
| 27 | `delivery_package` | 收集并打包交付物 | `{scope,target}` → 先 `delivery_collect` | `{approvalRequestId}` → `{packagePath,manifest}` | 写文件到交付目录 | run | `GET /delivery/collect`、`/delivery-package-approvals`、`/delivery/verify` |
| 28 | `canvas_selection` | 读用户当前选中节点（**新增**） | `{}` | `{nodeIds[],viewport}` | 无 | read | 画布**未提供**，需新增 L0 只读接口（未核实现状） |
| 29 | `capability_invoke` | 直通画布版本化能力（`zcanvas_*`），供 SKILL 编排多步创作（Story/本地化/迭代/合成等）；按 `action` 与 `operation` 动态映射为 read/write/run/paid，守卫按映射后的等级裁决 | `{tool:"zcanvas_*", operation:"plan"\|"preview"\|"apply"\|"run"\|"verify"\|"resume"\|"cancel"\|"rollback", input}` | 能力结果；`apply/run` 返回审批请求 | 取决于能力 | 动态 | `POST /capability-tools/invoke`（:746）；请求体字段以 `agentControlCapabilityTools.js` 为准，未核实 |

说明：
- 本地处理类能力（`video.extract-frames`、`image.remove-solid-background`、`image.resample-upscale`，均 L1 且 run 为 L1，见 `creative-capability-surfaces.json`）不花钱，归 `run` 档，不进 `paid`。
- `zcanvas_localization_*`、`zcanvas_create_story`、`zcanvas_story_plan_previews`、`zcanvas_video_edit_compose` 等多步付费能力在 P0 **不单独暴露**，而是经通用 `capability_invoke`（第 29 个工具）+ 对应 SKILL 编排；它们的 `run` 操作同样套用 `paid` 守卫。
- 所有分页参数服务端强制上限；MCP 返回正文再做字节截断（见 §3.4）。

### 3.4 Resources 与 Prompts

DSH 对 MCP 的支持边界（`DS/packages/mcp/mcp-client/README.md:12,208`；`DS/packages/mcp/mcp-resources/README.md`）：**不支持 MCP prompt 模板**、不支持资源订阅；资源只能经三个共享「按需读取」工具访问，且**不做大小限制**，所以服务端必须自己限长。

| Resource URI | 内容 | 大小策略 |
|---|---|---|
| `canvas://project/{projectId}/graph` | 画布摘要图（节点 id/type/标题/连线），不含大文本、二进制 | <= 64 KiB，超出给分页链接 |
| `canvas://project/{projectId}/node/{nodeId}` | 单节点完整参数与最近 Run | <= 64 KiB |
| `canvas://project/{projectId}/assets?kind=&q=` | 素材列表 | 每页 <= 50 条 |
| `canvas://project/{projectId}/asset/{assetId}` | 素材元数据 + 血缘 | 元数据，无二进制 |
| `canvas://project/{projectId}/run/{intentId}` | Run 状态、尝试、事件摘要 | <= 32 KiB |
| `canvas://models/{kind}` | 模型目录裁剪视图 | <= 64 KiB |
| `canvas://wallet` | 钱包余额（**需画布新增只读代理**） | 极小 |
| `canvas://policy` | 当前预算/审批策略（只读，来自 MCP 本地配置 + 画布 `project_execution_policies`） | 极小 |

Prompts：MCP 层提供 `quote-before-generate`、`storyboard-from-script`、`review-last-run` 三个模板，**仅服务于非 DSH 客户端**（Claude Desktop 等）。DSH-zhen 不消费 MCP prompt，同样的编排逻辑放进 SKILL（§5）。

### 3.5 付费安全

**原则**：估价/预览 -> DSH 审批 -> 画布审批 -> 单次提交 -> 只查询。

1. **报价不是承诺**。Seedance 视频按 Token，用量任务完成后才返回（`SD:1312`），提交预扣只是占位（`SD:1313`）。`media_quote` 必须返回区间 + 假设：
   - `basis=history`：同模型/分辨率/时长在画布历史 `run_attempts.usage` 中的 P10-P90（需要先让画布识别 `usage.amount`，否则取不到：`runUsage.js` 当前不认 `amount`）。
   - `basis=doc-table`：按 `SD:1317` 起的 Token 单价表 x 估算 Token 数。**Token 数估算公式：待实测**（文档只说「与分辨率、时长、内容复杂度相关」）。单价表必须运行时重新抓取，禁止硬编码。
   - `basis=none`：无法估算时只返回钱包余额与用户设置的上限，并在审批文案里明说「金额未知」。
   - 按次计费模型（可灵/海螺/Vidu 等，`SD:1301`）可给出确定值，但具体金额以控制台为准（`SD:1303`）。
2. **一份报价只能提交一次**：`*_submit` 必须带 `quoteId`；MCP 在本地账本里把 `quoteId -> operationId(UUID) -> intentId` 绑定。同一 `quoteId` 重复调用返回已有 intent，不新建。这样即使 DSH 工具 60 秒超时后模型重试，也不会双花。`operationId` 同时作为画布 RunIntent 的 `idempotencyKey`（`CV/backend/src/collaboration/runIntentAuthority.js`），并经 `x-t8-provider-submission` 变成上游 `Idempotency-Key`。
3. **拿到 task_id 之后只许查询**。画布既有铁律：受理不明或下载失败的付费任务不得重发（`CV/.agents/skills/zhenzhen-canvas/SKILL.md` v3.2.0 条目；`docs/seedance-nz-suno-v6-actions.md`）。MCP 把该状态暴露为 `acceptance:"unknown"`，并且**不提供**任何会在 `unknown` 状态下重发的工具；`run_retry` 只允许 `failedOnly` 且需新的 `quoteId` 与新审批。
4. **预算上限**（三层，取最严）：
   - 单次 `maxSpendCny`（`media_quote` 入参，超则拒绝出报价）；
   - 会话/日累计上限（MCP 本地配置，如 `~/.t8-canvas-mcp/policy.json`，字段名为建议，未实现）；
   - 画布侧 `project_execution_policies`（每 Run/每日成本上限）。该层今天**不可用**：配置了上限而无价格登记表时会 fail-closed（`executionPolicy.js:76`）。→ 建议画布新增价格登记表。
5. **审计**：画布 `audit_events` 表（已有）+ MCP 本地追加式 JSONL（不记录密钥、不记录签名 URL）+ DSH 会话日志里的 `approval/asked` / `approval/decided` 对（`DS/docs/subsystems/approval.md:11`）。三处用同一个 `operationId` 串起来。
6. **画布侧批准是唯一权威**：DSH 批准只是「用户同意花这笔钱」，画布批准才是「这次精确应用被授权」。批准 10 分钟过期（内存 TTL）。

### 3.6 序列图：生成视频

```
   创作者       DSH模型   DSH守卫/审批  Canvas-MCP    画布后端     画布窗口     Seedance
      |            |            |            |            |            |            |
      |-(1)-------->            |            |            |            |            |
      |            |-(2)--------------------->            |            |            |
      |            |            |            |-(3)-------->            |            |
      |            |            |            <-(4)--------|            |            |
      |            <-(5)---------------------|            |            |            |
      |            |-(6)--------------------->            |            |            |
      |            |            |            |-(7)-------->            |            |
      |            |            |            <-(8)--------|            |            |
      |            <-(9)---------------------|            |            |            |
      |            |-(10)------->            |            |            |            |
      <-(11)--------------------|            |            |            |            |
      |-(12)-------------------->            |            |            |            |
      |            |            |-(13)------->            |            |            |
      |            |            |            |-(14)------->            |            |
      |            |            |            |            |-(15)------->            |
      |-(16)----------------------------------------------------------->            |
      |            |            |            |            <-(17)-------|            |
      |            |            |            |            |-(18)-------------------->
      |            |            |            |            <-(19)--------------------|
      |            <-(20)--------------------|            |            |            |
      |            |-(21)-------------------->            |            |            |
      |            |            |            |-(22)------->            |            |
      |            |            |            |            |-(23)-------------------->
      |            |            |            |            <-(24)--------------------|
      |            |            |            <-(25)-------|            |            |
      |            <-(26)--------------------|            |            |            |
      <-(27)-------|            |            |            |            |            |
      |            |            |            |            |            |            |
```

图例（编号对应图中箭头；`P` = T8 Canvas MCP）：

| 步 | 内容 |
|---|---|
| 1 | 创作者：「把这张商品图做成 5 秒 720P 镜头」 |
| 2 | 模型读画布：`canvas_status`、`asset_search`、`canvas_inspect`（read，守卫直接放行） |
| 3 | MCP 调 `GET /status`、`/capabilities`、`/session` 与 `POST /tools`（`searchAssets`、`inspectCanvas`） |
| 4-5 | 画布返回版本/摘要匹配结果与素材、节点摘要，MCP 交还模型 |
| 6 | 模型调 `media_quote{video, model, 5s, 720P, refs}` |
| 7-8 | MCP 调 `POST /creative-plans`（只出计划，不花钱）；再查价格表、历史 `usage`、钱包（后三项需画布新增，见附录 B） |
| 9 | MCP 返回 `quote{quoteId, 区间, 假设, 余额, expiresAt}`；守卫插件在 `tools/post-execute` 缓存摘要 |
| 10 | 模型调 `video_submit{quoteId}`；守卫插件在 `tools/pre-execute` 返回 `ask{reason, displayReason}` |
| 11-12 | **第一道门**：DSH 审批卡「视频预计 x-y 元，余额 z 元，上限 c 元」，用户同意（`allowed-once`） |
| 13 | 放行；`ctx.tools.guard` 校验 `quoteId` 存在、未过期、未使用；MCP 账本写入 `quoteId -> operationId` |
| 14 | MCP 调 `POST /creative-approvals`（apply）；批准后 `POST /run-plans`，再 `POST /run-start-approvals` |
| 15-16 | **第二道门（权威）**：画布窗口弹出审批卡（先 L1 写画布，再 L2 生成），用户在画布里批准（Electron IPC） |
| 17 | 画布创建 RunIntent（`idempotencyKey = operationId`），`host-renderer` 认领 |
| 18-19 | 画布后端 `POST /v1/videos` 带 `Idempotency-Key`，**仅此一次**；拿到 `task_id` 立即落库，此后只查询 |
| 20 | MCP 立即返回 `{intentId, status:"queued"}`（远小于 DSH 的 60 秒工具超时） |
| 21-22 | 模型循环 `run_wait{intentId, waitSeconds<=45}`；MCP 长轮询 `GET /run-intents/:id` |
| 23-24 | 画布后端每 3~5 秒 `GET /v1/videos/{task_id}`（文档建议，`SD:159`；画布实际间隔未核实），直至 `completed`，带 `usage.amount` |
| 25 | 结果落入项目素材库（`assets` + `asset_lineage`），`completionVerified`；MCP 取回 `assetIds` 与实际花费 |
| 26 | 模型再调 `asset_get` / `delivery_collect` 取封面帧（以图片块返回） |
| 27 | 模型向创作者汇报：成品节点链接（`canvas://project/...`）、实际花费、剩余余额、下一步建议 |

异常分支：任一步超时或断线，只能用 `run_wait` / `inspectRun` 查询**原** `task_id`；绝不再次 `POST /v1/videos`；`acceptance = unknown` 时交给用户在画布里处理。

要点：
- 画布窗口未打开则 `run-start` 无人认领（`host-renderer` 在 `Canvas.tsx`）；MCP 在 `canvas_status` 里要探测并提示。
- 视频结果只能以文本 + 封面图片返回（DSH 富结果只支持图片：`DS/packages/mcp/mcp-client/README.md:87`），视频本体经画布节点链接查看。
- `run_wait` 的 `waitSeconds <= 45` 保证单次工具调用低于 DSH 默认 `toolCallTimeoutMs=60000`（README:61,85）。

### 3.7 与 DSH 审批/权限预设的映射

DSH 侧事实（均有来源）：
- MCP 工具名 `mcp__<server>__<tool>`；MCP 返回里的注解不参与策略，README 中没有「按只读/破坏性注解自动审批」的机制（`DS/packages/mcp/mcp-client/README.md`，grep `annotation` 仅出现在测试里）→ **需要自研守卫**。
- `tools/pre-execute` 瀑布返回 `PreToolDecision = allow | deny | cancel | ask{reason, displayReason}`；`ask` 只有审批服务返回 `allowed-once` 才放行（`DS/docs/subsystems/tools.md:398-415`）。
- `ctx.tools.guard(fn)` 是同步、**只能拒绝**的最终守卫，无 allow 结果，不受监听器顺序影响（`DS/docs/subsystems/tools.md:324-340,538-552`）。
- 审批请求**不携带工具参数**，靠 `callId` 挂到已展示的工具调用上（`DS/docs/subsystems/approval.md:53`）。所以报价文案要放进 `reason/displayReason`，由守卫插件根据缓存的 quote 拼出。
- 审批策略只有 `ask | never`；`never` 下所有 ask 直接 `rejected`（`approval.md:33-46`）。权限预设只是「沙箱模式 + 审批策略」的组合，不管 MCP 工具（`DS/packages/interaction/permission-presets/README.md:12`）。
- 审批结果闭合集 `allowed-once | rejected | cancelled | unavailable`，只有 `allowed-once` 放行，**没有「本次会话一直允许」**（`approval.md:21`）。

| MCP 等级 | 画布风险 | DSH 守卫行为（建议） | 预设交互 |
|---|---|---|---|
| read | L0 | `allow`（不打扰） | 所有预设下都可用；若 `approval=never` 也可用（不走 ask） |
| write | L1 | `ask`，文案「将修改画布: 新增 N 节点 / 改 M 处提示词」；画布侧另有审批卡 | `ask` 预设下可用；`never` 下被拒（只读观察模式） |
| run | L1/L2（无直接花费） | `ask`，文案含影响范围 | 同上 |
| paid | L2 | `ask`，文案含报价区间、余额、上限；另有 `ctx.tools.guard` 兜底：`quoteId` 缺失/过期/已用即 `deny` | `never` 下一律被拒；**`danger-full-access` 预设下是否也被拒：待实测**（按文档推断 `never` 会拒绝所有 ask，这对付费工具反而安全） |

注意事项：
- **不要对付费工具启用 Auto review**（`DS/packages/experimental/auto-review/README.md`：它让模型评估后「允许则以完全访问执行」，官方标注可能放行不安全动作）。守卫插件的监听器需在 Auto review 之前裁决，或靠 `guard` 兜底；两者交互顺序：待实测。
- 实验性 `hooks-claude-code`（`DS/packages/experimental/hooks-claude-code/README.md`）可以复用 Claude Code 的 hooks.json 阻断工具调用，但它是实验包，守卫逻辑建议写成独立 Cordis 插件。
- 具体插件 API 字段（`ToolExecution` 中取参数与工具名的属性名）以 `DS/docs/subsystems/tools.md:300-340` 为准，**本备忘录未验证**，实现前读一遍。

---

## 4. 问题三：反向集成方案对比

| 维度 | (i) 画布内嵌 DSH-zhen Web UI（webview/iframe） | (ii) 画布后端拉起 dsh 无头/SDK（JSON-RPC）作「创作助手」 | (iii) 仅 MCP：DSH-zhen 独立窗口遥控画布 |
|---|---|---|---|
| 工作量 | 中。画布新增一个侧栏/节点承载页面；DSH 照常自己起 Web 服务。需处理主题、尺寸、登录态 | 大。要在画布里写完整聊天 UI、流式渲染、会话持久化、审批 UI、进程守护；还要把 dsh 运行时（DSH 的 CLI 由 Python 运行时轮子打包：`DS/python/README.md`）塞进 Electron 安装包（Windows EXE 已 1.3 GB 量级，`CV/.agents/skills/zhenzhen-canvas/SKILL.md` 发布说明） | 小到中。主要是 `tools/canvas-mcp` + 守卫插件 + SKILL + 配对流程 |
| 体验 | 最像「画布内助手」；一个窗口；但嵌入页要和画布主题协调（令牌参考 `CV/docs/theme-design-guide.md`、`routes/themes.js`） | 最好：权限提示可直接渲染成画布审批卡，一套审批；可做选区联动 | 两个窗口来回切；但画布审批卡本来就在画布窗口，付费链路已清晰 |
| 风险 | DSH Web 的安全模型：token + cookie + 同源 Origin 围栏（`DS/packages/client/connection/src/api-request-trust.ts`、`DS/packages/host/webserver/README.md`）。放进 iframe 后 cookie 隔离/第三方分区、CSP/frame-ancestors 行为**待实测**。**Cookie 不按端口隔离**，同在 127.0.0.1 的 DSH 与画布后端会互相收到对方 cookie，需约定不同 cookie 名 | 无头协议选型：**ACP 优于 SDK**。ACP 有 `session/request_permission` 一次性放行/拒绝，且 `session/new` 能挂载 stdio/HTTP MCP 服务（`DS/packages/acp/acp/README.md:66,74`）；SDK 摘要只提到开会话、发提示、观察事件/状态/子智能体完成（`DS/packages/sdk/README.md` Summary），未提审批、取消、版本协商；协议包 `DS/packages/sdk/protocol/` 本次未读，故「SDK 不能呈现审批」只是推断，待核实。DSH 公共 API 仍属稳定前，升级会破坏集成 | 分发：用户要自己装 DSH-zhen；配对与升级由两个产品各自负责 |
| 与付费安全的契合度 | 审批仍在 DSH 页内 + 画布窗口，双门体验割裂 | 可合并成一道门：DSH 守卫的 `ask` 由画布审批卡承接，再由画布审批做权威（需要画布新增「批准会话预算」能力） | 双门，文案要清晰 |
| 可逆性 | 高（去掉面板即可） | 低（深度耦合） | 最高 |

**阶段性建议**

- **P0 = (iii) 仅 MCP**：最快验证价值，且不改变画布现有安全模型。交付物：`tools/canvas-mcp`、`dsh-zhen-canvas-guard` 插件、首批 SKILL、契约测试。
- **P1 = (i) 嵌入**：P0 稳定后，用画布已有 iframe/webview 先例做一个「助手」侧栏。前置条件：(a) DSH-zhen Web 在 iframe 里完成 cookie/Origin/CSP 实测；(b) 画布提供 `canvas_selection`；(c) 主题令牌对齐。
- **P2 = (ii) ACP 无头助手**：仅在用户明确要「一个窗口、一套审批」时做；用 ACP 而非 SDK；先在 DSH-zhen 里把 ACP 路径跑通再在画布侧写 UI。
- 不 fork DSH core：用外置 Cordis 插件 + profile patch 扩展（`DS/packages/boot/app-boot/README.md`、`DS/packages/boot/plugin-manager/README.md`），降低上游同步成本。

---

## 5. 问题四：创作 SKILL 包

### 5.1 格式核对

| 项 | DSH | 画布 creatorSkills | 兼容性 |
|---|---|---|---|
| 目录形态 | `<root>/<name>/SKILL.md` 或平铺 `<name>.md`；**不扫描嵌套 `**/SKILL.md`** | 包内 `SKILL.md` + 资源，打包为 `t8-creator-skill-package-v1`（zip，限 128 文件/8 MiB 压缩/16 MiB 总量/指令 64 KiB/frontmatter 16 KiB） | 目录结构一致，注意只放一层 |
| frontmatter | 必填 `name`（kebab-case）、`description`；可选 `whenToUse`、`metadata`、`disable-model-invocation`、`user-invocable`；非法布尔值整条丢弃 | `name`、`description`、`license`、`metadata.version` | **交集足够：`name` `description` `license` `metadata`** |
| 发现根 | 项目 `.dsh/skills`(100)、项目 `.agents/skills`(200)、自定义目录(300)、用户 `~/.dsh/skills`(400)、用户 `~/.agents/skills`(500)；热监视 | 画布内置目录 `CV/resources/creator-skills/` + 导入安装 | DSH 可直接把画布仓库的 `.agents/skills` 当作项目根 |
| 目录描述上限 | `catalogDescriptionMaxLength` 默认 500，可配置，最小 3 | 无此限制 | **现有 `zhenzhen-canvas` 的 description 长 707 字符**（`SKILL.md` 第 3 行），在 DSH 目录里会被截断；截断后的触发效果：待实测 |
| 画布专属元数据 | 无 | 旁路 `catalog.json`：`id/title/version/kind/adapterId/presentation/contract/quality/maintenance`（`CV/resources/creator-skills/catalog.json`）；`contract.schema = t8-creator-skill-contract-v1`（参考图个数、输出上限、检查项） | 旁路文件，DSH 不读；平铺 `.json` 不会被误认作 skill |
| 代码 | 技能可带脚本，是否执行取决于模型调用工具 | **禁止可执行代码生效**（`.py/.js/...` 仅作源码保留，`CODE_EXTENSIONS`，`creatorSkillPackages.js:23-26`） | 双边共用的包里**不放脚本** |
| 来源 | `DS/packages/skill/skill-filesystem/README.md:36-54,109`；`DS/packages/skill/tool-skill/README.md:48` | `CV/backend/src/services/creatorSkillPackages.js:10-26` | |

### 5.2 「一份 SKILL 两边用」方案

- **单一来源**：新仓/新目录 `skills/<name>/SKILL.md`，frontmatter 只用交集字段；画布专属字段放同级旁路 `catalog.json`（画布导入时读，DSH 忽略）。
- **DSH 侧附加字段**（`whenToUse`、`user-invocable`）放进 frontmatter 即可，画布端的 YAML 解析是否容忍未知键：**待实测**；若不容忍，则用转换器（构建期脚本）生成画布版 SKILL.md（去掉 DSH 专属键）。
- **工具名映射**：SKILL 正文引用工具时用中性写法「画布 MCP 的 `video_submit`」，DSH 实际名 `mcp__t8canvas__video_submit`。画布端的创作 Skill 不能调用 MCP（它们只驱动画布内置 adapter），所以**付费编排类 SKILL 只在 DSH 侧生效**，画布侧只收「创作方向类」SKILL。
- **转换器清单**（仅在 YAML 不兼容时需要）：去 DSH 专属键 / 生成 `catalog.json` 骨架 / 校验 `name` 正则与 description 长度 / 校验体积上限。

### 5.3 首批 15 个 SKILL

「依赖 MCP 工具」列用 §3.3 的工具名；「证据」列指向画布能力或现有资产，**无证据的标「建议新增」**。

| # | name | 一句话 | 触发 | 依赖 MCP 工具 | 付费 | 证据 |
|---|---|---|---|---|---|---|
| 1 | `canvas-quickstart` | 检查连接、配对、盘点工作区与可用模型 | 「连上画布」「看看我的项目」 | `canvas_status` `canvas_pair` `workspace_list` `model_list` | 否 | zcanvas `status/doctor/workspace`（`commandCatalog.json`） |
| 2 | `quote-before-generate` | 任何生成前先出报价、对齐预算与假设 | 用户要「生成/出片/批量」时自动前置 | `media_quote` | 否（但前置于所有付费） | 画布无价格登记（`pricing_registry_unavailable`），属流程纪律；**建议新增** |
| 3 | `product-image-direction` | 一张商品图做一张广告创意图 | 「做商品主视觉」 | `asset_search` `media_quote` `image_submit` `run_wait` | 是 | `CV/resources/creator-skills/product-image-direction`（image-v1） |
| 4 | `product-motion-shot` | 一张商品图做一段连续镜头 | 「让商品动起来」 | 同上 + `video_submit` | 是 | `.../product-motion-shot`（video-v1） |
| 5 | `product-prompt-brief` | 把商品需求写成可复用提示词简报 | 「写个商品 brief」 | `asset_search` `node_edit_prompt` | 否 | `.../product-prompt-brief`（text-v1） |
| 6 | `script-polish` | 完善/改写剧本并回写剧本节点 | 「润色剧本」 | `canvas_inspect` `canvas_apply_plan` `media_quote` | 是（LLM 用量） | `zcanvas_create_script` |
| 7 | `story-to-storyboard` | 剧本 -> Story 分析 -> 合成提示词 -> 分镜预览 | 「拆分镜」「做分镜台」 | `creative_read` `canvas_apply_plan` `capability_invoke` | 部分 | `zcanvas_story_analyze/import/compile/plan_previews`、`zcanvas_director_materialize` |
| 8 | `full-production-story` | 全自动制片（高成本，强制预算上限） | 「一键成片」 | `media_quote` `capability_invoke` `run_wait` | 是（高） | `zcanvas_create_story` |
| 9 | `shot-iteration-review` | 对比候选、采用、分支、回滚 | 「哪个更好」「回到上一版」 | `creative_read` `capability_invoke` | 否 | `zcanvas_iterate_compare/review/accept/branch/rollback` |
| 10 | `consistency-lock` | 锁定角色/风格一致性，生成前引用 | 「锁定这个角色」 | `capability_invoke` `asset_get` | 否 | `zcanvas_iterate_lock/unlock` |
| 11 | `image-edit-retouch` | 修改已有图片（局部改、去纯色背景、等比放大） | 「改这张图」 | `asset_get` `media_quote` `image_submit` | 部分 | `zcanvas_edit_image`、`image_remove_solid_background`、`image_resample_upscale` |
| 12 | `video-edit-remix` | 修改视频、抽帧、合成为片 | 「改这段视频」「合成成片」 | `asset_get` `capability_invoke` `video_submit` | 部分 | `zcanvas_edit_video`、`video_extract_frames`、`video_edit_compose` |
| 13 | `localize-dub` | 多语言转写、翻译、配音、合成、质检、打包 | 「做英文版」「配音」 | `capability_invoke` `run_wait` | 是 | `zcanvas_localization_*`（8 个） |
| 14 | `asset-hygiene` | 素材检索、去重、打标签、放置与导入 | 「找素材」「整理库」 | `asset_search` `asset_get` `asset_place` `asset_import` | 否 | `/assets` 路由、`asset_duplicate_*`、`zcanvas_asset_place/import` |
| 15 | `delivery-handoff` | 收集交付物、打包、核验 | 「交付」「打包给客户」 | `delivery_package` `asset_get` | 否（本地打包） | `zcanvas_delivery_package`、`/delivery/*` |

另外建议新增（不计入上表 15 个，等 RAG 就绪再做）：`creative-rag-lookup`（先查风格指南/历史再动手）、`budget-guard`（长任务预算看门，复用 #2）。

注意：#2 与 `creative-rag-lookup` 是 DSH 侧流程纪律，不对应画布能力；其余 13 个均有画布能力或现有资产为证。

---

## 6. 问题五：创作者 RAG

### 6.1 现状

- **画布已有素材语义索引**：`asset_semantic_*` 表；FTS5 trigram + 多语 MiniLM-L12（384 维）；BLIP 描述；TrOCR 文字识别；RRF 混合检索，对外路由 `POST /api/project-assets/semantic/search`（`CV/backend/src/routes/projectAssets.js:1038`；`CV/backend/src/services/assetSemanticModels.js`）。不在 agent-control 目录，需新增 L0 能力才能被 MCP 使用。
- **DSH 无 RAG/embedding 接缝**：检索类只有 `session-search`（会话历史，`DS/packages/experimental/session-search`），知识库需自带。
- **Seedance 无 embeddings 接口**（`SD` 检索 `embedding` 0 命中）。

### 6.2 索引什么

| 数据源 | 来源 | 分块 | 元数据（用于引用卡片） | 刷新触发 | 隐私级 |
|---|---|---|---|---|---|
| 画布项目/节点 | `canvas_inspect` 分页（`canvas_documents`） | 每节点一块：类型 + 标题 + 提示词/文本 + 邻居 id；长文本按 ~600 字切 | `projectId/canvasId/nodeId/type/updatedAt` | 画布 digest 变化（`inspectCanvas` 返回 digest） | 本地 |
| 提示词/资源库 | 画布 `/api/resources/*`（`routes/resources.js`：categories/items/sets/poses/workflows），**是否含提示词条目未核实** | 每条目一块 | `resourceId/category` | 手动 + 启动时 | 本地 |
| 素材元数据与标签 | `asset_search`/`asset_get`（`assets`、`asset_tags`）；图像描述/OCR 直接复用画布语义索引，不重复算 | 每素材一块 | `assetId/kind/tags/lineage` | 素材变化事件（轮询 `assets` 修订号，`asset_catalog_revisions` 表存在，用法未核实） | 本地 |
| 用户参考文档/风格指南 | 用户指定的文件夹（md/txt/pdf） | 标题层级优先，其次 400-800 字窗口，重叠 80 字 | 文件路径、标题链、页码 | 文件 mtime | 本地 |
| SKILL 文档 | 本备忘录 §5 的技能库 | 按小节 | `skill/name` | 文件变化 | 本地 |
| 生成历史 | `run_attempts`/`creator_*`、`run_inspect` | 每次生成一块：提示词 + 参数 + 模型 + 结果 assetId + 花费 | `intentId/assetId/cost` | Run 完成事件 | 本地 |

### 6.3 检索与嵌入

- **BM25 优先、混合为辅**：先用 SQLite FTS5（中文用 trigram 分词，与画布一致）出候选，召回不足再叠加向量。BM25 对提示词、术语、人名等字面匹配稳定、零模型依赖，适合首版。
- **向量增强（可选）**：本地 ONNX 中文小模型（候选：画布已用的 multilingual MiniLM-L12 384 维，复用其模型文件与分词器，**避免再下载一套**；更优的中文专用小模型如 bge-small-zh：**待实测**）。无需联网，无需 Seedance。
- **sqlite-vec vs FTS5**：FTS5 是 SQLite 内置，P0 直接用；`sqlite-vec` 是原生扩展，需要为 Windows/macOS/Electron ABI 分别构建与签名，**画布 AGENTS.md 对原生依赖与发布有严格门禁**，所以 P0 向量用「BLOB 列 + 小规模暴力余弦」（万级以内可接受）；规模再大才评估 `sqlite-vec`（待实测性能与分发成本）。
- **重排**：RRF 融合（与画布同法），不引入额外 reranker。
- **形态**：独立 MCP 服务 `creative-rag`（stdio），工具 `rag_search{query,sources[],k}`、`rag_open{docId}`、`rag_reindex{source}`、`rag_status`。独立于画布 MCP，便于只装其一。

### 6.4 聊天中的引用展示

- `rag_search` 返回结构化 `hits:[{docId,source,title,snippet,score,locator}]`；守卫/表现层插件把命中渲染为「来源卡片」。
- `locator` 用画布深链：节点卡片链接形如 `canvas://project/{id}/node/{nodeId}`（URI 形式，P1 嵌入或自定义协议处理器才能真正跳转，P0 仅作文本引用——跳转实现**待设计**）。
- DSH 现有 UI 扩展点可挂卡片：`DS/packages/client/ui-tool`（按工具名注册 `tool.call.toolview`）、`ui-slots`、`ui-reference`（`@` 提及文件/会话）。具体渲染方案未验证。
- 强制规则：模型回答里引用来源必须用卡片 id，不得自造路径。

### 6.5 隐私与增量

- **本地优先**：索引库放用户目录（如 `~/.t8-creative-rag/`），不上传；嵌入模型本地推理；任何外发（例如让云端 LLM 看命中片段）都只发被选中的片段。
- **敏感分级**：来源有 `private/shareable` 标记；默认 `private` 的内容不进入 DSH 的 `reason/displayReason` 与日志。
- **增量**：按「来源 + 内容哈希」去重；节点用 `inspectCanvas` digest、文件用 mtime+size+sha、素材用修订号；删除通过墓碑标记。
- **容错**：索引失败不影响画布；首次索引带进度与可取消。

---

## 7. 问题六：风险与交接

### 7.1 DSH-zhen 开发者必须遵守的画布 AGENTS.md 规则

出处：`CV/AGENTS.md`（52 行，逐条以原文为准；它写的是 Windows 默认目录 `E:\PenguinPravite\T8-penguin-canvas`，本次勘察用的是只读克隆快照）。只要 `tools/canvas-mcp/` 放在画布仓库内，下列规则同样约束 DSH-zhen 一侧的开发者。

1. **开工前阅读顺序**：先完整读 `AGENTS.md`、根 `SKILL.md`、`docs/project-context-current.md`，再读 `package.json` 相关配置与本任务源码/测试。`features.json`、`roadmap.md` 不整份加载，用 `node scripts/read-project-context.cjs find <关键词>` 等命令按任务查询（本克隆缺根 `SKILL.md`，见 §0）。
2. **记录从简**：只更新当前状态与证据链接，详细过程写进专题文档，禁止在 SKILL/features/roadmap 多处复制长段流水账。
3. **目录与 worktree 门**：`E:\PenguinPravite\T8-penguin-canvas` 是唯一默认开发目录；新功能开始前跑 `npm run worktree:check` 与 `npm run worktree:development` 并记录绝对路径、branch、HEAD、common dir；不通过复制目录同步代码；release 命名路径冻结，不得在其中开发；新增开发入口必须接入同一 worktree 角色门。
4. **永久保护**：禁止 `reset`、`clean`、checkout 覆盖、整树复制、整树 ours/theirs 或任何丢弃本地修改的操作；不得编辑或暂存 `tools/ffmpeg-runtime/ffmpeg.exe`（143,314,432 字节）与 `tools/remove-ai-watermarks-runtime/README.md`（2,298 字节），二者 SHA-256 以 `CV/AGENTS.md` 原文为准，改动前必须比对。
5. **数据库**：不得读取 retained/historical 项目数据库；数据库测试只能建在系统临时目录并在测试后清理（MCP 契约测试同理，见 §7.3）。
6. **授权边界**：日常开发可在 core 内修改、测试并按精确文件范围提交；版本升级、生产 build/打包、推送、tag、GitHub Release 须单独明确授权，正式包只构建一次。
7. **版本号规则**：每一段只用 0-9（例如 `v2.6.9` 的下一版必须是 `v2.7.0`，禁止 `v2.6.10`）；改版本须同时核对 `package.json`、`package-lock.json`、README、`features.json`、项目 `SKILL.md`、发布说明、自动更新元数据与 Git tag。当前 package 版本 3.3.6（`CV/docs/project-context-current.md`）。
8. **不得重复实现已闭合项**（B1、F2-F7、schema32、全节点 RunEvent、B3 权限/安全清单、F9/F10 本地机制等）；这也是 MCP 要包装现有控制面、而不是另起一套的依据。
9. **外部证据**：F8（至少三个隔离客户端、两台真实 Windows 设备、Electron 安装版）、F9（真实域名/公共 DNS/证书/TLS/反向代理）、F10（真实公网红队与负载）不能用 localhost、mock、重复本地测试或手写汇总替代；没有环境时只维护失败关闭的采集/验证工具，不勾选轮次。
10. **失败关闭**：任一保护文件漂移、未知 staged/unmerged、目录角色不符或外部证据缺失，必须停止并不得扩大结论。

### 7.2 协议版本协商与互升安全

- **画布侧是严格全摘要匹配**：manifest / skill / CLI / patch 协议 / 节点 schema / provider catalog / 能力 manifest / graph / manifestDigest 必须全部一致，`minimumDesktopVersion 2.6.4`（`CV/tools/zcanvas-cli/src/agentClient.cjs`、`manifest.json`）。不一致就拒绝。
- 因此 MCP 的 `canvas_status` 必须原样回报 `compat:{ok,reasons[]}`，MCP **不得**绕过握手；MCP 与画布同仓发版、同版本号。
- **能力声明**：MCP `initialize` 的 server info 带 `{mcpProtocolVersion, canvasContract:"t8-versioned-creative-tool-v1", capabilityManifestVersion, minimumDesktopVersion}`；DSH 守卫插件在会话首个调用前读一次，不匹配则 `deny` 所有 `write/run/paid` 并提示升级方向。
- **互升矩阵**：DSH-zhen 升级 -> 只要 MCP 工具集合/参数向后兼容就无需改画布；画布升级 -> 以 MCP 同包随画布发布为准。工具参数只增不删，删除走「标记弃用 + 一个大版本保留」。
- DSH 的 MCP SDK 会协商协议版本（优先 2026-07-28，回退旧版，`mcp-client/README.md:28`）。DSH 自身 API 属稳定前，所以所有 DSH 扩展都做成外置插件、有集成测试。

### 7.3 测试策略

- **契约测试（首选）**：参照画布 `CV/tests/agentControl*.test.cjs` 的写法，用**画布 mock 后端**（不连真实库、不连真实 Seedance）对 MCP 做契约测试：每个工具一份请求/响应夹具，覆盖分页上限、错误码、`cost.known:false`、`acceptance:"unknown"`。
- **付费安全测试**：同一 `quoteId` 并发提交只产生 1 个 intent；`unknown` 状态下无重发路径；`quoteId` 过期被 `guard` 拒绝；预算超限拒绝出报价；`never` 策略下所有 `paid` 被拒。
- **安全测试**：MCP 进程里不出现 `/api/settings/raw` 调用；日志不含 token/签名 URL；环境变量清洗不影响 secureStore 取 token。
- **版本测试**：摘要不匹配时 `canvas_status.compat.ok=false` 且写/付费工具被守卫拒绝。
- **端到端冒烟**（需画布实例，人工跑）：配对 -> 报价 -> 双门批准 -> 提交 -> 轮询 -> 落库 -> 汇报，按画布 F8-F10 要求留外部证据，未做则写「后补」。
- **RAG 测试**：固定小语料的召回/排序基线；增量索引幂等；隐私分级过滤。

### 7.4 主要风险清单

| 风险 | 影响 | 缓解 |
|---|---|---|
| 画布没有价格表，报价只能给区间 | 预算保护不精确，画布侧成本上限 fail-closed | 画布新增价格登记表并识别 `usage.amount`；报价明示假设 |
| 双重审批疲劳 | 创作者烦、可能误点通过 | P2 ACP 合并门；P0 守卫文案写清「这是第一道/权威在画布」 |
| `/api/settings/raw` 泄露明文密钥 | 本机任意进程可读 | MCP 严禁访问；建议画布侧后续加固（不在本备忘范围） |
| DSH 工具 60 秒超时 | 长任务被误判失败、模型重试双花 | 提交即返回 + `run_wait<=45s` + `quoteId` 幂等账本 |
| Run 依赖画布窗口 | 窗口关闭则无人提交 | `canvas_status` 探测；文案提示 |
| Web-only 模式无法审批 | 无法走写/付费链路 | 明确 P0 仅支持 Electron 桌面版（Web 模式未核实） |
| DSH API 稳定前 | 升级破坏守卫插件 | 外置插件 + 集成测试 + 锁定 DSH 版本 |
| 环境变量清洗 | token 取不到 | 走 secureStore，不靠环境变量 |
| MCP 资源无大小限制 | 撑爆上下文 | 服务端限长、分页 |

---

## 8. 需要用户（T8star）拍板的决策

1. **双重审批能否接受**？还是要求画布新增「批准会话预算」（一次批准一个额度，期内免逐次审批）？
2. **MCP 放哪个仓库**？建议画布仓内 `tools/canvas-mcp/`，以便与 `zcanvas-cli` 同发布、同版本握手。
3. **是否同意画布侧新增**：价格登记表 + 识别 `usage.amount`、钱包只读代理、选区只读、语义搜索 L0 能力、提示词/资源库只读检索？这些是否排进画布路线图？
4. **安全边界**：对 `/api/settings/raw` 是否要求画布加固；DSH 的 shell/网络沙箱预设如何选（`danger-full-access` 下付费工具的行为需要先实测）。
5. **是否只支持 Electron 桌面版**？Web-only 模式的审批路径是否需要补齐。
6. **集成路线确认**：P0(iii) -> P1(i) -> P2(ii) 是否认可？

---

## 附录 A：待核实 / 待实测清单

- 根 `SKILL.md` 与 `local-private/context-archive/` 在克隆中缺失。
- figma 桥的具体后端实现位置。
- `/api/resources/*` 是否含提示词条目。
- `asset_catalog_revisions` 的使用方式（能否用作增量索引水位）。
- 审批完成接口 `POST /approvals/:id/complete` 的请求体与 token 交换细节（`agentControl.js:1869` 起）。
- 画布 `/capability-tools/invoke` 的请求体与可直通的 action 列表。
- 画布 Web-only 模式下审批如何完成。
- 画布 Electron 对 iframe 嵌入 DSH Web 的 CSP/frame 策略；DSH 登录 cookie 在 iframe 的行为。
- DSH `danger-full-access` 下 `ask` 的实际结果；自研 pre-execute 监听器与 Auto review 的顺序。
- DSH SKILL 描述超过 500 字符的截断对触发的影响；画布端 YAML 对未知 frontmatter 键是否容忍。
- Seedance Token 估算公式；`price-preview` 是否有可公开调用的接口（`SD:340,781` 仅在计费说明里出现，未见公开端点）。
- 本地中文嵌入模型选型与 `sqlite-vec` 的跨平台分发成本。
- SDK 的审批/取消/版本协商能力细节（只读了摘要）。

## 附录 B：画布建议新增接口汇总

| 序号 | 建议 | 目的 |
|---|---|---|
| B1 | 价格登记表 + 识别 `usage.amount` 与币种 | 报价、成本上限不再 fail-closed |
| B2 | 钱包余额只读代理（密钥留在后端） | `canvas://wallet`、报价 |
| B3 | `canvas_selection` 只读 | 选区联动 |
| B4 | 语义搜索暴露为 L0 能力 | MCP 复用画布素材语义索引 |
| B5 | 提示词/资源库只读检索 | RAG 数据源 |
| B6 | 批准结果长轮询 / 事件 | 减少轮询、降低延迟 |
| B7 | 可选：批准会话预算 | 缓解双重审批 |
