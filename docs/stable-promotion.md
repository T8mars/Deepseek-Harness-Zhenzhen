> 0137：草稿候选同步dev107首启连接入口，保留0.1.0-canary.1及旧dev106验证记录。新1487/236归档、公开CLI与同配置往返及精确CI分别验证，尚未发布。负责人先界面/画布验收。见 docs/decisions/0137-canary-dev107-sync.md。

> 0135：草稿0.1.0-canary.1同步dev105，完整1482/1482、235文件归档与main仅manifest版本不同；公开CLI正常Host安装/停止/卸载及同EXAMPLE配置main→候选→main通过，194行设置和合成文件保持。新精确CI及真实画布另验，负责人先验收，未正式发布。见 docs/decisions/0135-canary-dev105-sync.md 与 docs/canary-review.md。

> 0132：草稿0.1.0-canary.1同步dev102，完整1472/1472、234归档与main仅manifest版本不同；公开CLI正常Host安装/停止/卸载与同EXAMPLE配置main→候选→main通过。新精确CI、真实UI/画布及正式发布仍待验，负责人选择先完成验收。见 docs/decisions/0132-canary-dev102-sync.md 与 docs/canary-review.md。

> 0129：包含完整契约检查的build任务限时为45分钟，替代旧20分钟。依据精确全绿Windows检查实测26分7秒；未缩减测试、改变权限或自动开启发布。具体证据及未验证项见 `decisions/0129-distribution-build-budget.md`。

# 稳定版晋升

`promote.yml`默认只预览，没有计划发布任务。手动运行可选择固定的已发布
`canary_tag`；留空选择规范候选账本中的最新候选。`publish`默认false。
只有显式启用且全部门槛通过，才会进入写入任务。

准备任务检查当前main，运行完整检查、打包和临时安装；从实际安装的SDK公开
CLI读取全新模板，核对基线摘要。它不会读取现用profile、会话或凭据布局，
不会上传本机API令牌或调用模型。预览只输出公开的源码/候选身份和缺失项。

晋升需要同时满足：

- 候选已由W4正式发布，规范账本、四份原资产、Git来源/快照和原安装证明一致。
- 稳定源码包是候选的基础版本；完整payload/SDK一致，只允许manifest版本变化。
- 最新的先行W3已成功，其来源属于当前源码历史且精确SDK/peers/配置契约一致。
- 指南及模板变更从前后基线重算，每项有目标提交、摘要、决定及具体理由。
- 连续七个完整UTC日的W6成功，使用固定候选及首次attempt；所有相关状态均读取，
  缺天、失败、在途、重跑、过期、原ZIP或来源漂移都拒绝，当日回归也阻断。
- 独立任务重新构建同一归档，经公开CLI安装精确Git快照并恢复临时安装基线。

首次SDK适用性审阅不能用`observationsOnly:true`代替。需要跟踪
`contracts/upstream-bootstrap-review.json`：schemaVersion1、精确target、规范基线
SHA256，以及指向C6组合审阅、模板事实摘要和具体理由的profileReview。
每篇指南还需`contracts/ack/*.json`，格式沿用上游升级审阅记录。
当前42篇指南的逐项技术判断和190行发行模板审阅已记录，见[首次审阅](upstream-bootstrap-review.md)。这解除对应的来源审阅缺项，不代替实际候选、W3或七日证据。
后续真实升级使用`UPSTREAM.prepared.json`及前后差异记录，不捏造一次初始升级。

写入任务重读原始服务器证据，不执行SDK/候选代码。稳定发行版包含五份资产：
精确tgz、compat.json、provenance.json、promotion.json、SHA256SUMS。
全部回读正确后才公开，再更新保留历史的稳定/Canary索引；main漂移、版本冲突
和降级均拒绝。Pages仍由`DISTRIBUTION_PAGES_ENABLED`独立控制。

未知写入结果先检查远端，不自动重发。重跑原run可继续完全相同的draft；
原运行证明须重新核验，原资产不得替换。已经公开却缺少资产时，流程拒绝
追加。需要新内容时创建新版本，并重新进行候选观察。

默认缺项预览的`blocked`只是该候选不可发布，不表示本地应用停止工作。
当前未实际发布Canary或稳定版；EXAMPLE测试不是真实七日记录。
