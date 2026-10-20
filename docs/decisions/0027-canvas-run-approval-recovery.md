# 0027 · 画布运行计划、双门审批与原任务恢复

2026-10-20。状态：代码与隔离验证完成；真实窗口/Provider/新UI待验。

连接页新增运行节点选择、原生运行计划预览、人工确认与窗口审批。默认配对
仍只有三项读取权限；run:execute是独立显式选择并由原生窗口授予。Agent仍
十个检查/规划工具，没有审批、生成提交或重试工具，不启用付费Auto review。

预览列出原生扩展后的全部执行节点、服务和模型。原生计划没有价格，界面
明确显示费用未知，要求单独知晓可能收费；没有把null变成0或费用上限。
提交的是原生RunIntent，沿用Run→NodeRun→Attempt→Provider权威链，
accepted展示“等待画布调度”，completed仅“画布标记完成”，不冒认产物验收。

自有canvas-run.json schema1仅保存单份当前计划/审批/意图引用与进度，
读写上限256KiB；原生pollSecret仅经原secureStore，Remote不暴露。请求审批
和完成前先保存状态，断线或中断转unknown。审批创建回执丢失可经同会话GET
恢复；完成请求一旦可能发送，之后只按确定operationId查询，不重发。404
不证明未受理；保持unknown，不提供重新提交路径。审批TTL不延长原计划TTL。

画布旧控制面没有这些保证，DSH核对runControl协议与三项能力，缺失即拒绝
创建运行计划。本批在canonical Canvas开发树补上单计划操作绑定、调用者/
过期/原生权威校验、账本键冲突拒绝与同作用域查询；未修改安装版或生产版本。
原生运行账本仍是唯一执行权威，没有新建付费账本或绕过窗口。

同时修复canvas_task_status与canvas_creator_session缺少原生必需项目/画布
查询参数的问题：两个MCP读取工具现在要求明确scope，原路径仍只读。

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| 11项DSH单测：双确认/原生等待拒绝/并发/权限/断线恢复/未知404/作用域/过期/机密边界 | 新UI浅深、窄屏、键盘及实际窗口工作流 | 合成夹具计划及账本不代表原生业务；C29另验证真实published Host/Remote/ToolRuntime/MCP stdio |
| 原生审批与运行服务20项专项；真实Native路由/创作/Patch及TEMP SQLite六条结构流程仍通过 | 原生运行消费者调度、Provider实网、结果与费用 | 真实原生窗口仅IPC模拟；Provider出站被禁用，没有真实收费 |
| 新模式verify:canvas-native --include-run-intent：1条实际RunIntent、两种丢回执GET恢复、重开引用、MCP原任务/错误scope读取；其他运行表0，Provider解析/出站0 | 多任务引用列表、Host之外的客户端、旧版上线迁移 | 未读用户历史库，未提交/推送、Canvas升级/生产构建/打包 |

原生75模块闭包摘要c335d9f6fd5736592f82a63d0341c4fc36ab951ec8ce2de22b89f21cfce883e8，
Source CLI仍fae0…ec9。原始已提交夹具未改；新审批恢复夹具明确标记未发布
工作源码快照，保留MIT和逐文件摘要。首次验证计数器误计其他结构审批导致
13≠2，修正只计run.start后通过，失败日志保留。

证据：`.runtime/run-unit-current.log`、`c29-current.log`、
`native-run-recovery-current.log`、`evidence/native-canvas-run-intent.json`。


完整DSH检查235项通过，build/type/private guard过。110文件本地包dsh-zhen-0.1.0-226d44b4ca1b5f43.tgz，SHA-256 226d44b4ca1b5f43a82fb6a7dbe32b6a51f24b21ba6d9a94b846d7911cd2606d；官方CLI临时安装、18路由/Flash默认/指定上报关闭/Host回环/清理验证通过。开发预览已通过官方CLI换包，入口SHA 77ca6785fc653a6523a91a2d31c5e6492e1d6dbacf29521039f4fde5c41ea5d8；当前Host16420/launcher2072/exec52043在127.0.0.1:5180。旧20652/25764先核对lease/父子/命令/套接字，再经原终端停止并核对退出/端口释放；Windows中断遗留旧lease由原启动器在保留端口、复核PID死亡和相同记录后回收。没有浏览器/真实窗口/付费验证。
