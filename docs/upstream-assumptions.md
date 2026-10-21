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
