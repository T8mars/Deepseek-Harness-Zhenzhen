# 0045 · 公开仓库与应用匿名读取

2026-10-20。负责人报告已将DSH仓库改为public。GitHub仓库API和实际无凭据
HTTPS均确认visibility=public、private=false、默认分支main。本Agent没有
修改GitHub可见性。根roadmap.md、skill.md、AGENTS.md、anents.md及创作资料
继续排除于索引、全部提交历史、包与公开产物，不因仓库公开而放宽。

应用的固定来源读取原本支持匿名，故无需添加运行时分支或要求用户保存令牌。
私有来源的可选凭据入口保留；只有用户自行配置后才走对应的GitHub API通道。
此前待保存只读凭据的问题已由公开仓库解决，不能据此宣称Bearer实测通过。

新增`scripts/smoke-skill-public-host.mjs`，使用自有生产ZhenService、已发布
SkillRegistry/ToolRuntime及原生skill工具，直接执行应用的marketFeedCheck。
三个独立Node进程使用同一TEMP示例profile，验证1.0.0保持/1.0.1自动队列、
1.0.1启动生效并手动选回退、1.0.0启动回退且自动暂停；个人正文、停用和
未安装技能保持。后两个进程只用已核验缓存，实际HTTP请求数为零。

本次没有替换globalThis.fetch，没有构造Response适配器，也不使用gh CLI读取
技能正文。仅通过Node诊断通道观察请求方法、固定来源、路径与是否存在
Authorization，不记录请求正文或任何令牌。共6次真实匿名HTTPS：仓库状态1次，
旧feed1次，两轮main提交与固定提交feed共4次。原生凭据接口只提供隔离的
未配置元数据，resolve调用0次。TEMP数据与进程成功清理。

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| 真实匿名HTTPS与应用生产Host服务读取；三进程更新/回退及个人选择保持；严格Remote结果codec及完整334项通过 | 公开后的远端备份与CI | 此为隔离Host服务，非用户浏览器操作或物理WebSocket验收 |
| 固定提交3411be420da0bdc92c88fddfea2caf0aca306ce1→88fbc0527d4629910a33a30e9a479622eb39ec95，源码feed是真实发布数据 | 公开后新一次GitHub Actions是否能运行 | 可选私有Bearer仍未验；公开读取不需要它 |
| 无模型/付费/Native写入，不改变真实profile技能信任或源码自动更新策略 | 后续RAG格式扩展与真实创作 | PDF/OCR/向量、真实模型质量与画布窗口配对仍未完成 |

复现：`node scripts/smoke-skill-public-host.mjs --baseline <旧40位提交> --expected-commit <main40位提交> --out-name <新证据名.json>`。
固定第一方来源、拒绝覆盖证据；失败时保留独立TEMP目录供检查。该脚本不自动
授予用户profile权限，也不会将此示例的信任偏好复制到用户profile。

RAG格式调研已查阅PDF.js6.4.299官方API、包完整性及附带许可；本轮因负责人
报告公开仓库而先完成直接匿名读取。没有安装PDF依赖、修改解析器或声称已
支持PDF。原有10问/80%首版参考基线与8/10结果保持。

来源：[GitHub仓库API](https://api.github.com/repos/T8mars/Deepseek-Harness-Zhenzhen)。
公开状态为本轮现场读取，历史决策中的私有状态仍作为当时快照保留。

本地完整check334/334通过。125文件包SHA仍为
9af31c6167b91b1a21a7ffd6a2da5fd2d301d2f53c37be56e355f8193928c8ab，
与0044完全相同。实际自有Host/launcher/回环端口仍活跃，公开CLI重新核对
Host/client/patch/技能目录摘要；美术与Canvas配置保持。因运行字节相同，
没有重复换装、重启或改变真实profile设置。检查点v0.1.0-dev.17保留公开
来源验证与说明更新；远端引用、全历史树及产物继续检查，CI以新运行结果为准。
