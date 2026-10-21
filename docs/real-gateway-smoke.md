# 受控的真实网关检查

`real-gateway-smoke.yml` 是独立于 PR 的 W6 检查。每次只发送一条固定文本：
`DSH-zhen automated connectivity check. Reply only OK.`，默认 Flash，输出最多
512 tokens，45秒超时，不带会话、文件、附件或工具。可能产生网关费用。
正常停止且正文为 `OK` 才通过；触顶、空答、错误或未知中断不算通过。

## GitHub 设置

- 仅本仓库 main 的手动运行或计划运行可进入检查；手动输入
  `confirm_paid_check` 默认关闭，计划需变量 `REAL_GATEWAY_SMOKE_ENABLED=true`。
- 维护者自行在 Actions secrets 设置限额的 `SEEDANCE_API_KEY`。本机已保存的
  凭据不会被上传为 GitHub secret。本 Agent 未配置仓库凭据或打开自动收费。
- 此提交最新的 main push 完整检查必须成功，才安装无脚本依赖、构建并进入
  付费步骤。凭据仅在该步骤提供；进入脚本后先从进程环境移除，再通过官方
  `ctx.credentials` 写入一次性 TEMP 凭据服务，由已发布 PiAi 适配器读取。
- 报告仅保留提交、脚本摘要、状态、请求数和原生用量计数。用量不是账单，
  不据此推算缓存计费、停算或退款。普通检查只上传单份JSON；候选另导出经复查的收据和无凭据包，临时凭据目录清理。

事件与输入见 [GitHub 工作流文档](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)；凭据配置见
[GitHub secrets 文档](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)。
本流程不使用 pull_request/pull_request_target，也不将网关密钥交给普通 CI。

失败通知另需维护者设置 `REAL_GATEWAY_SMOKE_REPORT_FAILURE=true`。新通知任务
没有网关密钥，不安装候选依赖，只读取限定 JSON 字段；同提交/错误的已有公开
issue 不重复创建。列表可能截断时拒绝盲目创建。没有最终回执时标记接受状态
未知，不据此重发。失败检查不会变成 PR 的必需检查或自动回滚/升级动作。

## 本机开发检查

```powershell
node scripts/real-gateway-smoke.mjs --local --id EXAMPLE_REPLACE_WITH_UNIQUE_LOWERCASE_ID
```

将例子换成只含小写字母、数字和连字符的独立 ID，例如 `example-check-1`。
此操作会收费，只在明确授权测试时执行。通过官方本机凭据服务只读取得本项目
已保存的连接；不读会话、不改实际凭据，不把密钥放到参数或日志。示例大写占位
故意不会被接受，防止未经选择就复制执行收费检查。

每个 ID 先写独占意图记录，发生中断也不能用同 ID 再发。普通检查的每个GitHub run attempt
是独立检查；维护者手动重新运行可能再次收费。固定候选模式仅允许首次attempt，重跑在付费前拒绝。代码不自动重试，传输守卫只允许
固定地址的一次请求并拒绝重定向。记录位于忽略的 `.runtime/evidence/`。
本机修改中的脚本会标记 `sourceDirty`，其结果不是该基础 Git 提交的 CI 证明，
也不替代正式 canary 观察或晋升；脚本摘要保留供对照。

当前只验默认文本连通性；工具回放、图片、所有模型、浏览器、官方 Desktop、
画布生成和实际账务均不由这个检查认证。发布/晋升流水线及七天观察仍需继续完成。

## 固定候选观察

手动运行可填`canary_tag`，例如`v0.2.0-canary.1`；它必须已经通过W4发布并进入
规范候选账本。留空始终只检查main，不借用计划变量。计划观察另设置
`REAL_GATEWAY_SMOKE_CANARY`为同一已发布标签，仍须原来的费用开关和Secret；本次未启用。

请求前重新核对公开Release、四份资产、源码/快照/原安装检查、完整包payload与
实际SDK；任一不符或不是首次attempt，付费步骤不会开始。当前代码只允许包manifest
版本不同，其他源码/依赖/模式/SDK改变需要新的候选。实际模型配置从受检归档读取。

运行标题明确标识固定标签；成功收据附候选绑定。无网关密钥的导出步骤再校验，
只上传`report.json`和`bundle.tgz`到`candidate-observation-<run>-1`，保留90日。
失败仍保留原普通安全JSON供检查，不把失败变成成功证据，也不自动重发。

完整七日采集器已实现，按晋升任务服务器时间读取全部相关状态/首次attempt、
原始ZIP与源码摘要，结束前复读历史；只有连续七个完整UTC日且当日无回归才可通过。
达到历史1000条/候选100份/归档64MiB界限时明确拒绝截断。promote工作流、上游ack
和稳定发布器尚未接完；测试中的七日是EXAMPLE，不是真实已收费或已稳定观察。
