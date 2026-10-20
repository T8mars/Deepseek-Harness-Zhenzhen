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
