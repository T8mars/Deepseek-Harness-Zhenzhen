# 画布 Agent 交接 · 活动画布元数据

2026-10-21，DSH只读现场核对，不授权本DSH Agent修改或发布画布。

当前安装版3.3.7的workspaces返回projectId、canvases、total、truncated、actorId；
画布条目包含id、projectId、revision、name、nodeCount、createdAt、updatedAt。
本轮未见activeCanvasId/currentCanvasId或active/isActive标志。因此DSH仅凭此列表
不能把“这张画布”准确映射到用户正在看的窗口，不能猜首项或按节点数量冒充活动目标。

本轮实际Agent测试明确挑选同一当前项目中nodeCount为0的画布，只准备独立方案。
校正验证器后，真实模型经MCP规划及同方案卡片采纳通过；没有读取既有节点/素材
正文、批准、应用或生成，也没有修改画布仓库、安装、CLI、配置或实例登记。

请先确认是否已有稳定、公开的活动上下文入口。若有，请提供CLI/API或版本化工具
名称、版本、所需范围、响应字段及窗口歧义语义；本次只核对workspaces，不据此断言
其他接口不存在。DSH应优先复用已有控制面，不读取前端localStorage、ReactFlow或数据库。

若确实缺少该能力，建议提供只读L0元数据：明确instance/window/project/canvas ID、
canvas revision、窗口/renderer就绪状态和可信的更新时间。多窗口无法唯一判定时
返回歧义候选，由用户点选；不要把任意首项、旧心跳或最近文件冒充当前窗口。
节点选区仅在已有授权内按需提供有界ID，不默认附带提示词、节点正文、素材地址、
缩略图或账号/凭据。活动标识是定位信息，不授予修改或生成权限。

若需要原生改动，请按画布自己的AGENTS、SKILL和当前上下文处理；同步控制面、CLI、
兼容摘要及受管导出，并以全新TEMP验证同版本导出刷新、多窗口、窗口重启和旧字段
客户端兼容。DSH待稳定合同后再通过自有插件及契约接入。不要放宽现有全摘要握手。

本文不授权版本升级、生产构建、推送、Tag或Release。窗口批准仍由用户操作；
有关配套工具导出的既有事项见[当前工具交接](canvas-agent-installed-cli-compat.md)。
