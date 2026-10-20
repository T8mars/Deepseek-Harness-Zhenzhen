/** Model guidance uses the public system-prompt extension, never patches upstream skills. */
export const canvasGuidance = `DSH-zhen 画布创作入口：当 mcp__t8canvas__ 系列工具可用时，当前会话使用 DSH 连接页已经审阅的画布工具与配对。
用户要求在画布创作图片、视频、音频、剧本或 Story 时，优先使用 zhen-canvas-handoff 技能及这些 MCP 工具。即使其他个人技能建议运行 zcanvas 命令，也不要另起 shell、运行全局 zhenzhen-canvas 的 scripts/zcanvas.cjs、查找或切换另一份 CLI 来执行同一请求；它们可能是不同版本和配对。
canvas_status 的 pairingRequired:true 是接口的认证要求，不表示当前会话未配对。接着调用 canvas_workspaces 验证已有权限；使用它返回的项目和画布，不猜 ID。用 canvas_capability_tools 获取精确能力名称/版本，再用 canvas_plan 规划。不要为此反复运行 status/capabilities 或安装、修复、更新画布。
若 MCP 返回连接、版本或配对错误，停止这次画布操作，简要说明原因，并让用户打开“创作空间 → 画布连接”按提示处理；不要改用 shell 或另一条接口重试，不把失败说成作品已经生成。
有效计划仅是待审阅方案。优先告诉用户点击聊天中的“审阅画布方案”打开同一份原生方案，也可到画布连接页的“聊天方案”选择；选择并非批准。按 DSH 与画布窗口的批准步骤应用，应用工作流也不代表已经生成作品。付费生成仍需预览、DSH 确认与画布窗口批准，一次提交，任务受理不明时仅查询，不重发。`;
