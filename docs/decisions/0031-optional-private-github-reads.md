# 0031 · 可选的私有 GitHub 只读连接

2026-10-20。用户确认仓库在完善前保持私有，以后由用户决定公开；本轮不改变
可见性。修补匿名技能目录在私有仓库下无法读取的缺口，公开读取继续可用。

更新中心新增可选 GitHub 凭据入口，与本项目技能目录和版本检查共用。只经
原生 ctx.credentials 保存、描述、读取和移除；没有新凭据文件格式。UI 返回
是否配置及是否可写，不返回已有值。未配置时沿用匿名 GitHub/raw 读取；配置后
仅对固定 T8mars/Deepseek-Harness-Zhenzhen 的 commit、固定技能目录 contents
和 releases 发 GET。不会将凭据用于其他仓库、上游、npm、网关、模型或 Agent。

鉴权目录内容使用已查到提交的 contents API 与 raw 媒体类型，避免将令牌发给
raw 域名或重定向。字节、超时和 UTF-8 有界；不读取错误回显正文，不重试认证。
每次请求前后再次核对凭据。保存/移除以及原生 reference-updated 事件中断旧
检查；过期响应不会替换目录、提供候选或安排更新。已有下载与安装仍保留，
纯文字自动安排策略继续单独控制，不因移除凭据而删除内容或修改用户选择。

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| 7 项专项覆盖匿名与私有路径、固定仓库/GET/无重定向、限额与安全错误、并发撤销、晚到凭据变化、目录保留和版本检查边界 | 新增控件的浏览器实显及真实用户令牌操作 | 未修改仓库公开性，未复制本机 gh 登录令牌到应用 |
| C33 使用 published LocalCredentialProvider、Registry/RemoteAccess/Gateway；真实临时凭据存储/重启恢复、原生凭据更新事件、非 owner 拒绝、严格 DTO 与模型密钥隔离 | 使用应用新凭据入口的真实 GitHub HTTPS 联调 | C33 的 HTTP 回包是合成的，不能冒充真实 Bearer 传输证明 |
| 已用原有 gh 登录对真实私有仓库执行只读 API，固定提交的 15 项目录与本机包逐项一致；2026-03-10 API/raw 媒体类型实际可用 | 日后公开后的匿名在线读取 | 此次真实来源读取经 gh CLI；应用未获得它的秘密，也未配置个人令牌 |

来源合同：[GitHub 鉴权](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api)
与 [contents API](https://docs.github.com/en/rest/repos/contents)。细粒度令牌只需选
本仓库并授予 Contents 读取。该功能不推送代码，不安装程序或自动激活应用。
之前已启用的 GitHub Actions 仍因账号付款/支出额度无法启动，未冒称远端绿测。

最终 `npm run check` 274 项、0 失败，包含 build、typecheck 与根私有文件
防护。首次完整检查为273/274：旧 C17 夹具缺少 describe，尚未发出匿名请求；
补齐原生接口并继续严格拒绝秘密读取后，10 项相关回归与完整274项通过。
失败日志保留在本机，不将合成夹具缺口写成真实 GitHub 服务故障。

128 文件本地包已通过官方 CLI 临时安装、18 路由/Flash 默认、指定上报关闭、
Host 回环及清理检查。包 SHA-256 为
`2080128e0ba580db0472e02143c1cdf95d5a8615ea7523c36f6b6952dc72fe66`，
入口为 `385cb5b6db4623a95c612db43c36afb5db4ae9af441c8aebf27dc56c75988035`。
