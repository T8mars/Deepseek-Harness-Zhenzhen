# 画布Agent交接：阻塞后复用失效HTTP连接

2026-10-21。仅问题交接；本DSH Agent没有修改画布源码、安装、CLI或配置。
DSH已经在自身薄适配层通过CLI公开的fetch选项使用一次性HTTP连接，不需要
用户查路径、重配对或重装画布来应用该DSH修复。

在DSH自己的临时原CLI快照+Windows DPAPI+MCP测试中，完成配对开始后阻塞Host
事件循环6200ms，下一次配对查询可报APP_CONNECTION_FAILED/fetch failed。
服务端观测只有status GET与pairings POST，没有poll。原始Node22默认5秒空闲
连接加1秒buffer的独立回归可复现；怀疑客户端复用空闲连接时，阻塞使close/
定时器通知迟到。该证据属于临时回归，不声称已定位用户旧截图中所有失败。

请评估原CLI在DPAPI同步保护、系统休眠/唤醒或Host长阻塞后的连接生命周期。
可在CLI自己的请求传输中避免复用过期连接，或采用等价的受控单次连接策略。
DSH通过公开options.fetch、discoveryOptions.fetch与发现模块fetch选项注入实现，
Node http.request agent:false不借用共享池，同时请求Connection:close；仅增加
close请求头仍可能借用既有socket。原CLI字节只读核对，不改握手/凭据/schema
或计费审批。

验收要点：使用真实HTTP连接与同步阻塞复现；保留方法/正文/Authorization/
AbortSignal/响应大小限制；配对开始、poll、结构写入、审批或运行提交遇到响应
丢失时不可自动重发，尤其已有task_id或acceptance unknown时只查询。不能仅
延长超时或重跑测试作为修复。DSH回归位于contracts/canvas-idle-transport.test.mjs，
既有原始快照文件的摘要保持原值，所有测试存储均在自建TEMP目录。

本交接不授权Native版本升级、生产构建、推送、标签或Release；这些仍由用户
与画布Agent单独安排。
