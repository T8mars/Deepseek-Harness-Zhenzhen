# 上游候选升级

本项目通过精确版本的已发布 DSH 包组合，不合并上游分支。当前仍使用
`dsh-v0.2.1-rc.2`；候选准备不会修改用户已安装的程序或数据。

## 自动流程

`upstream-watch.yml` 每天检查一次，也可手动运行。工作流现已随开发检查点
推送到仓库。GitHub Actions 的首次检查因账号付款/支出额度而未启动，
因此不能称为远端验证成功；尚未创建真实上游升级 PR。

1. 只读任务先验证现有版本，再读取 npm `next`、对应 `dsh-v*` 标签和发布
   提交。所有直接引用的 DSH 包必须具有精确版本、官方仓库、固定 npm URL
   和 SHA-512 摘要；独立依赖的覆盖版本也必须满足新包声明。
2. 在没有本地研究文件的干净检出中，仅准备本项目的依赖 pin、引擎版本、
   上游锁及纯文字技能兼容版本列表。不会改动上游源码。
3. 无安装脚本地生成锁文件、安装候选并检查指南与配置变化。升级指南按
   路径/blob 摘要比较；默认 Web 模板按行名、配置字段及默认值摘要比较。
   模板由官方 CLI 在一次性临时目录创建，不读取真实 profile、凭据或会话。
4. 运行契约、类型与构建检查，再在另一临时 profile 安装打包产物并检查
   默认路由、指定上报关闭和 Host 启动。
5. 只上传一个有大小上限的 JSON 提议。另一个全新任务持有 PR 写权限，
   不安装依赖、不执行候选代码，只接受固定文件清单和可核对的 pin 变化。
   源码、脚本、未知路径、私有根文件、非注册表锁来源和版本回退均被拒绝。

检查失败时，只导出完整可核验的候选或纯发现信息，不能提交半套依赖修改。
未完成检查的提议创建为草稿；即使通过，也没有自动合并、安装或发布步骤。
相同基础提交、内容和验证结果对应同一候选分支，避免重复 PR。

## 本机命令

```powershell
# 只读发现；写入忽略的诊断计划，不改变版本
node scripts/prepare-upstream.mjs

# 初次记录当前已钉版本的公开模板/指南；现有记录发生变化时拒绝覆盖
node scripts/prepare-upstream.mjs --baseline
```

`--apply` 仅用于单独、干净的候选检出。它拒绝包含根本地研究文件的工作
目录，准备后仍须安装依赖、审阅变化并运行检查，不应用到开发中的 profile。

## 审阅变化

`UPSTREAM.prepared.json` 保留旧观察值、指南差异、配置差异和待审项目。
观察值不是批准记录；不能删除变化来让检查通过。每条审阅放在
`contracts/ack/*.json`，绑定实际目标提交和摘要，例如：

```json
{
  "targetCommit": "0000000000000000000000000000000000000000",
  "type": "guide",
  "id": "docs/upgrade-guide/v0.0.0/EXAMPLE_ONLY/guide.md",
  "digest": "0000000000000000000000000000000000000000",
  "decision": "not-applicable",
  "rationale": "EXAMPLE ONLY: replace this with the concrete inspected reason and evidence."
}
```

配置记录的 `type` 为 `profile`，`id` 为行 id，`digest` 是对应差异的非空
`after` 或 `before`。决策仅接受 `handled` 或 `not-applicable`，理由至少
20 字符。改版本、提交或内容后，旧审阅不再适用。被覆盖的上游行消失时，
仍必须修复自有 bundle 与契约；审阅不能免除这项检查。

```powershell
node scripts/validate-upstream.mjs
npm run check
npm run pack:bundle
npm run smoke:install
```

如果新上游要求改动自有插件代码，在候选分支手工完成并审查这些改动。
自动提议发布器只支持 pin 变化，不会携带任意源码补丁绕过审查。
纯文字技能的旧版本元数据和个人副本继续保留；兼容列表增加新 Host 不代表
允许可执行技能、权限扩张、数据降级或未经审阅的自动激活。

## 本机启动与晋升边界

启动器先独占回环端口，再取得本机进程锁，才可能调用官方 CLI 安装。
旧 Host 仍监听、另一启动器持锁或锁记录异常时，安装前退出。确认原进程
已退出且端口空闲后，可回收旧锁。程序保持父进程锁直到 Host 结束；该
机制不能协调用户绕过启动器直接运行的 DSH CLI。

本地同版本 tarball 更新使用官方 CLI 转发的 `--force --ignore-scripts`，
只在服务停止后执行。可在临时配置验证确实替换了旧入口字节：

```powershell
npm run smoke:install -- --replacement-from dsh-zhen-0.1.0-EXAMPLE_ONLY.tgz
```

将例子换成 `.runtime/packages/` 内已有、摘要匹配的旧产物文件名。
检查不会重新安装正在运行的开发服务。

新上游真实版本的迁移、受控网关验证、canary 观察及正式晋升仍待完成。
候选不会触碰会话格式、凭据布局、Desktop 更新器或画布数据。生产备份、
数据兼容和签名更新必须按实际迁移与分发方案另行验证；测试中的兼容版本
扩展不能证明真实新上游已兼容。
