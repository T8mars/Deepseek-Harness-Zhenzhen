# 0070 · 新克隆构建后的源码状态

2026-10-21。0069本机、main CI39537996004和W4默认预览39538106897都通过486项，
归档与实际安装一致，默认发布任务正确跳过；但预览如实报告sourceDirty:true。
正式canary会被现有clean门禁拦住，因此没有将它写成正式发布已经可用。

两个独立GitHub main干净克隆均复现：npm ci后干净，npm build后仅
market/skills.v1.json显示M。第二份记录确认autocrlf=true、filemode=false，
检出文件含246处CRLF，生成后LF与Git blob逐字节相同，JSON也相同；git diff
numstat为空。首次status仍返回修改，而后续diff可能刷新转换状态，容易掩盖。

仅为这份已知的生成文本增加`text eol=lf`规则，避免检出与构建来回转换。
未改索引内容、构建器、发布器、clean门禁或上游；不做全树renormalize、回滚
生成文件、忽略修改或临时git diff刷新来让检查变绿。原始状态/摘要/失败日志保留。

C75使用真实Git提交与autocrlf克隆，再执行生产buildSkillCatalog。旧规则下
第一次status失败，新增规则后第一次status直接干净，公共feed保持LF。测试
不先运行git diff，防止刷新索引状态后产生假通过；只使用自建TEMP并核边界清理。

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| 两次完整真实克隆定位；C75先红后绿 | 完整检查、同包、当前CI及干净默认发布预览 | 真canary发布/Pages部署、W5晋升/七日观察、真人Native窗口作品 |

本次不改应用代码，实际DSH仍0069的Host43448/launcher45960/exec6076。包字节
另核对后决定是否需要换装，不能仅据规则修改推定同包。模型和Native写入均无。

命令：`node --test contracts/generated-feed-clean.test.mjs`、`npm run check`、
`npm run pack:bundle`。最终完整487/487通过，152文件归档SHA256`a0f861ccb800f0e09908cc3e3c6a1295286d1b39c7dbe964e26eef5b9d769443`
与0069实际安装包相同，未重装或重启。当前提交的CI与首次status干净的默认
预览须再核对，不拿旧sourceDirty=true预览当作修复结果。
