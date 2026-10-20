# 0028 · 任务中心读取画布已有运行

2026-10-20。DSH扩展层实现，不新增或修改Canvas源码/数据库schema。

任务中心现在可切换网关任务与画布任务。选择原生可用画布后，直接读取
`GET /run-intents?projectId=...&canvasId=...`，查看当前配对身份拥有的运行；
切换创作方案前提交的任务也可从原生列表找回。原生接口最多返回100项，
界面明确显示上限；还可粘贴已知任务引用，按原项目/画布读取同一任务详情。
没有建立第二份任务/付费账本，不改当前run引用或原生任务，不新增Agent工具。

每次请求复用原CLI握手、secureStore和原生session；请求前后复核完整CLI
摘要、连接配置、令牌、配对身份与有效期。所有结果须符合所选项目、画布及
当前actor；同一列表出现重复ID、越界、错配或断线变化时拒绝该结果。
任务查询只需run:read，不申请run:execute，不调用Provider凭据。

列表展示原生状态，completed只表示画布标记完成。选中后另读原任务的
completionVerified/artifactVerification，核对运行引用与画布版本、全部请求
节点、成功尝试、输出资产及落盘/散列/格式/归属证据。原生true标记与结构
矛盾、缺失、重复资产关联或未完成时，不展示“产物核验通过”。未知状态保留
为未知。前端只接收固定字段和计数/原因类别，不暴露原始错误、素材URL、
pollSecret或原因文本中的后缀；模型/服务标签也拒绝URL/凭据样式内容。

证据最多500节点、5000产物记录与总输出引用；按引用建集合校验，避免逐项
嵌套扫描。原CLI的256KiB响应上限保留，超过时拒绝，不提高上限或截断后
声称通过。界面是手动刷新，不对选中任务重复提交、重试或取消。

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| 9个DSH专项：只读多任务、状态/完整与矛盾证据、权限归属、秘密投影、重复/100项上限、连接/关闭竞态、总引用边界及500产物记录 | 新任务切换/筛选/已知ID查询的实际浅深、窄屏、键盘/读屏 | 单测完成证据由合成响应构造，不代表真实Provider产物核验 |
| C30：实际published Host/Remote/ToolRuntime/MCP stdio、原生auth/store HTTP；十个Agent工具不变，Provider解析/意图变更0 | 真实窗口、用户画布和多任务长期使用 | 不冒充整个Canvas测试全绿、真实收费、结果下载或结算 |
| 独立Native工作源码/全新TEMP SQLite：原生已有RunIntent列表1项、详情not-completed/产物0；原生六条结构与单次提交/GET恢复继续通过 | 原生completed实际产物端到端，与更大任务量/其他客户端 | 窗口仅IPC测试模拟，运行消费者未启动；出站0，用户历史库未读 |

Native验证记录DSH入口摘要58b981d49bd6adb01acf1b99306424608853bb4814108e03449051a35d27b254，
测试期间会再次核对未发生变化；75原生模块闭包仍c335d9…83e8。Source CLI仍
fae0…ec9，Canvas安装版和源码本批未改。整体目标继续active。

证据：`.runtime/task-history-unit.log`（9 units+C30）、
`native-canvas-task-list-console.log`、`evidence/native-canvas-run-intent.json`。
首次2500资产完整响应触发原CLI的256KiB上限；保留失败日志，改用500项验证
边界内成功，大于总引用限制另行验证失败，没有放宽原生传输门。


最终245项DSH完整检查通过，已知引用查询按钮补齐后另跑build/type通过；114文件本地包dsh-zhen-0.1.0-3874c7f19567f13d.tgz，SHA 3874c7f19567f13df56edab10bf92b4190ededa1a7ff0c494fc90c026df23fa9。官方CLI临时安装/18路由/Flash默认/指定上报关闭/Host回环与清理过；开发预览也经官方CLI换包，入口SHA 58b981d49bd6adb01acf1b99306424608853bb4814108e03449051a35d27b254与Native验证所测入口一致。当前Host15088/launcher6676/exec1844在127.0.0.1:5180；旧16420/2072先核对lease/命令/父子/socket，经原终端停止、退出/端口释放再换包；遗留lease由原启动器复核死亡PID后回收。真实应用状态本轮未重探，不把先前APP_NOT_RUNNING当新证据；真实窗口/浏览器/Provider收费仍未验，未公开发布。
