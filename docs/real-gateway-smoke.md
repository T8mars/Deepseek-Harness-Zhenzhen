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
  不据此推算缓存计费、停算或退款。只上传单份 JSON，临时凭据目录清理。

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

每个 ID 先写独占意图记录，发生中断也不能用同 ID 再发。每个 GitHub run attempt
是独立检查；维护者手动重新运行可能再次收费。代码不自动重试，传输守卫只允许
固定地址的一次请求并拒绝重定向。记录位于忽略的 `.runtime/evidence/`。
本机修改中的脚本会标记 `sourceDirty`，其结果不是该基础 Git 提交的 CI 证明，
也不替代正式 canary 观察或晋升；脚本摘要保留供对照。

当前只验默认文本连通性；工具回放、图片、所有模型、浏览器、官方 Desktop、
画布生成和实际账务均不由这个检查认证。发布/晋升流水线及七天观察仍需继续完成。
