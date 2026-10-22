# DSH-zhen · 交接文档（给接手实现的 AGENT）

> 2026-10-22检查点0100：实际六类恢复目录清单和Owner准备检查；完整原基线复核、128配置不截断、旧索引可读、取消/旧响应保护，不执行回绑或激活。完整1125/1125、新25/相关133及201文件归档通过；C63归档及C76稳定版本重建与本机包同摘要，双版本其余载荷逐字一致。本提交CI另验。0099精确CI1100/199包与实际换装已核，当前用户Host保持dev70。完整L2与原目标继续。见 docs/decisions/0100-restored-layout-and-preparation.md。

> 2026-10-22检查点0099：自有SQLite恢复候选记录、重启/淘汰后复核、20项分页、仅移除记录和失败后单独保存重试；Owner限定，不激活。完整1100/1100、新31/相邻78及199文件归档通过；C63归档及C76稳定版本重建与本机包同摘要，双版本其余载荷逐字一致。本提交CI另验。实际已发布SDK分阶段恢复639包/30,952文件且复核一致，仅环境候选，不是完整应用启动。0098精确CI1069/1069及197文件包已核。完整L2与原目标仍未完成，用户Host和画布不改。见 docs/decisions/0099-persistent-recovery-candidates.md。

> 2026-10-22检查点0098：恢复候选新增实际六范围摘要、创建时文件基线、Owner按原任务复核及可读的待处理事项；只读候选普通文件，不遍历链接目标，不激活。完整1069/1069、新24/相邻92及197文件归档通过；C63归档及C76稳定版本重建与本机包同摘要，双版本其余载荷逐字一致。本提交CI另验。dev67/dev68精确CI日志及包摘要均已补验。完整L2与原目标、候选持久管理仍未完成；用户Host未换装、未改画布。见 docs/decisions/0098-recovery-candidate-preview.md。

> 2026-10-22检查点0097：创作空间新增备份恢复导航，六范围加密总归档、保留来源检查、Owner本机任务和独立恢复候选。密码不保存；不激活、不执行旧授权或任务。完整1045/1045、新25/相邻114及193文件归档通过；C63归档及C76稳定版本重建与本机包同摘要，双版本其余载荷逐字一致。精确CI另验，完整L2与原目标仍未完成。实际用户Host未换装，未改画布。见 docs/decisions/0097-selected-backup-center.md。

> 2026-10-22检查点0096：会话/附件和技能新增保留到组合末尾的来源检查；实际Host接线、附件摘要及固定错误码。公开已有工作区域全库存加密备份/SDK独立候选，保留顺序/归档/置顶/两种pending，不自动执行或激活；冷域明确unavailable。新增49/相邻106及完整1020/1020、189文件归档通过，精确CI另验。仅TEMP，无模型/Native/用户换装；完整恢复UI与原目标继续。见 docs/decisions/0096-retained-backup-and-workspaces.md。

> 2026-10-22检查点0095：RAG导入/绑定、本地技能和作品导出复用公开Host目录选择；取消与旧响应保护、单窗口/有界浏览、完整性标志拒绝均通过。画布MCP连接/版本/配对错误也显示同一帮助按钮一次。新增36/相邻64及完整971/971、188文件归档通过，精确CI另验；真实Flash三次验证示例状态后的帮助闭环，不代表真实Native创作。当前用户Host保留0093，不改画布。见`docs/decisions/0095-directory-choice-and-canvas-errors.md`。

> 2026-10-22检查点0094：未配置/断开/损坏连接时仍提供聊天引导；新增纯导航帮助工具和“打开画布连接”按钮，直接定位已有页面，不读连接/凭据或代配对批准。新增11/相邻18及完整935/935、185文件归档通过，精确CI另验；真实Flash三次，其中最终两次完成帮助卡片，零shell/Native请求或写入。当前用户Host保留0093，完整恢复UI与原scope继续。见`docs/decisions/0094-canvas-chat-connection-help.md`。

> 2026-10-22检查点0093：完整自有checks/tasks/media库存与已选作品文件加密备份/新候选恢复；保留原rowid/身份，缺失/变化/排除显式记录，实际warm存储身份拒绝目录链接替换。新增53/相邻91及完整924/924、182文件归档通过，精确CI另验。未激活或换装用户Host，未改原生画布；其他组件与统一恢复UI/原scope继续。见`docs/decisions/0093-owned-state-backup.md`。

> 2026-10-22检查点0092：修复运行中环境/cwd变化使冷服务首次打开时跳到新数据目录；19处自有状态统一固定启动root，SQLite记录/技能来源/Canvas自有进度与断开写入保持原归属。新增14/相邻78及完整871/871、179文件归档通过，精确CI另验。未换装用户Host、未改原生画布；完整备份/恢复/UI及原scope继续。见`docs/decisions/0092-host-data-root-binding.md`。

> 2026-10-22检查点0091：单份认证的profile/包实体组合快照，保留两来源末尾租约；公开SDK写入加标准Node链接生成新候选，不运行包管理器/脚本。原包隔离后的实际CLI、别名/多版本/四类依赖/框架身份与严格分块、取消均有契约。新增24/相邻77及完整857/857、179文件归档通过，精确CI另验。原PM文件、其他状态、统一恢复/激活UI和fullM2/原scope仍未完成。见`docs/decisions/0091-profile-package-assembly.md`。

> 2026-10-22检查点0090：软件包实体/依赖路由加密备份与独立候选恢复，接入实际Host公开resolver；保留完整包资源、同名多版本、循环/共享目录、公开解析表和已知链接，不执行资源。新增22/相邻139及完整833/833、178文件归档通过，精确CI另验。原PM文件、全组件装配/预览激活UI/fullM2及原scope继续未完成。见`docs/decisions/0090-package-backup-candidate.md`。

> 2026-10-22检查点0089：技能恢复接入Local/GitHub/feed实际候选状态；共享/父子根保持物理关系，缺失目录不继承信任，GitHub待更新不提前启用，目录运行/磁盘状态分开。新库存v2、继续读取v1。新增26/相邻117及完整811/811、175文件归档通过，精确CI另验；候选不激活，完整依赖、总预览/激活UI/fullM2与原范围继续未完成。见`docs/decisions/0089-managed-skill-restore.md`。

> 2026-10-22检查点0088：0088技能库存恢复新增真实市场候选库：保留全部版本、pending/个人副本/停用/暂停/跳过/更新策略，完整199项目录元数据；空白目标事务导入并直接校验，避免普通构造提前应用更新。新增13/相邻71/71，含UI50外61版本、事务取消/最终回执取消及来源未改。完整785/785与173文件归档通过，精确CI另验。Local/GitHub/feed状态写回、依赖及统一恢复/激活UI/fullM2与全部原scope仍未完成。见`docs/decisions/0088-market-state-restore.md`。

> 2026-10-22检查点0087：0087修复Host环境数据目录变化导致RAG/MCP旧授权检查被跳过：固定同源目录，优先现有句柄，普通和预先准备的调用都保持撤权。新12/相邻46/46，原8个失败场景已修；有效授权/新会话继续正常。Windows拒绝打开库改名，未冒充路径已消失实测。完整772/772与172文件归档通过，精确CI另验。全部恢复和预览激活UI/fullM2及原目标仍未完成。见`docs/decisions/0087-home-bound-grant-gates.md`。

> 2026-10-22检查点0086：0086新增RAG加密备份与独立恢复候选：六逻辑表/派生FTS重建，引用ID/页码/权限与绑定高水位保留；原件标明一致/变化/缺失，运行与磁盘后端设置分存，不激活。Host未打开的自有schema3库只读捕获，不建库或迁移；保留跨组件尾部来源检查。新增23/相邻44/44通过；完整760/760与172文件归档通过，精确CI另验。目录重绑定、依赖/其他状态恢复、总预览激活UI及fullM2仍未完成。见`docs/decisions/0086-rag-backup-restore.md`。

> 2026-10-22检查点0085：0085新增完整认证后的配置恢复候选：公开SDK生成全部profile manifest，自有JSON overlay保留profile→machine→active覆盖和表达式；独立DSH/Agents home、安全来源名映射，Desktop保留为专用入口，兼容grant待迁移。新增17/相邻31/31及实际CLI夹具导出启动通过；完整737/737与170文件归档通过，精确CI另验。依赖实体/包管理器/DB/RAG和总预览激活UI/fullM2仍未完成。见`docs/decisions/0085-profile-restore-candidates.md`。

> 2026-10-22检查点0084：0084修复启动后环境/cwd变化导致技能备份目录漂移：公开配置/状态事件记录激活根，自有bundle服务依赖保证先观察再启动；已解析来源不再回退当前环境。新增14及相邻35/35、完整720/720与169文件归档通过，精确CI另验。实际用户Host未换装，全M2/L2和原范围继续未完成。见`docs/decisions/0084-activation-bound-skill-roots.md`。

> 2026-10-22检查点0083：0083新增Host-only技能来源适配：公开Loader/validated config读取，不重放表达式；禁用来源及别名保留，工作区/活动/额外历史目录合并，未知后端与缺服务拒绝，不启动待更新服务。C94新增16及相邻78/78、完整706/706与168文件归档通过，精确CI另验。总历史目录装配、配置/DB/RAG恢复、总预览/激活和界面仍缺，完整M2/L2及goal保持未完成。见`docs/decisions/0083-host-skill-backup-sources.md`。

> 2026-10-22检查点0082：整合已声明filesystem/本地/GitHub/市场/feed完整技能清单和状态，恢复候选保存资源及状态JSON、不启用来源。新增28项、相邻62/62；完整690/690及167文件归档通过，精确CI另验。实际Host来源收集、配置/数据库/RAG恢复、总预览/激活及界面仍缺，M2/L2未完成，见`docs/decisions/0082-complete-skill-inventory.md`。

> 2026-10-21检查点0081：新增公开SDK配置逻辑快照和完整已选技能根资源的加密恢复候选，C91十四+C92二十共34项通过。全量来源装配、配置/依赖/RAG恢复、界面及激活仍缺，M2/L2未完成；完整662/662及166文件包通过，精确CI另验，见`docs/decisions/0081-profile-and-skill-backup.md`。同日22:05画布复核未发现新增原生代码问题。

> 2026-10-21检查点0080：修复真实dev50 CI发现的文档撤权错误透传；C90六项先红后绿，相邻18项通过。dev50实际CI621/622失败保留，不宣称成功；完整628/628与163文件包通过，精确CI待验，见`docs/decisions/0080-document-authority-timing.md`。

> 2026-10-21检查点0079：新增加密记录归档与公开会话/附件备份、空白候选还原；C88/C89共25专项通过。配置、技能/RAG和界面仍缺，M2/L2未完成，见`docs/decisions/0079-encrypted-session-backup.md`。完整622/622与163文件包通过，当前CI另验；用户运行实例与画布不变。

> 2026-10-21检查点0078：新目标绑定CLI/实例/配对/操作者及权限摘要，四面板和专用Owner入口拒绝旧选择；旧RPC精确参数与回执保持。C87新增十三项、完整597/597与159文件包通过，当前CI及新安装另验。旧Host5180仍运行，未强制结束或换装；见`docs/decisions/0078-target-connection-identity.md`。

> 2026-10-21检查点0077：只读复核画布交接已落实；DSH接入活动定位MCP/Owner与四面板，完整584/584与157文件包、专项21项和画布相关67项通过。当前远端3.4.1、本机3.4.0，未新增确认必须画布改动的代码项；精确提交CI及新安装界面另验，见`docs/decisions/0077-active-canvas-targets.md`。

> 2026-10-21检查点0076：补齐42篇固定SDK指南和190行发行模板的首次技术审阅，43份记录按内容摘要绑定，不冒充人类发布批准。C85验证实际Node PTC嵌套RAG、PiAi目录随凭据变化及原生保存优先/环境回退，修正来源提示；C83真实记录组合仍拦截缺Canary的发布。本机完整563/563与154文件包通过，当前提交CI/默认晋升预览另核对，见`docs/decisions/0076-initial-sdk-review-and-credential-source.md`。

> 2026-10-21检查点0075：按用户要求再次复核画布更新。GitHub为正式3.4.1，本机安装和运行仍3.4.0；此前活动定位交接已落实，配套CLI精确握手及原生限定15/15通过。DSH仍旧工具信任CLI_CHANGED，没有新增确认必须画布修改的代码项；见`docs/handoffs/canvas-agent-v3.4.1-review.md`。仅文档/核验元数据更新，未改生产代码或原生。

> 2026-10-21检查点0074：W5已接默认预览、上游审阅/W3来源、实际模板摘要、七日原始证据重算、隔离安装与不可变稳定发布/双通道索引；C81–C84新增30项，本机完整555/555。首次42指南审阅及真实观察/发布仍待验，见`docs/decisions/0074-stable-promotion-workflow.md`。

> 2026-10-21检查点0073：固定候选W6现已接入发布资产/源码/完整包/SDK检查和安全artifact导出，完整服务器观测采集器已实现，C79十二+C80八通过；promote/上游ack/稳定发布仍需继续，见`docs/decisions/0073-candidate-smoke-and-collector.md`。

> 2026-10-21检查点0072：新增固定候选观测的原始Actions证据读取与七日判定规则（工作流接线仍待完成）；用户要求的画布复核确认本机3.4.0及限定10项通过，DSH停在旧CLI信任，见`docs/decisions/0072-candidate-observation-evidence.md`与`docs/handoffs/canvas-agent-v3.4.0-review.md`。

> 2026-10-21检查点0071：W5基础改为从自身公开package.json读取版本，保持Canary/稳定包只差manifest版本；C76真实双构建/双安装通过，不放宽完整载荷比较，见`docs/decisions/0071-version-neutral-payload.md`。

> 2026-10-21检查点0070：0069默认预览成功但sourceDirty=true；两份真实克隆定位公共技能feed的CRLF/LF转换状态，精确LF属性与C75真实Git先红后绿修复，clean门禁不放宽，见`docs/decisions/0070-generated-feed-line-endings.md`。

> 2026-10-21检查点0069：0068默认发布预览C26失败后复现空闲HTTP连接故障；本机真实复现并在DSH CanvasBridge公开fetch/发现选项中一次性HTTP连接修复，保持单次POST。C74四项及C25/C26共九项通过，Native不改，见`docs/decisions/0069-canvas-idle-transport.md`及`docs/handoffs/canvas-agent-idle-transport.md`。

> 2026-10-21检查点0068：W4 release.yml实现默认预览、内置模块隔离写任务、服务端精确CI/安装证明、不可变Canary资产回读、保留版本的独立通道索引和可选Pages。C73十五项，真canary/Pages未发布，W5晋升继续，见`docs/decisions/0068-isolated-canary-publisher.md`。

> 2026-10-21检查点0067：新增有界归档验证、确定性编译Git快照、官方市场格式索引/compat预览和可重用候选目录；共享打包路径约束。C72十二项及真实固定GitHub提交全152文件安装/卸载通过；W4发布器/Pages及W5晋升仍需继续，见`docs/decisions/0067-release-artifact-preparation.md`。

> 2026-10-21检查点0066：新增W6受控真实网关工作流与独立检查器，main/最新完整CI/费用同意/默认关闭计划/单次出站/安全报告/可选去重失败通知；十二项及新CLI一次真实Flash通过。W4发布、W5晋升仍待开发，见`docs/decisions/0066-controlled-real-gateway-smoke.md`。

> 2026-10-21检查点0065：五个技能/MCP/更新面板统一请求归属与同步单次提交；切换连接清除旧详情/信任/维护确认，阻断旧请求的依赖移除和状态回填，保留另存技能的新草稿，停止下载仅在实际下载显示。C70先复现后修复十八项，真实浏览器另验，见`docs/decisions/0065-market-client-scope.md`。

> 2026-10-21检查点0064：修复知识库旧API/资料空间响应回填、重复提交、旧create续发index、迟到引用复制和草稿被清空；来源关闭及绑定读取也按各自代次核对。C69先红后绿、十项组件处理器及类型检查通过；Host授权/排序/schema不改，真实浏览器另验，见`docs/decisions/0064-knowledge-client-scope.md`。

> 2026-10-21检查点0063：C68五种原生推理回放形态及真实默认Flash跨回合/工具结果结构化回传通过，三个最终请求、两个普通completed回合、工具一次执行。前三个先期验证各一请求因测试器假设过窄未完成，保留证据；生产代码/配置未改，见`docs/decisions/0063-native-reasoning-replay.md`。

> 2026-10-21检查点0062：C67实际已发布AgentLoop三项生命周期回归通过；真实默认Flash两请求触顶、一请求在正文出现前取消成功，原生aborted/user且无重试。首次“正文后取消”未触发如实保留；不证明后端停算、退款或实显。生产代码/配置未改，见`docs/decisions/0062-default-stream-lifecycle.md`。

> 2026-10-21检查点0061：四个画布面板使用项目/画布共同身份，刷新不改选首项，目标消失清空；保留可选列表完整性，旧响应不冒充完整。五项新合同及真实Flash两请求选择澄清通过；当前3.3.7只读握手/认证/列表通过。3.3.9源码和发布元数据已核对，未安装或改信任；见`docs/decisions/0061-explicit-canvas-target.md`及`docs/handoffs/canvas-agent-v3.3.9-review.md`。

> 2026-10-21检查点0060：修复源码检出换行导致的安装包摘要差异。精确Git文本规则与独立临时打包副本同时覆盖新检出和旧CRLF目录，源码字节保持；新增C61/C62/C63，真实完整包及独立构建验证通过，完整检查/本次CI另核对。见`docs/decisions/0060-canonical-package-bytes.md`。

> 2026-10-21检查点0059：默认Flash通过实际已发布AgentLoop与原生附件存储，一次真实请求正确识别自建图片的随机色块顺序，图片字节与原生请求投影一致；新增C60回环集成契约。仅默认模型/简单测试图，不代表其他模型或浏览器验收。见`docs/decisions/0059-default-flash-image-validation.md`。

> 2026-10-21检查点0058：已发布AgentLoop的完整文件会话真实Flash两请求正常完成；实际全局画布技能存在时，真实Agent经MCP取得L0原生方案并同方案卡片采纳通过，测试主动取消后续模型请求，不是作品生成验收。新增C59及Native活动上下文交接，完整398/398、150文件包与0057已安装包字节相同，无需重装；本次CI另核对，见`docs/decisions/0058-published-agent-loop-validation.md`。

> 2026-10-21检查点0057：ctx.zhenRag可替换本地召回后端、授权分页、暂停/恢复及结构化错误。完整397/397和真实Flash示例引用/prepare后暂停及撤权拦截通过；150文件包已公共CLI换装到本机，设置/索引/配对保持。真实浏览器/独立第三方后端未验，远端CI按本次提交核对，见`docs/decisions/0057-replaceable-local-retrieval.md`。

> 2026-10-21检查点0056：聊天原生方案卡片可直接审阅，按调用/ID/摘要采纳原方案并定位画布页；完整391/391。真实安装版一次L0方案卡片采纳、真实Flash示例检索引用及准备请求后撤权拦截通过。实际浏览器/原生窗口批准及生成仍未验，见`docs/decisions/0056-inline-canvas-plan-and-real-rag.md`。

> 2026-10-21检查点0055：连接向导优先检测运行桌面的配套工具，原生精确握手与配对分别显示；会话提示/内置技能统一画布MCP，修正认证策略误读及全局CLI回退。387/387、真实Flash四请求及一次真实原生L0小鸟方案通过窄范围验证；没有实际出图，见`docs/decisions/0055-guided-canvas-and-chat-routing.md`。

> 2026-10-21检查点0054：真实桌面3.3.7与源码CLI图谱摘要不同；用户审阅改选安装资源CLI后，原生精确握手及会话检查通过，状态paired。完整创作仍未验；用户追加要求简化DSH连接流程，继续开发。见`docs/decisions/0054-installed-canvas-cli-selection.md`与`docs/handoffs/canvas-agent-installed-cli-compat.md`。

> 2026-10-21检查点0053：dev24验收包已通过公共CLI换装到实际本机Host，默认模型/隐私、美术、连接和自有索引元信息保持；不是实际用户导入或原生窗口审批验收。见`docs/decisions/0053-verified-local-activation.md`。

> 2026-10-21检查点0052：本地导入详情与画布现场交接，见`docs/decisions/0052-import-diagnostics-and-canvas-handoff.md`；完整375/375通过，打包及远端CI另行核对；实际用户Host仍dev23，不打断待确认配对。Chrome审批桥问题交画布Agent，见`docs/handoffs/canvas-agent-instance-discovery.md`。

> 2026-10-21检查点0051：DOCX正文/表格本机索引及提取文本行引用，完整369项；实际安装/CI结果以0051记录为准，Word页码/排版、OCR/向量与真实模型未验。先前0050：参考素材目录、有序内容身份核对、图片/视频编辑与参考理解模型入口；完整362项及原Native全新TEMP三路径通过。用户原生窗口/付费仍未验，引用原子复核等见 `docs/handoffs/canvas-agent-reference-assets.md`。上次dev21 Windows CI355项实际成功。

> 原规划写于 2026-10-19。**2026-10-20 已进入开发**：请先读 `docs/decisions/` 最新记录（当前0001–0074）、`meta.json`、`features.json`、`UPSTREAM.lock.json` 和当前源码/测试。下文任务卡保留历史方案，不能将其“尚无代码”等描述当作当前状态。用户已追加授权联网找社区原图及imagegen二创，原来“不得二创/只能用户供图”的历史限制不再适用。上游候选见0012，画布L0规划见0013，纯文字自动更新见0014，MCP重启/重新下载/保留副本还原见0015；本地RAG来源多样性与合成检索评估见0016；显式Flash连接检查见0017；带资源的本机技能库连接见0018；公开GitHub资源技能快照见0019；已有网关任务状态与结算追踪见0020；本机结果导出见0021；本机画布安装检测与源码防重放/能力摘要同步见0022；连接页原生窗口配对见0023；原生配对存储协调及精确清理见0024；连接页原生创作方案/窗口审批/结构应用见0025；聊天方案交接与原生临时库验证见0026；运行计划/双门审批/GET恢复见0027；原生任务中心与产物核验摘要见0028；本机默认二创美术自动装配见0029；已保存结果导入/放置与安装版握手阻塞见0030；可选私有GitHub只读入口见0031；完整Native接入源码备份/发现故障/交付授权边界见0032；0033时用户指定画布Agent接管原生改动并暂缓发版，见0033及 `docs/handoffs/canvas-agent.md`，DSH Agent不得继续修改画布；本地RAG来源卡片/来源上下文及同会话读取见0034；Windows源码一键准备/启动与干净声明产物见0035，原生Seedance凭据事件与真实只读钱包验收见0036；原生聊天图片输入/配置换装及一次获批真实Flash短检查见0037；中文问句本地词法候选与1007篇实际安装文档初评见0038（7/10低于建议80%，负责人未验收）；源码版GitHub检查/指定提交快进/可选启动自动更新及仅本机创作资料目录见0039；画布Agent已发布3.3.7，本DSH侧只读核对源码/GitHub及状态、修正平铺兼容报告，见0040与 `docs/handoffs/canvas-agent-v3.3.7-review.md`；旧CLI pin不静默提升，仍待连接页审阅及真人原生窗口配对；问句连续词还原与同判据8/10见0041；负责人已采纳这套10问与80%首版基线，UI/真实模型及完整M3仍未验收；真实私有GitHub源码启动自动快进/新进程及CSS换行产物一致性见0042；真实filesystem维护/项目字节保留与旧会话工具资源入口撤权修复见0043；带出处创作技能1.0.1、仅目录换装与真实GitHub正文三独立进程更新/回退见0044（gh读取适配器，应用Bearer仍未验）；负责人已公开仓库，实际生产Host匿名HTTPS与三进程技能更新/回退见0045，不再需要私有读取凭据；首次公开CI实际333/334发现不可变夹具CRLF检出，精确Git属性与真实Git回归修正见0046；0046修正后的公开Windows CI39433495391已实际全绿（335项、打包及官方CLI临时安装/Host启动）；本地文字PDF、真实页码引用与自有schema2→3事务迁移见0047，完整348项与同基线8/10通过，扫描件OCR/真实模型/浏览器仍未验；dev19首次PDF远端CI347/348、C47导入约12.2秒失败，30秒有界冷启动余量与后续验证见0048，不能把本地348全绿写成该远端已通过；dev20修正后真实Windows CI39445861129已全绿348项及安装解析器；音频方案、原生模型就绪选择和参数匹配、原Native临时库三模型/新节点验证见0049，本地355项通过；后续协议合同交接见docs/handoffs/canvas-agent-api-coverage.md；逐项未验收范围见 `docs/delivery-status.md`；公开后远端工作流已实际运行，首次333/334的夹具换行问题见0046；私有阶段付款/额度未启动的记录仅为历史。
> 本文是入口和任务卡；证据、来源、完整表格都在 `reference/` 下的三份完整备忘录里（文中用"备忘录 01/02/03"指代）。

## 0. 先读这个（5 分钟版）

1. **要做什么**：DSH-zhen = DeepSeek Harness（DSH，MIT，上游 `deepseek-ai/deepseek-harness`）的非官方魔改版。默认走 Seedance 网关的 `deepseek/deepseek-v4.1-flash`；界面换成「潮汐」主题，承载用户提供的"鲸鱼娘"角色美术；内置创作 SKILL 和创作者 RAG；能通过专用 MCP 遥控 T8-penguin-canvas。
2. **怎么做**：**不 fork 上游**。A 层 = 我们自己的 npm 包（配置 bundle + 客户端/服务端插件 + SKILL + MCP 配置），装进用户已有的官方 Desktop；B 层 = 可选的自有安装包（M5）。永远不合并上游分支。
3. **第一步做什么**：M0——**先做 Seedance 实测 T-01…T-12，再写配置**。备忘录 01 §4.3 的配置片段全是【拟定】，不是最终值。
4. **你不能做什么**：见 §2 的硬规则。最重要的三条：不碰上游源码；不公开本地私有工作文件；付费生成一律先报价再双门批准、拿到 task_id 之后只查询不重发。鲸鱼娘的社区参考与imagegen二创已获用户明确授权。

## 1. 读什么、按什么顺序

| 顺序 | 文件 | 为什么 |
|---|---|---|
| 1 | `00-项目总览与决策.md` | 决策状态、三处备忘录矛盾（§6，**以它为准**）、风险 |
| 2 | 本文 | 任务卡与规则 |
| 3 | `AGENTS.md` | 落库后放仓库根的工作规则 |
| 4 | `reference/01-架构与上游同步-完整备忘录.md` | 仓库形态、Seedance 配置、同步方案、补丁面、里程碑、T-xx 清单 |
| 5 | `reference/02-画布MCP-技能-RAG-完整备忘录.md` | 画布 MCP 29 个工具、付费安全、SKILL、RAG |
| 6 | `reference/03-UI设计规格-完整备忘录.md` + `03-tokens.css` | 令牌、槽位、10 屏布局、S1–S8 |
| 7 | `design-source/` + 在线设计画布 | 12 屏视觉稿（源文件需在设计画布里渲染） |

**读源码前先 grep，不要凭备忘录里的行号**：行号是 2026-10-19 在 `dsh-v0.2.1-rc.2` 浅克隆上的快照。备忘录里标【待实测】/【未核实】的，先验证再依赖；标【拟定】的名字（包名、服务键、配置键）上游不存在，别去上游搜。

## 2. 硬规则（违反任何一条都要停下来问）

1. **不修改上游。** A 层只通过 npm 依赖与 `peerDependencies` 引用上游已发布包。`upstream/`（B 层子模块）只读。不向上游提 PR（上游不收外部 PR）。
2. **先问"能不能放进 bundle 行 / 客户端插件 / 服务端插件 / SKILL / MCP"。** 能就不要碰上游。
3. **不碰清单 N1–N10**（备忘录 01 §5.3）：`vendor/`；会话持久化格式与 `$DSH_HOME/sessions`；`.credentials.yaml` 布局（只经 `ctx.credentials`）；`app-boot` 启动器内部与 profile 私有文件；typert/api-gateway 协议与生成类型；`llm-deepseek` 线协议；Desktop 的 IPC/预加载/更新协调器；客户端引导内核；上游给 pi-ai 打的补丁；上游生成文件。
4. **"整行替换"必须重述整行。** 上游 patch 替换整行 `config`、不深合并（F-05）。对 `llm-pi-ai`、`agent-preset-registry` 这类行的覆盖，补丁里要写全部配置，并注释上游来源与版本。
5. **凭据只经 `ctx.credentials`。** 日志不打印密钥、不打印会话全文；CI 的 `SEEDANCE_API_KEY` 只给 W6 冒烟。余额/计费/轮询只在服务端（Host 侧）调用，**不要让浏览器带密钥请求网关**。
6. **默认禁用所有指向 DeepSeek 的上报**（会话日志、OTel、桌面产品分析）；要开必须在界面明示去向并取得同意；由 C8 抓包守住。
7. **用户已授权联网查找社区角色并用imagegen二创。** 素材独立放在 `packages/dsh-zhen-client-brand/assets/`，保存来源、提示词、摘要和确认记录，不重复索要同一授权。降级图形继续使用原创水纹、气泡、潮汐带、等深线与焦散，不近似官方图标。`manifest.json` 的 `license.confirmedByUser !== true` 时，发布构建拒绝打包该套美术。
8. **品牌合规**：项目名 "DSH-zhen"；不使用 "DeepSeek Harness" 全称（"基于 DeepSeek Harness（DSH）"这类说明性用语允许）；"关于"页写明"非官方社区修改版，与 DeepSeek 无隶属关系"；保留上游 MIT 声明；官方图标/`ui-brand-official`/`HeroFish`/安装页素材一律不沿用。发布前 grep `FishLogo` 与官方图标文件名。这是工程清单，不是法律意见。
9. **每个对上游的假设都要有契约测试**（`contracts/`）；每个里程碑结束写一页 `docs/decisions/NNNN-*.md`，记录偏离本方案之处与原因；上游行为问题记在 `docs/upstream-assumptions.md`。
10. **你读不到的就说读不到。** 不要把推断写成事实；报告里区分"已验证 / 待验证 / 未验证"。

## 3. 目标仓库结构（E:\DSH-zhen，当前为空；这是 A 层的最终形态）

```
DSH-zhen/
├─ README.md  LICENSE(MIT)  NOTICE  THIRD_PARTY_NOTICES.md     # 保留上游 MIT 声明
├─ UPSTREAM.lock.json          # 对齐点：tag / commit / npm 版本 / 已评审的升级指南清单
├─ package.json  pnpm-workspace.yaml  .npmrc  tsconfig.base.json
├─ packages/
│  ├─ dsh-zhen-bundle/         # 唯一的配置层：cordis.patch.yml（Seedance/默认模型/禁用 DeepSeek 绑定行）+ engines.dsh + 生成的预设
│  ├─ dsh-zhen-client-brand/   # dsh.client 插件：主题令牌 / Hero / 品牌槽位 / locale / 美术加载
│  ├─ dsh-zhen-wallet/         # M1：余额服务（服务端）+ 余额 chip（客户端）
│  ├─ dsh-zhen-onboarding/     # M1：首启 Seedance 密钥引导卡
│  ├─ dsh-zhen-rag/            # M3：ctx.zhenRag + provider + rag_search 工具 + Web 卡片
│  ├─ dsh-zhen-canvas-guard/   # M4：画布付费守卫（tools/pre-execute + ctx.tools.guard）
│  └─ dsh-zhen-skills/         # M4：<name>/SKILL.md 技能目录
├─ contracts/                  # 契约测试 C1..C10 + ack/（升级指南人工确认）
├─ scripts/                    # upstream-probe / upstream-sync / gen-presets / gen-market-index / zhen-backup
├─ market/plugins.txt          # 喂给上游 plugin-market-generator 的源清单
├─ docs/                       # seedance-compat.md（实测报告）/ upstream-assumptions.md / runbooks / decisions
├─ upstream/  patches/  overlay/   # 仅 B 层（M5）：钉死标签的子模块 / 补丁队列 / 整文件覆盖
└─ .github/workflows/          # W1..W7
```

`upstream/`、`patches/`、`overlay/` 在 M0–M4 **不存在**。包名为【拟定】。

## 4. 任务卡（里程碑 M0–M5）

人日均为估算。顺序建议 M0 → M2 → M1 并行 → M3 → M4；M5 视 D1/D7 决定。

### M0 · 骨架 + CI + Seedance 默认接入（7 人日，5–9）

- **目标**：装有官方 Desktop 的机器上，安装一个 tgz 后，新会话默认走 Seedance + `deepseek/deepseek-v4.1-flash`，不向 DeepSeek 上报，CI 能在上游 `next` 上自动验证。
- **第一天**：做 §8 的 T-01…T-12，把结果（脱敏的请求/响应样本）写进 `docs/seedance-compat.md`，再定 `compat` 取值。T-03/T-04 不通过则走备忘录 01 §4.10 的应急预案（先调 `compat` 开关，再降级能力，最后才写自有适配器，预估 8–12 人日）。
- **交付**：仓库骨架、`LICENSE`/`NOTICE`、`UPSTREAM.lock.json`、`ci.yml`、`upstream-watch.yml`（先只报告）；`dsh-zhen-bundle`（Seedance 路由 + 默认模型 + 禁用 DeepSeek 绑定行 + `engines.dsh`，`pnpm pack` 出 tgz）；安装脚本与文档（`dsh plugin --profile desktop add ./dsh-zhen-bundle-x.y.z.tgz`；若壳内没有 CLI，则给 Plugin Manager 图文步骤，T-17）；契约测试 C1–C4、C5（基础 mock）、C8（脚本版抓包）。
- **验收**：
  - A1：干净 profile + 基线版本官方 Desktop，装 tgz 后不手动选模型，新会话请求的 provider = `seedance`、model = `deepseek/deepseek-v4.1-flash`；一轮含工具调用（读文件）的对话流式成功。
  - A2：`--dump-config` 中禁用清单里的行均为 disabled；15 分钟使用抓包，除 `api.seedance.nz` 外无出站（官方壳层更新检查另列）。
  - A3：卸载 bundle 后恢复官方默认（回滚演练 L1）。
  - A4：CI 在 PR 与上游 `next` 上通过；`upstream-watch` 对伪造的更高标签能检出（dry-run）。
- **依赖**：一把可用的 Seedance 密钥（用户提供，不入库）。**风险**：R2、R3、R6。

### M1 · UI 主题/品牌 + 余额 + 首启引导（8 人日，6–10）

- **目标**：应用内体验完全是 DSH-zhen；新用户不被 DeepSeek 概念困扰；余额可见。
- **交付**：`dsh-zhen-client-brand`（把 `03-tokens.css` 映射到 `--dsw-*`；`conversation.hero.brand.mark`、`sidebar.brand.mark`/`name` 占位组件；用户美术的目录约定与加载；抽象降级图形）、`dsh-zhen-wallet`、`dsh-zhen-onboarding`、截图视觉回归基线、契约测试 C6。
- **验收**：浅/深主题截图基线通过；界面里无 DeepSeek 鲸鱼/字样残留（检查清单 + 对 DOM 文本和 SVG 的自动扫描）；余额与网关控制台一致（人工抽样 3 次）；无密钥 → 引导卡出现 → 保存后一轮对话成功；`402` → 友好提示并刷新余额。
- **依赖**：M0；用户美术。**先做**：T-20（槽位优先级、`--dsw-*` 覆盖完整度、locale 覆盖）。
- **注意**：§6 的"纯插件做不到"清单（S1–S4、S6–S8）在 D1/U2 拍板前不要擅自打补丁；先交付 T+P 项。

### M2 · 上游自动跟进（8 人日，6–10）

- **目标**：上游发新标签后 24 小时内自动出 PR，并给出"能否晋升"的结论。
- **交付**：W2–W6；C5–C10 全套；`zhen-backup`；回滚 runbook；发布流水线（tgz + `market/index.json` + Pages）；`compat.json`；ack 目录与 PR 模板。
- **验收**：演练 1——本地 git 仓库模拟上游标签并改名一个行 id → C1 红并点出该行；演练 2——新增一篇升级指南 → C9 红；演练 3——L1 + L2 回滚成功；演练 4——`promote` 走通一次。
- **风险**：R9（CI 机密）、R11（会话格式随上游升级，旧版读不了新日志）；没有上游测试通道，需用本地 git 仓库模拟标签。

### M3 · RAG 接缝与词法检索（12 人日，9–15）

- **目标**：对话中能检索本地知识并以来源卡片展示；后端可换。
- **交付**：R0（挂画布侧 `creative-rag` MCP + 卡片 + SKILL 说明，约 2 人日）；R1 `dsh-zhen-rag`（服务 `ctx.zhenRag` + provider 注册表 + 词法 provider + `rag_search`/`rag_open` + `presentationMeta` + Web 卡片 + 可选 `autoInject`）；由脚本生成的预设（C7）；中文检索策略（T-24）与性能基线（T-25）。
- **验收**：导入 1k 篇 Markdown 后，预设的 10 个中文问题 top-5 命中率达到约定阈值（建议 80%，评测集与阈值由 T8star 与画布侧共同定）；卡片展示来源且可打开；关闭 provider 时 `rag_search` 返回结构化错误而非崩溃。
- **关键判断**：仓库内没有现成 RAG 接缝（部分未逐包读源码）；**Seedance 没有 embeddings 接口**，所以首版用词法（SQLite FTS5/BM25）；向量是可选 provider（本地 ONNX 中文小模型）。先做 T-23（`node:sqlite` + FTS5 在 Desktop 运行时可用，备选 JSON + MiniSearch）、T-24。

### M4 · 画布 MCP 对接 + 创作 SKILL 包 + 市场索引（8 人日，6–12）

- **目标**：DSH-zhen 里能遥控画布并按技能工作。
- **交付**：画布 MCP 行（按备忘录 02 定稿）；`dsh-zhen-canvas-guard`；`dsh-zhen-skills` 首批 15 个 SKILL 与专用 provider（`$DSH_HOME/zhen/skills` 同步目录为退路）；市场索引 + Discover 一键安装文档；端到端演示脚本（受控的图/视频生成流程）。
- **验收**：付费类工具一律触发 `ask`；未获批准的付费调用被 `ctx.tools.guard` 拒绝（有契约测试）；SKILL 在目录可见且模型能按描述加载；一条真实"图生视频"流程在画布侧完成并回写。
- **依赖**：M3 的卡片/注入范式；画布侧 MCP 完成度与新增接口（§7.3）。

### M5 · 自有安装包（B 层，可选）（18 人日，14–25；外部：证书与托管）

- **目标**：安装包即 DSH-zhen，钉死上游版本，自有更新源。
- **开工第一天**：做 T-26/T-27——先读 `apps/desktop/src/{update-channel,release,update-coordinator,update-http-executor,mandatory-update-policy}.ts`、`project-manager.ts`、`core-package-set.ts`、`scripts/prepare-package-set.ts`，再定最终补丁面（P3 是最不确定的一项）。
- **交付**：`upstream/` 子模块 + `patches/` + `overlay/`（O1 `electron-builder.config.mjs`、O2 图标/安装页素材、P2 欢迎页 `save()` 目标、P3 更新源、P5 预装 bundle，可选 P4）；W7；自有图标与安装页；安装/升级/回滚测试。
- **约束**：行级补丁预算原为 ≤4 个、≤300 行，**采纳 UI 的 S 补丁后需重算**（见 `00-…` §6）。打包版本号形如 `0.2.1-rc.2.20261101.1`，**不能带构建元数据（`+…`）**，否则 `electron-updater` 的 `semver.gt` 比较会出问题。官方 `dsh://` 协议名若不改会与官方应用抢协议处理。
- **验收**：干净 Windows 机器安装 → 首启直达 Seedance 引导 → 对话成功；N → N+1 升级成功且用户数据保留；退回 N 成功；无出站到 DeepSeek 域（含壳层更新检查）。

## 5. Seedance 默认接入（M0 的核心）

**已核对原文**（`https://api.seedance.nz/docs/llms.txt`）：

- 对话：`POST https://api.seedance.nz/v1/chat/completions`，`Authorization: Bearer sk-…`，OpenAI 风格，同步或 SSE。
- 默认模型 `deepseek/deepseek-v4.1-flash`：262,144 上下文；图片输入、工具调用、推理、流式、上下文缓存、结构化输出；`max_tokens` **包含推理消耗**。
- **没有** `GET /v1/models`；全文检索 `embedding` 0 命中；余额 `GET /api/usage/wallet/`（展示 `data.amount`，不展示内部 `quota`）。
- 媒体生成全部异步提交 + 轮询（建议 3–5 秒）；结果 URL 约 24 小时过期；失败任务退款；单任务花费在 `usage.amount`（位置因端点而异）。
- 文档**没写**：流式 `usage`、`reasoning_content`、思考开关参数、工具调用流形状、错误体形状 → 全部待实测。

**配置落点**（全部【拟定】，取值待 T-xx；字段名来自 `llm-pi-ai` README 与 `catalog.ts`）：

```yaml
# packages/dsh-zhen-bundle/cordis.patch.yml
- id: llm-pi-ai                      # 覆盖 base 里的休眠行；整行 config 被替换！
  config:
    providers:
      seedance:
        displayName: Seedance
        apiKeyEnv: SEEDANCE_API_KEY  # 凭据引用名，不是密钥
        api: openai-completions
        baseURL: https://api.seedance.nz/v1    # 是否带 /v1 需实测
        compat:
          supportsDeveloperRole: false         # T-06
          maxTokensField: max_tokens           # T-05
          supportsUsageInStreaming: false      # T-01 先保守
        retryPolicy: { mode: normal, maxRetries: 3 }   # T-09：402 不应重试
        models:
          - id: deepseek/deepseek-v4.1-flash
            contextWindow: 262144
            maxTokens: 32768                   # 占位，T-05
            input: [text, image]
            compat:
              thinkingFormat: deepseek                             # T-03/T-04
              requiresReasoningContentOnAssistantMessages: true    # T-03
            reasoningEfforts:                                      # T-04：开关参数未记载，以实测为准
              off:
              high: high
- id: agent-default-model
  config: { provider: seedance, model: deepseek/deepseek-v4.1-flash }   # T-15：已保存选择优先
# 隐私硬化（T-16 逐行验证禁用后是否牵连依赖方）
- { id: session-log-deepseek, disabled: true }
- { id: plugin-package-inventory-deepseek, disabled: true }
- { id: deepseek-llm-api-extensions, disabled: true }
- { id: session-telemetry-otel, disabled: true }
- { id: otel, disabled: true }
- { id: desktop-product-telemetry, disabled: true }
- { id: product-analytics, disabled: true }
# 品牌占位
- { id: ui-brand-official, disabled: true }
- { id: ui-deepseek-model-label-1017, disabled: true }
```

**两个结构性陷阱**：

1. **Models 页保存会整行替换我们的 `llm-pi-ai`**（profile 层覆盖 bundle 层）。是否保留 `seedance` 取决于编辑器以什么为底稿——T-14。缓解：契约测试 C2（模拟保存后 `--dump-config` 断言 `seedance` 仍在）→ 守卫插件（缺失时横幅 + "恢复默认"，经 `ctx.configEditor`）→ 备选把 Seedance 放第二个 pi-ai 行（T-14b）。
2. **官方欢迎页只会把密钥写进 DeepSeek 的凭据引用**（A 层最大坑）。推荐路径：安装脚本里一次性 O1（环境变量 `SEEDANCE_API_KEY`）→ 进入工作区后由应用内引导卡 O3（`credentials.set`）长期接管 → O4（Models 页手填）兜底。**不要**用 O5（让 Seedance 引用指向 DeepSeek 的引用）——用户一旦切回 DeepSeek 官方模型，Seedance 密钥会被发往 `api.deepseek.com`。
3. 保留 `deepseek-account` 与 `llm-deepseek*` 不禁用：官方欢迎页的读写依赖 `llm-deepseek` 设置命名空间，禁用会让欢迎页保存失败。

**出站流量验收口径**：除 `api.seedance.nz` 外无出站；官方壳层的更新检查（`download.deepseek.com` 与强制更新策略服务）在 A 层**无法禁用**，另列说明，B 层才能替换。

**默认模型之外的候选**（均须逐个实测后才能进默认列表）：`deepseek/deepseek-v4-flash-vision-exp`（1M 上下文，未声明推理）、`glm/glm-5.3-flash`、`qwen/qwen3.8-flash-next`、`qwen/qwen3.8-max`、`glm-5.3`（`tool_choice` 仅支持 `auto`，慎用）、`kimi-k3`；`zhenzhen/*` 价格高，不进默认。

## 6. 上游自动跟进（M2 的核心）

- **不合并上游，只"钉死 → 探测 → 验证 → 晋升"。** 追踪对象是 `dsh-v*` 标签与 `next` dist-tag，**不是 `latest`**（部分包 `latest` 停在陈旧版本）。各包版本锁步。
- **工作流**：W1 `ci.yml`（PR/push：lint/构建/C1–C4、C6、C7/打包/许可证扫描）· W2 `upstream-watch.yml`（cron 每 6 小时）· W3 `upstream-sync.yml`（开分支、更新 lock、列新升级指南、跑 C1–C10、开 PR：全绿贴 `canary-ready`，有红贴 `needs-attention` 并建 issue）· W4 `release.yml`（tgz + `market/index.json` + Pages + `compat.json`）· W5 `promote.yml`（canary→stable：W3 全绿 + ack 完成 + 7 天观察期内 W6 无回归）· W6 `real-gateway-smoke.yml`（每日真实网关冒烟，失败不挡 PR 只建 issue）· W7 `desktop-package.yml`（仅 B 层）。全部用 GitHub 托管 runner（上游 CI 用自托管 runner 与 EV 硬件令牌，不可复用）。
- **契约测试**：C1 行 id 存在且不冲突 · C2 `--dump-config` 金样（含模拟 Models 页保存）· C3 兼容闸（不在 `skippedBundles`）· C4 配置键被严格校验接受 · C5 Seedance 一轮模拟（流式/工具/推理回放/402/429/取消）· C6 客户端槽位名与 `kind/scope` 存在 · C7 预设漂移（重新生成对比）· C8 出站抓包 · C9 新增升级指南必须有 `contracts/ack/<版本>/<条目>.md` · C10 持久化向前兼容。
- **版本**：我们的包独立 SemVer `0.<minor>.<patch>`，预发布通道 `-canary.N`；`UPSTREAM.lock.json` 由 W3 维护，人工只在 ack 时改 `guidesReviewed`；`engines.dsh` 由 W4 根据 `compat.json` 写入——**上游预发布参与匹配，区间必须显式覆盖预发布**；canary 宽、stable 窄，守卫插件在检测到未验证版本时给横幅。
- **升级指南是第一手变更清单**：`docs/upgrade-guide/v<版本>/<条目>/guide.md`，每次同步强制人工过一遍（C9）。
- **备份/回滚**：`zhen-backup` 在升级前快照 `$DSH_HOME` 下的 sessions、profiles、机器级 patch、用户技能；**凭据默认不备份**；`dsh --profile <名> --from-default-profile <模板>` 会**整体替换**目标 profile，文档里不得推荐随手执行。L1 回退上一版 tgz / `dsh plugin remove` · L2 `zhen-backup restore` · L3 Desktop 自带恢复会禁用全部第三方 bundle（恢复后需重装）· L4 回到上游旧版本——**A 层几乎做不到**（官方自动更新，且旧版是否读得了新日志未核实）· L5 从索引撤下坏版本。

## 7. 画布对接（M4 的核心）

### 7.1 方案

- MCP 是画布**现有 Agent 控制面**（`/api/agent-control/v1`：配对 + 分权 token + 39 个版本化创作能力 + 预览-批准-精确应用 + RunIntent）的**薄适配层**，不是另起一套；放进画布仓库 `tools/canvas-mcp/`，复用 `zcanvas-cli` 的 `agentClient`/`discovery`/`secureStore`。传输选 **stdio**。
- DSH 会先起一个**临时探测进程**再起正式进程 → MCP 启动必须无副作用、无配对、无网络写；配对做成单独工具 `canvas_pair`。
- **令牌不要放环境变量**：DSH 会清洗匹配 `/KEY|PASSWORD|SECRET|TOKEN/i` 的环境变量与 `DSH_*`；走画布 secureStore。
- 服务名暂用 `t8canvas`（工具在 DSH 里显示为 `mcp__t8canvas__<tool>`），待 U9 固定。
- 集成路线：P0 = 仅 MCP（DSH-zhen 独立窗口遥控画布）→ P1 = 把 DSH-zhen Web 嵌入画布侧栏 → P2 = ACP 无头助手（权限提示并进画布审批卡）。
- **只支持 Electron 桌面版画布**（Web-only 模式下审批如何完成未核实）。

### 7.2 工具（29 个，完整表见备忘录 02 §3.3）

按权限分档 `read`（L0）/ `write`（L1，需画布审批）/ `run`（本地处理或排队）/ `paid`（L2，必须报价 + 双门）：
- read：`canvas_status` `workspace_list` `canvas_inspect` `node_schema_inspect` `canvas_validate` `plan_simulate` `asset_search` `asset_get` `subflow_search` `model_list` `creative_read` `media_quote` `run_wait` `canvas_selection`（需画布新增）
- write：`canvas_pair` `canvas_apply_plan` `node_add` `node_edit_prompt` `canvas_connect` `patch_revert` `asset_place`
- run：`asset_import` `run_cancel` `delivery_package`
- paid：`image_submit` `video_submit` `audio_submit` `run_retry`
- 动态：`capability_invoke`（直通 `zcanvas_*`，按 `action/operation` 映射等级，守卫按映射后等级裁决）

资源 `canvas://project/{id}/graph|node|assets|asset|run`、`canvas://models/{kind}`、`canvas://wallet`（需画布新增）、`canvas://policy`；DSH **不支持** MCP prompt 模板、不支持资源订阅，且资源**不限大小**，所以服务端必须自己限长（图摘要 ≤64KiB，列表每页 ≤50）。

### 7.3 付费安全（不可妥协）

**顺序：报价/预览 → DSH 审批（第一道门）→ 画布窗口审批（唯一权威）→ 单次提交 → 只查询。**

1. 报价不是承诺：Seedance 视频按 Token，用量完成后才知道；`media_quote` 必须返回区间 + 假设（`basis=history|doc-table|none`），单价表运行时抓取、禁止硬编码；无法估算时审批文案明说"金额未知"。
2. **一份报价只能提交一次**：`*_submit` 必须带 `quoteId`；MCP 本地账本绑定 `quoteId → operationId(UUID) → intentId`；同一 `quoteId` 重复调用返回已有 intent。`operationId` 同时作为画布 RunIntent 的 `idempotencyKey`，即使 DSH 工具 60 秒超时后模型重试也不会双花。
3. **拿到 `task_id` 之后只许查询，永不重发。** `acceptance:"unknown"` 时不提供任何重发工具；`run_retry` 只允许 `failedOnly` 且需新 `quoteId` 与新审批。
4. 预算上限三层取最严：单次 `maxSpendCny`、会话/日累计（MCP 本地配置）、画布 `project_execution_policies`（今天无价格登记表时会 fail-closed）。
5. 审计：画布 `audit_events` + MCP 本地追加式 JSONL（不记录密钥与签名 URL）+ DSH 会话日志里的审批对，用同一个 `operationId` 串起来。
6. `run_wait` 的 `waitSeconds ≤ 45`，保证单次工具调用低于 DSH 默认 `toolCallTimeoutMs=60000`；`*_submit` 立即返回 `{intentId, status:"queued"}`。
7. DSH 侧守卫：`tools/pre-execute` 对 write/run/paid 返回 `ask{reason, displayReason}`（报价文案放进 reason，因为审批请求**不携带工具参数**）；`ctx.tools.guard` 做同步兜底，校验 `quoteId` 存在、未过期、未使用，只能拒绝。审批结果只有 `allowed-once | rejected | cancelled | unavailable`，**没有"本次会话一直允许"**。**不要对付费工具启用 Auto review**。`danger-full-access` 预设下 `ask` 的实际行为待实测。
8. 画布窗口未打开则 `run-start` 无人认领 → `canvas_status` 要探测并提示。视频本体不能以富结果返回（DSH 只支持图片），只回文本 + 封面图 + 画布节点链接。

### 7.4 画布仓库的保护规则（在画布仓内开发时同样约束你）

以画布 `AGENTS.md` 原文为准，要点：开工前先读 `AGENTS.md`、根 `SKILL.md`、`docs/project-context-current.md`；唯一默认开发目录 `E:\PenguinPravite\T8-penguin-canvas`，新功能先跑 `npm run worktree:check` 与 `npm run worktree:development`；**永久保护**：禁止 `reset`/`clean`/checkout 覆盖/整树复制/整树 ours-theirs，不得编辑或暂存 `tools/ffmpeg-runtime/ffmpeg.exe`（143,314,432 字节）与 `tools/remove-ai-watermarks-runtime/README.md`（2,298 字节）；不得读取 retained/historical 项目数据库，数据库测试只能建在系统临时目录并清理；版本升级、生产 build/打包、推送、tag、Release 须单独明确授权；版本号每段只用 0–9（`v2.6.9` 下一版是 `v2.7.0`）；不得重复实现已闭合项；任一保护文件漂移或目录角色不符，**停止，不扩大结论**。
**画布严格全摘要匹配**（manifest/skill/CLI/patch 协议/节点 schema/provider catalog/能力 manifest/graph/manifestDigest 必须一致，`minimumDesktopVersion 2.6.4`）→ MCP 的 `canvas_status` 必须原样回报 `compat:{ok,reasons[]}`，**不得绕过握手**；不匹配时守卫拒绝所有 write/run/paid。
**`GET /api/settings/raw` 会返回明文设置**——MCP 进程里严禁调用，日志不得含 token/签名 URL。

### 7.5 画布建议新增的接口（需 T8star 同意 C3，列入画布路线图）

B1 价格登记表 + 识别 `usage.amount` 与币种 · B2 钱包余额只读代理（密钥留后端）· B3 `canvas_selection` 只读 · B4 语义搜索暴露为 L0 能力 · B5 提示词/资源库只读检索 · B6 批准结果长轮询/事件 · B7 可选"批准会话预算"（缓解双重审批）。

### 7.6 SKILL 与 RAG

- **SKILL**：目录形态 `<name>/SKILL.md`；根优先级 100 `<项目>/.dsh/skills` … 400 `<dshHome>/skills` … 600 `bundledSkillDir`；分发首选专用 provider（`ctx.skills.registerProvider`，上游 `dsh-skill-badge` 有先例）K0，`$DSH_HOME/zhen/skills` 同步目录 K2 为退路（T-18）。"一份 SKILL.md 两边用"，画布专属字段放旁路 `catalog.json`。首批 15 个见备忘录 02 §5.3；`description` 长度上限未核实。
- **RAG**：新增通用服务 `ctx.zhenRag`（Service Definition + Provider + Tool + Web 卡片），首版词法检索；画布侧另有素材语义索引（FTS5 trigram + 多语 MiniLM-L12 384 维 + RRF），经 B4 复用；引用以 `tool.call.toolview` 的来源卡片展示。隐私分级与增量索引见备忘录 02 §6。

## 8. 待实测 / 未核实清单（依赖前必须先做并写回文档）

**Seedance（写入 `docs/seedance-compat.md`）**

| ID | 要验证什么 | 失败时的退路 |
|---|---|---|
| T-01 | 流式 `usage`；是否接受 `stream_options.include_usage` | `supportsUsageInStreaming:false` + 估算 |
| T-02 | 工具调用流 `tool_calls` 增量形状、并行、`tool_choice` | compat 开关；限制可选模型 |
| T-03 | `reasoning_content` 字段名与增量；后续 assistant 消息是否必须回传，缺失是否 400 | `requiresReasoningContentOnAssistantMessages` / `requiresThinkingAsText` / `thinkingFormat` |
| T-04 | 思考开关参数与取值；`off` 是否真的关闭 | `reasoningEfforts:false` 或按实测声明 |
| T-05 | `max_tokens` vs `max_completion_tokens`；输出上限；推理占用导致 `finish_reason: length` | 调整默认 `maxTokens` |
| T-06 | `developer`/`system` 角色处理 | `supportsDeveloperRole:false`（已设） |
| T-07 | 图片输入 data URI 还是 URL；大小/像素/数量限制 | 调 `requestImagePixelBudget` 等 |
| T-08 | `/v1/models` 是否存在 | 手写 `models` 列表 |
| T-09 | 错误体形状；重试层对 402/429/5xx 的分类 | `retryPolicy` |
| T-10 | 缓存命中用量字段 | 忽略 |
| T-11 | `role: tool` 是否要求 `name`；工具结果后是否必须跟 assistant | `requiresToolResultName`、`requiresAssistantAfterToolResult` |
| T-12 | 钱包响应各账户状态、限频、`quota` 换算、`display_type` | 只展示 `amount` |

**上游行为（A 层，写入 `docs/upstream-assumptions.md`）**

| ID | 要验证什么 |
|---|---|
| T-13 | 欢迎页门禁：只有 Seedance 凭据（环境变量）时能否进工作区；GUI 进程环境变量继承；`credentials.set` Remote 对 Web 客户端的授权 |
| T-14 / 14b | Models 页保存是否保留 seedance 路由；第二个 pi-ai 行的可行性；`ctx.configEditor` 写回 API 与权限 |
| T-15 | 已保存选择与 `agent-default-model` 的优先级（全新 vs 已用过的 profile） |
| T-16 | 逐行禁用后的启动与功能回归 |
| T-17 / 17b | 官方 Desktop 内 Plugin Manager 能否装第三方 bundle；壳内 `dsh` CLI 是否可用；余额 Remote 控制器注册方式 |
| T-18 | 根级插件 `ctx.skills.registerProvider` 注册的技能对 Web 会话可见；`customSkillDirs` 表达式是否生效 |
| T-19 | 根级注册的工具对 Web Agent 可见；`preset` patch 键是否存在 |
| T-20 | 品牌槽位占用优先级；运行时改 `document.title`；`--dsw-*` 覆盖完整度；`DSH_CLIENT_BUILD_PROFILE` 判断是否存在于已发布前端物；**locale 覆盖（已确认同 (ns, locale) 重复注册会抛错；可试新语言 id + fallback 绕行）** |
| T-21 | 出站抓包基线（官方壳层自身出站单独列明） |
| T-22 | 版本漂移后 `skippedBundles` 的用户可见表现 |
| T-29 / T-30 | 新版会话日志旧版能否读；`ctx.configEditor` 细节 |

**RAG**：T-23 `node:sqlite` + FTS5 在 Desktop 运行时可用 · T-24 中文检索（FTS5 `trigram` 对两字词召回、二元组预分词、评测集）· T-25 暴力向量检索规模/延迟阈值。
**B 层**：T-26 更新链路最小补丁面 · T-27 profile 首启初始化与预装挂载点 · T-28 许可证扫描工具选型与再分发清单。

**我没读的上游材料（可能改变结论）**：`docs/session-format-status.md`、`docs/rescope.md`、`docs/web-styling.md`、`docs/event-producer-consumer.md`、`docs/api-gateway.md`、`packages/attachment/*`、`packages/storage/storage-json`、`apps/desktop/src/{update-*,release,command-*}.ts`、`apps/desktop/packaging/README.md`、`.agents/notes/implemented/feature/2026-10-02-plugin-market-index-format.md`。画布仓库中备忘录 01 对其只是转述，没有独立核实。

## 9. UI 实现要点（M1）

- **令牌**：`reference/03-tokens.css`，共 161 个 `--dsw-*` 覆盖（A–H 节；H 节为 zhen 扩展，如 `--dsw-alias-zhen-tide-from/to/glow/secondary`、`--dsw-zhen-duration-*`，上游不存在，需新增或经 `overrideTokens` 注入）。重新生成用 `reference/scripts/gen_css.py`（输出路径需改）。
- **接入方式**：覆盖层（推荐）——新建客户端插件，`ctx.theme.overrideTokens('dsh-zhen', …)` + `ctx.effect` 注入 `<style>`；已注册主题**不会**进"外观"设置行，所以用 `overrideTokens` 做默认皮肤。
- **级联六条**（违反即失效）：① 变量声明在 `body` 与 `body[data-ds-dark-theme]`（不是 `:root`），两个选择器都要给，样式表要在上游之后；② macOS 菜单填充在 `html[data-platform='darwin'] body`，需同级覆盖；③ `--dsw-elevation-*` 在 `body, body *` 逐元素重声明，行内覆盖无效，必须走样式表且用相同选择器；④ 已注册主题不写入外观设置行；⑤ **不要**全局设置 `--dsw-focus-ring-color`；⑥ 圆角阶梯 4/8/12/16/20/28 与 `superellipse(1.5)` 不改。
- **新增面板**：技能库/知识库/画布联动用 `sidebar.panellist`（list）+ `main`（keyed）成对；画布联动也可作右栏 tab（`ctx.sidebarRightTabs.register`，最小宽 360px）；工具卡用 `tool.call.toolview`（键 = 线上工具名）；审批内容用 `conversation.approval.detail`；引导用 `settings.onboarding`；市场用 `plugins.tab`。槽位名以各包 `contract/slots.ts` 为准，C6 守着。
- **S1–S8**（上游源码小补丁，纯插件做不到的部分）：S1 首帧底色常量（≤10 行）· S2 Hero 美术槽 `conversation.hero.art`（≤30 行+CSS）· S3 助手头像槽（≤40 行）· S4 Hero 文案（≤6 行）· S5 外壳资源（标题/favicon/manifest/桌面图标/安装器）· S6 硬编码色改 alias（每处 ≤5 行，可选）· S7 `/` 菜单富行（≤60 行）· S8 引导步骤条件化（≤10 行，触发条件未核实）。**D1/U2 拍板前不要打。**
- **美术槽位 A01–A12 与 6 个 Agent 状态**见备忘录 03 §3 与设计稿第 11 屏；状态机优先级 `error > awaiting-approval > tool-running > thinking > success > idle`，每个状态最短显示 300ms；状态不得只靠颜色或动效传达。
- **必须目测验证**（原型阶段）：暗色 `label-deep-diving-shimmer` 混入上游 `blue-300` 的观感；暗色发送钮（对 Composer 仅 3.17:1）是否够醒目；Hero 三种模式的宽度阈值（≥1280 舞台 / 900–1279 探头 / <900 仅标记，均为提案值）；28px 下 6 个状态 chip 的可辨识度（灰度也要看）；4 种底色（`#F4F9FA`、`#FFFFFF`、`#0A1418`、`#14242A`）上的抽象图形边缘。
- **品牌清理**：Web 标题 "DSH Local Build"、`manifest.webmanifest` 的 "DeepSeek Harness"、`favicon*.svg`、桌面图标与托盘、安装器横幅/卸载侧图/欢迎页品牌图（BMP 无 alpha，须预合成到安装器底色）全部是官方品牌美术，**必须替换**（S5/O2）。

## 10. 完成定义与汇报格式

- 一个任务算完成，必须同时满足：验收条款逐条过；对应契约测试在 CI 通过；新增的上游假设已写进 `docs/upstream-assumptions.md`；偏离本方案处有 `docs/decisions/NNNN-*.md`；没有密钥、会话全文或明文设置出现在日志/提交里。
- 汇报分三栏：**已验证**（附命令或抓包）/ **待验证**（附缺什么条件）/ **未验证**（附原因）。不要把推断写成事实。
- 遇到需要 T8star 拍板的事（`00-…` §5），做完准备工作后停下，把决策与选项列清楚，不要替他选。
