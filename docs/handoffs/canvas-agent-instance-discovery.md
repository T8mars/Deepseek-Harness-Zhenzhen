# 画布 Agent 交接 · 实例发现与已安装 CLI 更新

2026-10-21。用户现场只读诊断；DSH Agent 未修改画布源码、安装版、配置、CLI 或实例目录。

后续用户已改用真实桌面画布，当前原因是源码CLI与安装版摘要错配，见
[0054最新交接](canvas-agent-installed-cli-compat.md)。以下保留之前的现场，不当作当前进程状态。

此前问题：用户已在DSH审阅并改选源码CLI，公开状态OK；点击配对已得到验证码，
但当前Chrome画布页没有审批弹窗。原生`src/components/AgentControlPairingModal.tsx`
的`refresh`及挂载effect均在缺少`window.t8pc?.agentControl`时直接返回，
`electron/preload.cjs`才提供`listPendingPairings`/`approvePairing`等IPC桥。
`App.tsx`虽挂载弹窗，普通浏览器没有这个桌面桥；任务审批弹窗也依赖相同桥。
只读进程观察未发现Electron进程有主窗口。不要让用户反复发起或填写实例ID。
请提供与当前后端/数据库配套的Electron窗口入口，避免再起不配套的后台或抢占端口；
并明确浏览器模式的审批能力边界，在现有界面给可操作提示。若决定支持浏览器审批，
先审阅现有管理权限/本机信任链，仍复用原控制器和窗口明确核对，不公开管理密钥、
不让DSH代批准、不绕过原生审批权威。不能把普通公开状态HTTP200当作审批可用。

1. **现场结果**：浏览器画布3.3.7正常，后端公开`/api/status`及
   `/api/agent-control/v1/status`均HTTP200。当前DSH选择的
   `%LOCALAPPDATA%/ZhenzhenCanvas/Agent/runtime/0.1.0-dev`是旧CLI，完整摘要
   `e17fa8cb7059a666028bfa2078b06c650425e67730fe504d8d3d9540774d0867`。
   其`discovery.cjs`在读取和验证心跳前截取前256个文件。首次观测实例目录1014条，
   活跃文件位于第814条；直接使用该CLI的公开校验/探针确认描述符有效、心跳约1.6秒、
   公开状态匹配，但正常发现结果为0。填写实例ID同样经过这段发现流程，不能解决。
   后端随后在本Agent未操作的情况下换了进程；新随机ID位于前256条中，发现结果变为1，
   说明重启可能偶然掩盖问题，不能作为修复。
2. **已有修正与另一个阻塞**：源码`tools/zcanvas-cli/src/discovery.cjs`已采用
   有界条目/字节扫描、按mtime优先、JSON心跳校验，旧记录不消耗有效描述符名额；
   请先核对这份已有实现，不重复叠加旧补丁。源码CLI完整摘要
   `8a474a98bf33797018df9fe7fa9126ca55891100e64c87f91885bfc65b81b110`。
   用户选中的已安装旧CLI即使发现新实例，其原生`assertCompatibleInstance`
   仍返回`NODE_SCHEMA_DIGEST_MISMATCH`。DSH公开状态OK只表示控制面响应，
   不等于配对或业务握手成功。已指导用户审阅并改选源码CLI；没有自动提高信任pin。
3. **请画布Agent处理**：检查“安装/修复Agent工具”如何刷新同版本号的资源内容，
   确保运行画布与导出的CLI/schema/能力清单逐项一致；版本号目前均为0.1.0-dev，
   不能仅凭目录已存在或版本字符串相同就跳过更新。查旧实例残留的来源，审阅正常退出、
   异常退出及测试隔离；本次只证明残留存在，未认定由哪条退出或测试路径产生。
   不要求DSH清空实例目录，也不要删除仍存活或身份不明确的实例。
4. **验收与证据**：在全新系统TEMP实例目录放置超过256条过期/损坏记录及一个活跃实例，
   活跃文件名排在旧读取窗口之后，确认可发现；覆盖同版本旧CLI替换、原生精确兼容握手、
   正常退出清理、损坏/链接/目录/字节上限、多实例选择和既有审批链路。
   测试不使用真实用户或retained/historical数据库。DSH本机证据在忽略的
   `.runtime/evidence/canvas-status-probe-0052.json`、`canvas-discovery-limit-0052.json`、
   `canvas-reviewed-compat-0052.json`及`canvas-live-discovery-0052.json`；后几份为最新观测，
   首次1014条/第814条的结果另见本次执行记录，后端变化后不能冒充仍处于首次状态。
   未配对、未读项目或素材、未调用模型/付费工具。
5. **授权边界**：按画布自己的AGENTS/SKILL先核对上下文与工作树。本文只交接问题及
   本地修复验收，不授权生产构建、版本升级、推送、Tag、Release或付费操作。
   请反馈当前CLI摘要、更新入口是否替换成功及真实画布窗口能否收到最小读取权限配对。
