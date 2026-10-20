# 0046 · Windows检出保留夹具原始字节

2026-10-20。仓库公开后，Actions39431747258首次实际执行完整检查，334项中
333项通过。唯一失败为`native approval fixture retains exact committed
source and MIT notice`，触发的是既有原始字节SHA校验，不是审批业务失败。
安装与私有文件门已通过，后续打包/换装因检查失败未执行。

两份DSH内的固定历史夹具`contracts/fixtures/canvas-approval/approvals.cjs`
及LICENSE在Git对象中和本机都是原始LF；Windows runner的core.autocrlf
把它们检出为CRLF，导致字节摘要变化。新增C46在独立临时Git仓库使用真实
add/checkout-index、core.autocrlf=true复现：原属性规则下校验失败，新规则
下两文件均保持原始摘要。测试先红后绿，没有通过文字归一或改写期望值掩盖。

只在自有.gitattributes中给这两条精确路径加-text。没有修改夹具内容、来源
清单、原始SHA、MIT声明或既有校验器，也没有修改真实画布仓库、配置和安装版。
它们仍是固定历史源码的隔离测试材料，不能当作当前画布窗口或业务验收。
Windows启动cmd原有CRLF规则及原补丁字节保留规则继续有效。

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| C46真实Git先红后绿；定向16/16、完整335/335通过；两份Git对象和本机字节匹配原清单，TEMP清理 | 修正后的公开CI运行 | 第一次公开CI确实失败，不能写成绿色或未启动 |
| 原有画布审批工作流定向回归通过 | 公开远端引用与产物审查 | 此修正不是画布窗口、付费执行或生产安装验收 |
| 没有运行字节或配置变更；本机Host保持 | 后续RAG格式支持与完整创作流程 | PDF/OCR/向量未实现；先前调研不构成支持声明 |

复现：`node --test contracts/fixture-byte-checkout.test.mjs`。它仅在系统TEMP
创建示例Git仓库，不修改实际工作树、索引、Git配置或任何画布目录。新测试
由完整契约集及Windows CI运行；原始校验继续逐字节执行。

来源证据：[首次公开CI](https://github.com/T8mars/Deepseek-Harness-Zhenzhen/actions/runs/39431747258)。
该运行在npm run check结束，pack与smoke步骤未运行；本修复的新运行另行核对。

完整npm run check335/335通过，125文件包SHA保持
9af31c6167b91b1a21a7ffd6a2da5fd2d301d2f53c37be56e355f8193928c8ab。
运行JS、客户端、配置及技能目录未改变，未重新换装或停机。正常快进备份
v0.1.0-dev.18后核对新CI；不要重跑旧失败提交来代替新提交的验证。

后续核实：dev18的[Windows运行39433495391](https://github.com/T8mars/Deepseek-Harness-Zhenzhen/actions/runs/39433495391)
实际335/335、125文件打包及官方CLI临时安装/Host启动全部成功。远端完整包与
本机包SHA不同，Host/客户端/技能目录相同、补丁原始字节不同；未逐文件审查
全部差异，不能据此声称跨环境完整包一致。本段随0047实际功能更新同步。
