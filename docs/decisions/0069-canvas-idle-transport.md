# 0069 · 空闲连接失效后的画布配对

2026-10-21。0068的main CI通过482项，但新发布预览工作流中C26失败，481/482。
失败发生于临时DPAPI/MCP认证，未进入候选准备或发布；不能把两个运行写成全绿。
失败日志和原运行39534246824保留。没有自动重跑来掩盖失败。

本机在原始CLI快照、真实Windows DPAPI和临时MCP下复现：配对开始后阻塞事件循环
6200ms，下一请求报APP_CONNECTION_FAILED，服务端只收到status与pairings，没有
poll。独立回归使用Node22默认5秒keepalive加1秒buffer的真实HTTP服务器，同样
在旧代码下复现fetch failed。短于fetch自身池化阈值的模拟deadline不会复现，
因此没有用它作为有效故障证据。相关时限见[Node22.19 HTTP文档](https://nodejs.org/download/release/v22.19.0/docs/api/http.html#serverkeepalivetimeoutbuffer)。

DSH的CanvasBridge通过CLI已公开的options.fetch与discoveryOptions.fetch注入
仅处理本机GET/POST JSON的内置HTTP传输，agent:false创建独立连接并请求close，
不借用共享fetch池中已有的空闲连接。安装版3.3.7的原始JS只读确认这些公开选项。
原CLI仍负责本机origin、精确版本握手、响应约束、配对和
secureStore。请求方法/正文/认证/超时/取消保持原行为，每项操作只发送一次；
尤其不自动重发POST或把丢失响应当作未受理。没有改动CLI、Native配置/安装或
原始快照。HTTP连接开销换取短控制请求的稳定性，不改流式模型通信。

C74四项覆盖真实空闲截止/阻塞、无重复POST、已受理但丢响应、原CLI发现选项
转发、共享池残留时的独立socket、UTF8正文/认证/方法、拒绝重定向、原响应大小
及AbortSignal（响应前/中）。Native256KiB限制保留，传输最多缓冲其限制加一字节，
以便原CLI给出原错误；请求identity编码，避免引入透明解码差异。C74+C25+C26九项
通过，含真实DPAPI/MCP；不以测试窗口冒充真人Native窗口批准或用户创作完成。

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| 原故障本机复现；旧实现C74功能失败；修后C74+C25+C26九项及类型检查通过，含真实DPAPI/MCP | 最终实现完整检查、临时安装、当前CI/发布预览及自有DSH换装 | 真人窗口创作、Native CLI自身修复/发布、W5稳定晋升 |

需要原生侧评估的内容只写[交接](../handoffs/canvas-agent-idle-transport.md)，由用户
交给画布Agent，不擅自修改或发布画布。

初步只给全局fetch增加close请求头的实现通过484项/临时安装，但仍可能借用共享
池的旧socket，且发现探针未覆盖；因此未激活/发布该中间包7455de。最终使用
Node内置http.request的agent:false，发现与控制请求都走公开fetch选项，详见
[Node的一次性Agent说明](https://nodejs.org/download/release/v22.19.0/docs/api/http.html#class-httpagent)。
该次CI未包含底层诊断，空闲连接是本机明确复现的故障；新CI需另验，不断言已
解释所有历史连接失败。

最终完整486/486通过，152文件归档SHA256`a0f861ccb800f0e09908cc3e3c6a1295286d1b39c7dbe964e26eef5b9d769443`，
旧ded8a包换装/卸载恢复完整官方基线通过。自身实际DSH经公共CLI换装，全152
文件匹配；公开配置设置摘要、Canvas/RAG设置摘要、美术、自有schema3七表行数/
quick_check与迁移前备份保持。旧进程身份核对后停止，新Host43448/launcher45960/
exec6076在回环5180，官方CLI请求打开浏览器；没有浏览器实显证明。未重查或
批准Native配对，不把历史过期时间当作永久paired。当前CI/默认预览随后核对。
