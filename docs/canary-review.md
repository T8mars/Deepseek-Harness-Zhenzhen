# 0.1.0-canary.1 审阅材料

这是首次候选发布前的准备分支。项目仍为DSH-zhen，基于已发布的DSH SDK扩展；不合并或改写上游源码。

| 项目 | 当前证据 |
| --- | --- |
| 基础 | dev100，6d22f6abfa3564896565b6abc593d18d3287648d；基础CI/W4/W5预览均已核 |
| 候选版本 | 0.1.0-canary.1，SDK精确0.2.1-rc.3 |
| 归档 | dsh-zhen-0.1.0-canary.1-78d4cc777ea97304.tgz，234文件 |
| SHA256 | 78d4cc777ea973048219ce6c68d41ec110ff63e9ee8555c08152771ffcac5d11 |
| 载荷变化 | 仅package.json版本；其他233文件和全部模式相同 |
| 本地检查 | 完整1468/1468；正式公开CLI安装/Host停止/卸载基线恢复 |
| 同配置切换 | EXAMPLE旧版→候选→旧版，每次234文件及192行设置投影一致 |
| 当前发布状态 | 尚未发布产品Canary；候选精确远端CI待核 |

审阅时先看[准备决定](decisions/0130-canary-candidate-preparation.md)中的验证边界，再看[分发流程](release-distribution.md)与[稳定晋升](stable-promotion.md)。同配置演练只使用合成项目，不代表真实用户会话或数据库降级已验收。

正式Canary须先使main包含真实候选包版本并通过精确CI，再显式运行release.yml：channel=canary、tag=v0.1.0-canary.1、publish=true。发布器会重新构建、上传只含构建载荷的不可变Git快照、在隔离任务安装精确快照，回读资产后才公开候选和索引。它不会把本次本地预览当作原始发行证据。

后续需固定候选的七个完整UTC日W6成功记录；本机API凭据未上传，自动收费检查未开启。确认发布和决定CI凭据存储是不同事项。画布仍由其自己的Agent维护，真人窗口批准与真实作品闭环另行验收。
