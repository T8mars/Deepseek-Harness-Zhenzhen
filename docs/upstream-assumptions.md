# Upstream contracts

Baseline: DSH `dsh-v0.2.1-rc.2`, commit
`687f282e8625c6b8d11ff58211a90524be2e4317`.

| Assumption | Verification | Boundary |
|---|---|---|
| Later bundle patches replace full row configurations | C1 uses the actual published CLI composition | Does not verify all future upstream releases |
| pi-ai accepts the explicit Seedance provider schema | C2 validates with the published Config; C12 checks the actual loopback wire and tools | Live gateway behavior remains unverified; max_tokens requires the explicit public compat setting |
| Public Remote factory + hand-written contribution can serve a plugin | C3 uses upstream manifest validation and a real Cordis service; Web status read works | The generator's npm decorator recognition remains a known issue |
| Credential writes/read/describe go through `ctx.credentials` | C3 checks presence, removal and refusal without a key | No credential file-format assumptions |
| Published credential reference events notify owned operations after native API replacement/removal | C36 uses actual LocalCredentials/Typert/Access/Gateway with synthetic responses in fresh TEMP: wallet cancellation and late-result refusal, resolution races, check/task/ticket invalidation, and unrelated-reference isolation | No file-layout reads, cross-process watcher timing, physical WebSocket or browser claim; missing provider events are handled only for this plugin's own save/remove methods |
| Published model modalities and durable attachment projections can carry inline chat images through the configured compatible protocol | C37 uses actual LocalAttachments/LlmRuntime/pi-ai: 15 image routes, two ordered native request projections per route, text-only placeholders, missing store and forged-reference refusal; C1 checks the composed native backend | Synthetic PNGs and loopback transport only. Real browser uploads, cloud vision behavior and actual image pricing are unverified; no upstream/session/storage-format changes |
| Slots used by the creator UI are public | C6 checks pinned declaration files; runtime render observed | Native window chrome and original startup resources are outside this plugin |
| Collector disable flags appear in the resulting composition | C1/C8 checks every designated row | This is not a packet capture or proof against arbitrary user-enabled plugins |
| Models onboarding has a public configuration switch | Source and composition checked | Desktop welcome remains separate |
| A custom skill provider is discoverable through the published registry | C9 exercises register/list/get/invalidate and the actual ZhenService registration; Web slash entry observed | Original ui-skill caches each session catalog until refresh/new session or designated upstream events |
| The published DSH MCP client interoperates with the bundled server | C10 connects a real stdio server, registers 7 ToolRuntime entries, then disposes them | No installed Canvas or paid generation was exercised |
| Agent provider, WorkingDirectory and llm/stream are public seams for retrieval permission checks | C11 executes through the real tool pipeline, preserves distinct authorized sources/citations and blocks calls before an isolated LlmAdapter | A 21-case invented keyword corpus passes; live Agent/gateway and real-corpus retrieval quality remain unverified |
| The configured custom Chat Completions route preserves model ids and tool results | C12 uses real published pi-ai, ToolRuntime and a loopback SSE server | Synthetic 402 becomes PI_AI_ERROR without structured HTTP status; no live billing classification |
| The MCP client uses stable server namespaces, supports public resource providers, and disposes tools | C13 composes the published MCP client, resource runtime and tools with a synthetic stdio program | Its inherited environment is isolated by our relay; loaded status does not prove ongoing server liveness |
| Final ToolGuards remain restrictive after pre-execute allow, and around-execute can drain calls | C13 denies other workspaces for native tools/resources despite a permissive policy and tests concurrent serialization/draining | Operations already dispatched can mutate files; this is not an OS sandbox |
| WorkingDirectory and llm/stream can revalidate historical MCP grants without changing sessions | C13 blocks an isolated adapter after directory changes or disable; persistent generation checks survive reopen | Real model conversations and the new market UI remain unverified |
| A complete public pi-ai models list advertises exact custom model routes without changing the default | C14 mounts the published LlmRuntime/pi-ai plugin, lists all 18 configured ids and checks one local SSE request per id | Native expanded-menu UI, real gateway behavior and advanced modalities remain unverified |
| A metadata-only custom tool can use the public ToolRuntime without model credentials | C14 exercises the actual Host registration, bounded search and invalid input rejection | Metadata records are not execution schemas or generation approval |
| A fresh shipped Web template can be inspected through the public CLI without reading an existing profile | C15 compares 190 row names, config-key shapes and canonical default-value digests | Forty-two guide blob identities are observations; a real newer release still needs hash-bound review and canary |
| Published package identity and the release tag can support exact owned dependency preparation | Policy tests cover all required publications, fixed registry URLs, integrity, semantic precedence and a separate pure publisher | npm SRI and matching repository metadata are not a source-build provenance attestation; remote workflow remains unexecuted |
| Versioned Canvas L0 plans can reuse the existing CLI and published DSH MCP/ToolRuntime without exposing writes | C16 covers 39/73 surface facts, eight inspection routes, exact scope/version/result identity, drift, expiration, redaction and single dispatch | The immutable original Canvas policy helper also accepted 73 L0 and refused 123 non-direct operations with an inert callback; no installed Canvas, real handlers or paid task was exercised |
| Published SkillRegistry can retain active text while an owned source policy stages a new release, then serve new text after Host restart | C17 exercises real registry, Host and strict Remote codecs with a synthetic pinned source; personal text and retained versions survive | No live published-feed update or browser control was exercised; scheduling is not a tool-permission grant or publisher signature |
| The public MCP plugin lifecycle can drain/dispose and remount a project connection without replacing its data binding | C18 executes actual DSH MCP/ToolRuntime with a synthetic SDK server and observes a new boot on restart; C13 permission/resource checks remain | Real pinned memory-server re-download/restore preserved synthetic memory, but filesystem repair, new UI and unrelated concurrent Hosts remain unverified |
| A public prepared LLM call binds a request to one adapter generation and can dispatch once without an Agent recovery chain | C19 uses actual DSH/Host/Remote/pi-ai loopback, fixed Flash/max_tokens 32, cancellation, one-error request and registry replacement | Live gateway, changed pi-ai profile settings, provider-side cancellation/billing and the new browser control remain unverified |
| A separate local SkillProvider can retain relative resources and invocation flags through the native skill loader | C20 uses actual Host/SkillRegistry/ToolRuntime and the exact locked tool-skill package; it reads a synthetic reference, refuses model loading of manual-only skills and observes edit/new-child invalidation | New UI, real personal skills, external tools, large-library performance and resource execution permissions remain unverified |
| The public native skill loader can use reviewed GitHub resource snapshots while personal local sources keep precedence | C21 uses actual Host/Remote/SkillRegistry/ToolRuntime/native skill tool across Host lifetimes; independently generated Git fixtures cover full-resource identities and manual invocation restrictions | A real public four-file package also downloaded and loaded in a temporary profile; no script/model/paid call. New UI, arbitrary concurrent Hosts, signatures and complete creative workflows remain unverified |
| The public Host/Remote and credential seam can query existing gateway tasks without using the Agent recovery/submission chain | C22 uses actual published Host/Remote and isolated HTTP across eight independently specified query paths, a real restarted Host timer and credential-generation cancellation; list/add do not resolve keys | Only synthetic task ids/data and example credentials. Live gateway settlement, new UI, downloads and Canvas asset association remain unverified; polling is not generation or cancellation |
| Owned Host/Remote operations can export existing task media without putting signed sources or keys on the client | C23 uses actual published Host/Remote, real isolated HTTP media streams and URL-free strict codecs; exact PNG bytes, credential-generation cancellation, SQLite reopen and file retention pass | The media socket carrier alone is mapped to a synthetic server. No real CDN/TLS, user media, paid call, new UI or Canvas asset import was exercised |

The published Typert generator's `isTypeMetaSymbol` only recognizes the protocol
as a workspace registration or ambient module. Npm declarations are not matched
in this external workspace. No upstream patch has been applied. The supported
hand-written contribution path is documented in the published
`dsh-typert-loader` API.

Development startup refuses missing default routing or enabled designated
collectors in its composed configuration. This guard is in the DSH-zhen launcher;
it does not claim to control an unrelated direct DSH launch or official Desktop
update behavior.

The owned launcher now reserves the port before any profile-mutating CLI call
and retains a PID/token lock through Host shutdown. A real running-host refusal
preserved the installed marker; synthetic lifecycle tests cover lock recovery
and handoff. This coordinates cooperating launchers only. See
[candidate preparation and review](upstream-updates.md).

C27 checks the published Host/Remote boundary for explicit Canvas workflow
review, strict codecs and unchanged Agent tool registration. Canvas auth,
client, secureStore and approval modules are fixed native source fixtures over
isolated HTTP. Plan construction and database mutation remain synthetic;
actual creative-plans/creative-approvals/Patch business handlers and window
approval are not established by that test. See decision 0025.

C28 observes the published tools/execute identity token and the frozen final
tools/result value. A final block does not create a Canvas inbox entry; accepted
MCP structured results preserve the native plan without another planning POST.
Agent mutations remain unavailable. The optional verify:canvas-native command
separately exercises actual Canvas working-source routes, creative planning,
approval and fresh TEMP SQLite Patch commits, including real MCP handoff and
graph.node-add. Its approval UI is simulated; no installed Desktop/window,
user database or Provider/paid behavior is established. See decision 0026.

C29 binds UI-only native run review/approval/recovery through published Host/Remote, actual ToolRuntime and MCP stdio. No Agent mutation tool is registered; strict DTOs exclude polling secrets. Scoped task/creator reads now forward required project/canvas IDs. Actual native TEMP run-intent verification is independent from synthetic fixtures; no Provider execution or real window is claimed. See decision 0027.

C30 reads the original native run ledger through strict published Host/Remote and current native session ownership. It adds no Agent tools or paid mutations; completed status alone is not artifact verification. Separate original Native fresh-TEMP routes/SQLite verify the accepted intent list/detail; synthetic positive evidence projection is not proof of a real Provider artifact. See decision0028.

C31 exercises confirmed local default-art metadata and <=45KiB raster chunks through the published Typert Registry, RemoteAccess, Gateway owner invocation and strict codecs, followed by the actual client byte-transfer function. JSON round trips are in-process; no physical HTTP/WebSocket or browser-rendering claim is made. The local real-pack verifier records byte hashes, limits and zero credential/network use. No upstream loader or brand kernel is edited. See decision0029.

C32 exercises the published Gateway owner contribution and strict Remote codecs with actual MCP stdio. Saved-media import/placement remain UI-only; native auth/store/approval are real fixture modules while copy/ledger are synthetic. Independent Native TEMP database verification exercises original AssetUploadManager, Blob and CanvasPatch with simulated window approval and seeded export metadata; it is not a real downloaded export or installed-app proof. See decision0030.

C35 verifies the pinned tools output.presentationMeta projection and final policy
block with the actual ToolRuntime. Strict owner Gateway/Remote calls read only
authorized index windows; client cards consume recorded metadata through the
published ui-tool keyed slot contract (C6). Actual React SSR checks replay,
escaping, old-record fallback and error suppression; it does not establish
browser rendering or live model use. See decision0034.

C47 additionally establishes that the pinned published tool author DSL accepts
`type: integer` but rejects `minimum`/`maximum` author-schema keywords. Page
bounds remain in the owned decoder and strict Zod Remote/presentation DTOs;
the tool author shape uses an integer and description only. Adding unsupported
keywords prevents registration, so the actual ToolRuntime search/open composition
is part of this contract. The installed standalone decoder is probed separately
from Host composition; public `plugin exec` alone does not supply Host peer
resolution, and this check does not import development-only peers. See0047.

C49 verifies an owner-only scoped model catalog through the published Host/Gateway/
Remote and native auth/client/store/approval fixtures, with no new Agent mutation
tools. The native3.3.7 public readiness `requiresRuntimeCheck=true` may coexist
with `executable=true`; selection also requires explicit known/installed/credential/
region/available/executable readiness and no blockers. Exact native provider/model
and explicit output facts are checked after planning, with CLI/session checks after
each awaited call. Original native production routes and fresh TEMP Patch nodes
are separately verified by `verify:canvas-native --include-model-choices`; this is
not real window, installed-user or Provider proof. See0049.

C50 adds owner-only asset metadata via the published Host/Gateway/Remote and Native auth/client/store/approval fixture. Fixed receipt-v1 attachment vectors originate independently from Native source3.3.7. DSH refuses order/hash/revision drift and non-ready required decisions. Original Native fresh-TEMP image/edit-image/edit-video Patch binding is verified separately with a simulated window and no Provider traffic. Native image hash binding, duplicate slots and atomic asset revalidation remain open; see0050 and the reference-assets handoff.

C51 verifies DOCX extracted-line results through the published Host/Gateway/ToolRuntime and unchanged source/session grant boundary, with the real local fixed worker and an independent python-docx fixture. No Word pages or new DSH protocol/session format is assumed. CRC, bounded native inflation, OPC main selection and strict XML checks are separately covered; see0051.


C56/C57（0056）使用已发布ui-tool的tool.call.toolview结果block及稳定callId，实际ToolRuntime/MCP输出能解析同一原生方案，并经Owner Gateway采纳。自有main槽位key、sidebar id及公开layout.selectPanel使用相同MainPanelId身份；仅插件局部导航，不触及客户端引导。C6检查槽位存在，C57检验挂载前导航与实例隔离。实际RAG prepared.stream仍经过llm/stream权限waterfall：C11在prepare后撤权，再dispatch时在adapter之前拒绝；真实网关检查同样在transport之前阻断。这里不假定prepare冻结授权，也不声称SSR等同浏览器点击。


C58（0057）：已发布Cordis ctx.provide绑定服务到插件作用域，受信任扩展通过ctx.zhenRag注册并在dispose时注销。已发布HarnessError的固定code通过实际ToolRuntime保留为error.info.code；客户端只读取文档化ToolResultNode.error.code并映射固定说明，SSR不读取reason。实际Owner Gateway拒绝匿名及旧修订，LLM waterfall在适配器前阻断暂停后的旧资料会话。自有后端只提供候选编号，索引事务核对后才产生引用/授权；不修改任何上游协议或会话格式。


C59（0058）：实际已发布AgentRegistry/AgentLoop、SessionStore、SessionProjection及默认模型服务驱动作用域工具到下一轮并正常结束，使用公开create/setup/followup/whenIdle/deriveMessages/dispose。schemas省略ScopeKey读取全局，显式Agent才看到其作用域工具；ToolResultMessage的关联字段为toolCallId。真实Flash文件会话正常completed独立验证；真实Native计划测试在首份结果后刻意取消，不称正常完整创作或Desktop。所有测试会话仅全新TEMP、内存SessionStore，不修改任何上游持久化格式或真实会话。新增四个精确SDK开发依赖，753项既有锁定版本/完整性/来源保持。


C60（0059）：公开createUserMessage的image attachment引用经实际AgentLoop、默认模型服务、LocalAttachments和pi-ai到回环HTTP，保持原生投影字节、完整模型ID和输出上限，正常completed。C37仍验证全部十五条图片路由/顺序及文本占位。独立一次真实默认Flash请求另证明简单随机色块识别；回环夹具不提供视觉质量证据。不修改上游消息/会话/附件格式或生产配置。


C61/C62/C63（0060）：真实Git检出的已知打包文本使用精确LF规则，未来二进制/目录外策略不变，C46快照保护保持。现有CRLF工作目录不能假定由新属性自动改写；实际npm预览→独立规范副本→原npm打包保留全部清单/声明/私有守卫。真实完整构建包的原始CRLF归档先不同，调用实际pack.mjs后须回到完整规范SHA且源字节保持。此为自有构建策略，未改上游或Native协议；当前锁定工具链外的重现性另验。


C64/C65/C66（0061）：Native workspaces 的 total/truncated 为可选原生元数据，DSH不补造旧响应的完整性，拒绝重复项目/画布身份及不足行数的total；实际已发布Host/Gateway/Remote验证Owner访问和严格投影。四个生产组件真实处理器验证组合身份、重排保留、目标消失清空及迟到响应失效，不将fake hooks/SSR当浏览器。3.3.9路由只读复核仍无当前窗口标志，不据此断言其他API不存在；精确握手及当前3.3.7 pin保持。


C67（0062）：已发布AgentLoop对原生finish max-tokens直接结束turn，不自行追加请求；用户取消按aborted/user记录，正文前不制造assistant回答，正文后保留已收到片段。三个actual loopback/SDK回归检查公开followup/whenIdle/cancel及dispose和连接关闭，不修改会话格式。真实默认Flash两请求触顶和一次首SSE delta取消另验证；SSE观察器原样转交字节，终帧前取消，不宣称后端停算或退款。


C68（0063）：实际已发布AgentLoop/defaultModel/pi-ai保留原生生成的回放信息；三种普通推理字段、结构化reasoning_details（含分片合并及不透明EXAMPLE数据）、无推理工具响应均能到下一原生请求，工具ID/结果匹配且普通completed。当前默认请求include_usage=true由合同钉住，真实默认三个最终请求HTTP200并有原生用量事件。原生回放为opaque adapter state，不自行构造/改写上游持久化格式，也不强制reasoning_content或要求每次工具响应有推理。真实签名/正文仅内存比较；不开新开关、不推论所有模型或计费。


C69（0064）：自有知识库生产组件通过React公开hooks保存API实例/资料空间代次和同步single-flight，独立读序号处理集合/绑定/来源，异步Remote返回不被当作当前界面的事实。测试执行真实组件事件处理器，覆盖迟到响应/错误、依赖调用停止、草稿/绑定保持、剪贴板调用前拦截及面板关闭；没有改动上游RPC、会话格式、Host授权或检索算法。fake hooks/剪贴板桩仅单元验证，不声称真实浏览器或系统权限处理。

- C70：自有五个市场/更新组件依赖公开React effect清理与ZhenRemote实例归属；用同步ref阻止下一次渲染前重复提交，以API/操作代次拒绝旧结果和依赖调用。编译实际组件并执行处理器，Remote例子使用分离DTO；不宣称物理网络重连必换实例、浏览器实显、Host取消或上游私有协议。

  C70连接绑定使用公开useLayoutEffect提交/清理，不在渲染中改归属ref；假hooks只执行处理器与effect，不证明React真实并发调度。

- C71：独立W6只使用已发布Llm.prepareCall/PiAi与LocalCredentials的正式接口，临时环境快照不暴露进程密钥。实际SDK经合成fetch检查固定请求、错误/用量/触顶，另有新CLI一次真实默认Flash。不能推导所有模型、Agent工具、实际CI secret或七天稳定性；默认不借应用GatewayChecks做后台收费。

- C72：已发布dsh-plugin-market-index格式1仅npm或Git固定提交，不接受tgz；使用实际parseMarketIndex/marketInstallTarget验证。确定性Git对象由真实Git核对，真实GitHub commit/path经公共CLI安装全部152文件/卸载恢复。仅当前Host/pin/Windows和此包，不证明未来版本、Unix或正式市场发布。

- C73：发布器沿用C72确认的官方Git市场来源；通过实际SDK校验稳定空索引及多版本canary索引。服务端run_attempt/job字段实际只读核对，事务API桩覆盖发布和恢复，但不冒充真实写入/Pages证明。写任务只用内置模块/受控Git，不调用SDK或候选程序；新安装依赖只在读取权限任务执行。

- C74：原始CLI公开requestAgentControl options.fetch在固定快照中由真实HTTP请求验证；DSH仅注入本机GET/POST JSON一次性HTTP传输（agent:false，发现选项同样转发），原始握手/凭据/响应检查仍由CLI负责。保留原始快照hash；真实DPAPI/MCP合同继续运行。阻塞后原实现连接失败与修复后成功、已受理POST丢响应无重发分别有回归，不证明实际用户Native窗口已验收。

- C75：自有buildSkillCatalog的公共feed在autocrlf Git新检出后必须第一次status就干净。真实Git clone/生产生成器验证精确LF属性，不能先git diff刷新后才宣称来源干净。没有改变上游或市场格式/内容。

- C76：官方CLI安装自身两个版本后，公开package.json必须报告实际安装版本。生产构建保持其他151文件/执行位全同，更新baseline合成自身版本。裸plugin exec无Host peer resolver，测试使用Node公开模块hook指向精确已声明SDK peer，不修改app-boot或生产解析链；凭据仅存在状态桩。

- C77/C78：Actions ZIP/ZIP64仅作有界平面普通文件读取，服务器SHA/大小和实际包相互核对；原始artifact不能自证成功，必须配套同仓main服务器run/job/step/首次attempt、固定完整payload/SDK及源码脚本摘要。七个完整UTC日按服务器付费步骤计，失败/缺天/重复/漂移拒绝。真实GitHub ZIP读取已验，候选工作流/七日/稳定发布尚未验。

- C79/C80：候选W6重查公开不可变资产、确定性Git与原服务器安装证据；observer全payload及实际适配器须同pin，真实SDK读取候选归档配置，首次attempt之外在付费前拒绝。采集按服务器created_at截止、完整分页并复读，不只取success；原ZIP与单项元数据核验后按服务器paid-step计日。合成SDK/TEMP/HTTP与分页事务已验，真实候选CI/七日/稳定发布未验。

- C81–C84：W5以跟踪的精确SDK/npm来源/完整性/peers/patch与指南/发行模板事实重算审阅，初始观测不等于适用性批准；W3可能只检查较早基础提交，须证明祖先及相同SDK契约。构建使用实际公开模板CLI，写任务导入图只允许内置模块；完整原始W4/W6依据重复核验。最终版与候选仅manifest版本差异；稳定五资产读回/原证明恢复/不重试未知写/保留通道及main/降级门禁通过合成事务，非现实七日/发布。启动器的精确最终/Canary归档入口由实际C76双构建及C84边界覆盖。

- C85：实际已发布 ToolRuntime + NodePtcRuntime 子进程调用两项 RAG 工具，规范结果与原生一致，嵌套日志保留 JSON 展示元数据；暂停及撤权不返回片段。测试提供明确的受控策略，不证明 OS 沙箱或真实 Session 持久化。实际 PiAi 目录在缺密钥时为空，EXAMPLE 本地凭据配置后出现全部18模型，移除后为空，全程零网络。实际 LocalCredentials 本地值优先于启动环境，移除后回退；Owner Remote 仅返回规范来源枚举，不转发源路径。生产客户端处理器验证来源标签、移除后的重新读取/说明及旧钱包清空；这不是浏览器或新安装现场验收。见[首次适用性审阅](upstream-bootstrap-review.md)。


0077：自有Owner Remote新增严格活动元数据DTO，C86用实际已发布Typert/Access/Gateway核对编解码与Owner拒绝；真实MCP列出11个读/规划工具，不增加修改/批准工具。复用原生CLI/auth，不触及上游协议或生成类型。四面板处理器/SSR不是浏览器或Electron窗口验收。


0078/C87：固定已发布Gateway对descriptor参数名集合精确匹配，即使某个codec允许undefined，也不接受调用方遗漏新增参数。实际先期三个旧调用失败后，保留原八条参数表，使用十个新Owner入口。C87实际Gateway再次核对旧参数、旧目录/节点回执及新Owner拒绝；没有修改上游协议或生成类型。DSH的CLI适配接口只声明loadSession的origin/sessionId/accessToken/expiresAt，操作者与权限继续来自原session接口，不能捏造储存字段。新请求包装器只复用原CLI请求并核对引用，不读取布局、修改CLI或提升信任。

0079/C89：SessionPersistence 的公开分页/flush/不透明 revision 与实例 identity 支持会话快照屏障，已用真实固定 JSONL 服务验证源变化拒绝。SessionStore.create 不自动代建持久化 owner；无 owner 的活动会话必须拒绝，不读废弃同步事件补洞。分支使用公开 buildForkSeed 的 end-seed 标记，cut 单独经 create options 保存。冷读 header 的默认 delegationDepth=0 与原构造参数存在规范差异，比较实际公开读值。sessionLogZipEntries 负责已知内容的规范附件投影，includeDescendants=false 不调用 lineage 查询；未知可忽略记录保留而不猜附件。本地附件使用 sha256: 前缀，公开 commitPreparedImageFile 加 readImage 验证保留规范化字节/尺寸/原尺寸，通用文件经流式保存返回完全相同引用。查询服务 openAt=never 不创建查询数据库。各项以实际已发布 SDK 的 C89 往返及拒绝案例为范围，不推广到未实现的完整 profile 或其他附件后端。

0079活动竞态补充：固定SDK可在最终list生成revision后、调用方接收前排入live event，此时磁盘revision不变。真实SessionStore/JSONL先红后绿验证，末尾再次flush并比较公开Session.seq才能覆盖该缓冲窗口；未调用废弃同步事件读取。


0081/C91：固定app-boot公开loadOptionalPatches与readProfileManifest/readProfilePlugins/readProfileCompatibility可逻辑读取全部已初始化配置档而不执行表达式、模块或dropRetiredBundles；实际retired bundle及源文件字节保持的TEMP合同已过。依赖清单不是依赖实体/pnpm锁文件，coverage明确false；不把只读API存在泛化成完整恢复writer。C92使用真实FileSystemSkillProvider和SkillRegistry验证相同来源序列的投影，registry胜出定义不是完整资源闭包；声明根的平铺共享文件和shadowed定义分别保留。来源自动发现/实际来源优先级接线仍待开发，恢复候选不激活。


0082/C93：FileSystemSkillProvider公开Config的本机默认/项目/custom/user/bundled根通过实际provider观测核对，含无Git标记回退、最近Git标记文件和禁用default roots。agent-instructions的findProjectRoot只见内部声明而非已发布根出口，未深导入；本项目用自有标记元数据定位，异常拒绝，不读取Git内容或猜虚拟文件系统。有效配置只保留根设置，不序列化环境或执行访问器。四个自有服务快照与真实SDK provider的TEMP组合不是实际用户Host/Remote/UI验收；原SDK源码不变。


0083/C94：固定Loader.entries遍历条目和嵌套树；Entry.fiber.config公开定义为validated config，读取不再次执行原配置表达式。Entry.disabled getter可能执行表达式，备份不调用。实际Group的disabled不阻止自身挂载，而由子条目继承；不依据普通条目的禁用行为猜Group。Builtin字典和moduleNamespace公开导出身份用于识别别名，不调用loader.import/refresh。Cordis FiberState是ambient const enum无运行时出口，用公开声明数值与实际生命周期合同核对。LocalFileSystem公有类识别host-local，未知backend拒绝，不从方法形状猜本机。工作区/live seam专项为接口夹具，不能扩展为持久化registry/实际用户Host验收。PatchOptions.name仍是匹配守卫，不是模块替换入口。


0084/C95：validated Fiber.config不保证保存provider构造时解析的缺省值。真实已发布filesystem启动后改环境可复现备份默认目录漂移。公开Cordis Events声明internal/config this:Fiber waterfall与internal/status(Fiber,oldValue)；观察next()后配置、在ACTIVE提交快照可保留当时默认和cwd，不修改config或读私有成员。预验证事件不能替代实际激活快照，C95真实事件/重启/依赖门/加密往返核对。自有bundle只补公开inject依赖，skills保留，根配置不改；未观察到且依赖缺省的旧活动来源拒绝，不猜。已解析模式先普通JSON安全检查再schema，不执行访问器。


0085/C96：公开initProfile/writeProfileManifest可以生成fresh配置候选而无需私有patch writer；loadOverlayPatches接受自有JSON PatchOptions数据文件，实际readProfilePatches顺序为bundle→profile→machine→overlays→telemetry。旧archive只读验证后才创建候选，不用EntryOptions冒充PatchOptions。实际CLI dump/boot核对恢复数据，但测试提供EXAMPLE依赖，不当成依赖实体恢复。SDK CLI明确禁止大小写无关desktop profile，候选保留数据而不借hash名绕过专用入口；真实负例已核。公开setProfileVersionExemption要求informed acceptRisk，历史grant仅待迁移数据，本次不代授。原retired bundle保留，未调用会清理来源的loadProfileDirectory。


0086/C97：公开Cordis Context装配的自有ZhenService提供Host-only ragBackupLease，未新增Remote或上游协议。Node22.19公开node:sqlite backup/DatabaseSync实际TEMP验证可从自有现存或readonly handle创建一致副本；同handle total_changes与跨handle data_version需同时守住。readonly来源不调用KnowledgeStore构造迁移，公开入口独立bundle的Error类可能不同，只映射固定自有代码而不透传未知消息。恢复只执行自有已知schema与参数化数据插入，未执行归档SQLite/schema/trigger/provider。外部SDK源码不改，配置/会话/凭据/画布私有布局不读写。


0087/C98：公开LlmRuntime的普通stream与prepareCall捕获适配器后的stream仍执行当前llm/stream hook；prepared对象只能提交一次（包括已被拒绝的提交），正向对照不重用。自有服务生命周期内的授权句柄与Host启动路径是同一来源，不得在最终检查时独立重读环境默认目录来决定跳过它。cold/warm、RAG/MCP与正负对照均由实际公开SDK验证；Windows打开库改名实际拒绝，仅按OS事实记录，不伪造路径移走。


0088/C99仅使用自有SkillMarket schema3及公开node:sqlite，不读上游私有数据。自有普通构造会推进pending，故候选先建空库再事务导入；既有对象/已知行只读校验，不再次启动。实际负例复制候选后普通构造确实晋升pending，原候选和源不改。共享验证保留完整package SHA与active/pending/skipped身份、mode/revision语义。原库存v1仍可恢复；新增输出明确仅市场DB和目录元数据已还原，其他来源和激活未做，不能泛称全应用恢复。


0090/C101：公开PluginPackages.resolution/packageOf提供包路由和元信息，读取不载入入口；包资源与公开运行解析表分别保存，实际Node/Cordis Context核对普通祖先链、profile fallback、linked root、嵌套多版本和循环。Context.get按调用上下文创建新traceable包装，不能当提供者身份；Cordis4.0.5根出口symbols.original仅用于稳定标识，调用仍经作用域包装，不读取私有状态。C101验证同一服务多次get稳定、公开ctx.set替换拒绝和实际Host原home保护。目录存在但无package.json可按明确声明保留，公开元信息缺失标为unresolved，不能推断为已安装或自动下载。保留的公开表是候选数据，构造验证只在EXAMPLE TEMP；没有启用用户profile、替换SDK、执行包脚本或读取PM私有布局。


## 0091 · 实体组合后的公开CLI与Node链接

C102核对公开initProfile/writeProfileManifest、createRuntimeResolution和官方CLI。标准node_modules链接及候选link依赖保留alias和同名多版本；恢复时没有PM、包入口/生命周期/包本地hook。实际CLI由EXAMPLE TEMP夹具显式启动，源包隔离后核对恢复模块、nested依赖、覆盖顺序及当前Cordis实例；候选自身不自动运行。安装层包只在公开解析表名字/版本与当前SDK一致时重绑现有安装层，归档副本保留出处，不混入已加载Host。原PM文件和真实用户Host不在此证明范围。


## 0092 · Host启动时的数据根归属

公开dsh-home-paths.dshHomePath每次调用按当前env/cwd解析绝对目录。自有服务在初始化时保存一个root，后续自有路径从它派生；不改SDK的全局解析器或环境。C103实际Host用带不同记录的另一个home验证冷/热读取、空/已有数据库、技能配置、损坏的自有画布进度仍拒绝、断开只写原DSH locator；相对home在cwd切换后保持启动归属。此证据不等于用户实例升级、Native配对/审批或完整应用恢复。


## 0093 · 自有SQLite完整库存及公开服务身份

C104仅读自有固定schema与Node公开SQLite/fs接口。Host owner比较沿用Cordis公开symbols.original；替换测试采用实际plugin dispose/reload，不跨fiber直接覆盖provider。公开resolveAgentsHome在Host启动时记录为受保护来源，不随后来的环境变化。自有三个存储的实际打开文件身份由本项目自己的方法提供，不检查SDK私有字段；只读保留连接跨transaction检查data_version，以捕获WAL写后恢复。新候选保留旧审批owner而不授权执行，原件路径重映射后由实际交接校验读取。没有读取用户/Native库、凭据或上游持久化布局。


## 0094 · 无画布工具时的公开提示与导航槽位

公开system-prompt section支持固定text；恢复引导不能以自有配置存在作为前提，也不应在提示组装时解析可能损坏的连接JSON。C105使用真实Prompt/AgentLoop并验证普通作用域工具仍执行。C106使用公开ToolRuntime注册纯固定导航工具及卸载移除，客户端通过既有tool.call.toolview注册并调用真实按钮闭包选择已注册main面板和connections子页。UI注册/事件测试不是物理浏览器显示或Native权限批准；工具输出和旧记录都不能证明连接。没有改SDK、MCP协议或新增远程修改入口。


## 0095 · 公开目录选择能力及陈旧提供者

公开DirectoryPicker.capability返回稳定的native/browse判别对象，缺失/未知能力不发起选择。Native pick(signal)可不服从取消；公开BrowsePicker.list提供Host绝对path/home/crumbs/entries及布尔truncated，不能把未知完整性默认false。C107真实公开服务/Owner和TEMP BrowsePicker核对，派发前及返回前再次比较提供者身份；超时仍保留未结束槽位，防止重复窗口/资源失控。客户端不借workspace专用流程创建目录或工作区，不拼接远端路径，选择不等于父动作授权。C108为真实生产处理器/SSR证明而非浏览器或系统窗口。C109真实AgentLoop验证MCP返回错误后的同一导航工具；三次真实Flash使用EXAMPLE状态，不涉及真实Native实例。无上游协议/源码改动。

0095焦点负例要求按钮提交为启用后再focus；React effect仅在相同API/作用域且未禁用时回焦。C108使用显式提交状态替身验证顺序，仍不是DOM/系统窗口验收。package.json采用统一JSON格式，使两版本测试的stable归档与正式pack逐字节相同；没有只比较内部载荷而忽略manifest。


## 0096 · 组合末尾来源与公开工作区域

C110核对SessionPersistence.identity通过Context包装保持稳定，公开list/stat revision及SessionStore.flush/seq在流后仍可用于总容器检查；原生sessionLogExportDeps/sessionLogZipEntries提供逻辑日志与附件，不读私有布局。查询/附件/会话提供者取公开symbols.original作身份；实际Host卸载拒绝旧lease。附件必须核内容寻址摘要，未知元数据或数据流异常不透传。技能保留完整库存、源提供者及既有skillResourceRevision，跨组件再验证资源和策略；不构造缺失管理器。

C111使用公开DomainFacility.get、Domain.global.get/table.entries和domain/changed；get只取已开域，undefined不表示磁盘无数据。实际Host事件计数、完整已开库存、SDK schema及Storage/JSON/Domain独立候选经真实TEMP核对。顺序、default、归档、置顶、initialized与两种pending均保留，不用filtered registry.list。pending嵌套schema由已发布两个分支派生为strict，合同核两分支数量及create/delete，不静默丢字段。恢复只写新的公共SDK域，不启动WorkspaceRegistry或执行pending。来源目录/冷域/当前用户数据及全应用恢复不在该候选证明范围；没有读取SDK私有字段、修改SDK/上游/画布或调用模型。

## C112–C114：所选范围备份中心

只经公开 profileContext/PluginPackages、持久化 header.cwd、既有导出和 StorageDomain 接口装配；不猜 profile/会话私有布局或初始化缺失服务。C113 通过真实发布 Gateway/Owner 验证公开 profile 上下文及有限 EXAMPLE 解析表、会话和自有数据；完整用户安装、恢复激活和窗口验收未由该测试证明。C112 保留全部来源至总末尾、严格认证分块及整个新候选清理；C114 为实际组件处理器/SSR，并非浏览器验收。

## C115–C117：恢复候选摘要与复核

摘要读取各自恢复模块真实返回值，公开SDK来源仍由C113/C116与原组件契约验证。基线只在新候选创建完成时建立；Owner按原任务ID读取/复核，不接受路径或候选自写回执为信任依据。Node读取普通文件、链接文本与元数据，内容读取前后校验文件身份，再比全树元数据。C115测文件变化/链接/缺失/预算/取消，C116测真实Owner与暖RAG/原件、单次复核与取消，C117为生产组件处理器。链接目标、实际环境激活、窗口与完整L2并未由这些契约证明。


## C118–C120：自有候选索引与Owner重启管理

候选索引是本项目自己的SQLite schema1，不读取SDK私有profile或数据库。按原任务ID保存创建基线；生成角色和有界组合回执只是扫描前置条件，不能取代基线。C118用实际独立Node进程重启和SQLite事务；C119用固定公开Cordis插件生命周期卸载/重挂、实际Gateway/Owner及严格RemoteError details.reason确认明确BACKUP_BUSY，既有丢回执原ID查询不变；十一项Owner接口拒绝匿名，Tools实际非空但未新增备份工具。C120为生产组件处理器/SSR及迟到响应保护，不证明浏览器或完整应用激活。真实591安装项/639恢复包的温缓存验证使用0098既有编译模块，不将其泛化成本次索引或候选CLI已验。
