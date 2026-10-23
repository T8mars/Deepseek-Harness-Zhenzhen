# 画布 Agent 核对 · Moss Image 模型契约

本 DSH Agent 只修改 DSH。本轮未读取原生用户数据库、配置或凭据，也未调用原生模型目录；不能据此判定当前画布缺少 Moss 实现。请先核对现有版本，已有支持时返回公开契约与测试证据即可，不重复开发、配对或发版。此前活动定位与退出传输交接已完成，仍以[既有复核](canvas-agent-v3.4.1-review.md)的实际范围为准。

DSH 已收录 `moss-image` 的文档能力信息，状态保持 `observed`。默认聊天仍为 Flash；本条不是将文档记录自动变成可执行工具。

依据：[Seedance 官方完整文档](https://api.seedance.nz/docs/llms.txt)末尾的 Moss Image 专节。本批审阅源的 SHA256 为 `e2ec2f8fc4ca54f6fa75fc4c7cc83f75ca4de61e56121fa9a6c175dd6888756f`。

| 项目 | 本次需要核对的契约 |
| --- | --- |
| 模型与类型 | 精确模型 `moss-image`，类型 `image`，复用现有 Seedance 通道；原生目录中的不透明 `id` 仍由画布提供，DSH 不拼接猜测 |
| 创建与查询 | `POST /v1/image/generations`；接受后仅 `GET /v1/image/generations/{task_id}` 跟踪，不用查询失败触发再次创建 |
| 输入 | `prompt` 必填，参考 `images` 可为零或一张公开图片 URL；资产与授权仍由画布解析，不将用户路径或凭据交给 DSH |
| 比例 | `metadata.ratio`：`1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`9:16`、`16:9`、`21:9`；默认 `9:16` |
| 不支持的控制 | 文档未提供分辨率、seed 或批量控制；不得套用通用表单后把不支持的字段静默发送或忽略 |
| 结果与结算 | 成功记录的 `data.result_url` 或 `data.data.content.image_url/image_urls`；终态实扣取 `data.usage.amount/currency`，保持原单位，不将预扣或内部额度当最终实扣 |

需要返回的公开信息：

1. 已有控制面的 `GET /api/agent-control/v1/models?projectId=EXAMPLE_PROJECT&canvasId=EXAMPLE_CANVAS&kind=image&query=moss-image` 是否能返回对应记录。沿用现有 `provider/model/id` 与 `readiness` 契约，明确 credential、region、installed、available、executable 和 blockers 的真实结果；不读或返回 raw settings、API 令牌。
2. 原有 image/edit-image 规划是否保留所选模型与零/一参考资产。缺少必需字段、参考超过一张、传入不支持的控制时，需在收费提交前明确说明，不能换模型或静默丢字段。
3. 若多候选沿用既有单任务拆分机制，窗口须显示实际数量与完整报价，并保持既有单次提交账本；若尚不支持，明确拒绝，不发送未支持的批量参数。每个已受理任务只查询；受理不明不得提供重发路径。
4. 任务响应可能同时包含数字内部行号 `data.id` 和公开字符串 `data.task_id`，两者不能相互替代。DSH 已修复自己的查询器，这不自动证明原生适配器已覆盖该情况。计费单位也可能是自定义显示名称，不应仅因不是 ISO 货币码而丢弃终态实扣。

DSH 当前通用创作表单只提供五种既有比例，尚未声称打通 Moss 全部八种比例。请给出现有规划输入 schema 和公开模型约束；原生契约确认后，DSH 再扩充相应选择与验证，不能直接假设任意模型都接受新增值。

验证只使用全新的系统 TEMP 项目与测试凭据：文生图/单参考规划、模型身份和参数保留、二参考拒绝、未知参数拒绝、数字行号与公开任务号、终态自定义单位、失去回执后不重发。真实收费测试与原生窗口审批另行进行，不将替身窗口或模拟响应当作真实创作验收。

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| DSH 文档提取与能力目录收录；通用任务身份和计费单位处理 | 当前画布是否已经支持该模型及上述原契约 | 原生 Moss 生成、八比例、真实窗口批准与作品回流 |

本交接不授权本 DSH Agent 修改画布，也不授权原生版本升级、生产构建、推送、标签或 Release。由用户转交后，画布 Agent 仍按自己的项目规则处理。
