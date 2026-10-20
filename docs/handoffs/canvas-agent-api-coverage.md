# 画布Agent交接 · 网关创作能力覆盖

2026-10-20。本DSH Agent只修改DSH，以下交给用户转交画布Agent，不直接发送跨任务消息。

1. **已完成的DSH接入**：音频方案、公开模型就绪目录、明确provider/model选择、图片/视频候选、比例/时长及策略已进入DSH的原有规划/窗口审批入口。预览前重新读`/models`，计划返回必须保留所选值，不匹配不进入审批；`requiresRuntimeCheck=true`不是独立的不可执行标记。无需为这些既有字段新增原生API或修改状态平铺协议。
2. **证据与范围**：见[0049](../decisions/0049-native-model-workflows.md)。原生3.3.7源码在fresh TEMP中，Seedream `seedream-v5-pro-t2i`、视频原生别名`fast`、音乐原生别名`suno`均完成真实原生计划/Patch，按新增节点ID保留模型；图片/视频各2候选，音频1节点。实际窗口、安装版和Provider没有验证；未修改原生仓库/配置/CLI，未读用户数据库，未提升本机旧pin。
3. **请优先核对的覆盖缺口**：公开`createPlan`目前列出plan-card/image/edit-image/video/edit-video/audio/script/story，没有独立3D kind。请核对3D、转写、Seedream分层、音乐/Midjourney各动作在现有能力工具目录中的`capabilityId/version/directOperations/inputSchema`及RunIntent绑定；已有入口请返回精确合同，未有入口再由你设计。不要把网关完整SKU与Native短别名直接字符串匹配。音频/剧本/Story多候选的语义尚未确认，DSH界面先保持1；需要明确元数据候选数与实际新增节点/上游输出的对应关系。
4. **DSH继续承担的工作**：0050已增加参考素材的显式选择与稳定assetId/revision/contentHash核对、edit-*表单，具体限制及原生需补内容见[素材交接](canvas-agent-reference-assets.md)。能力目录到已核实Native工具的路由和原生合同更新后的适配/测试继续进行。引用素材只经公开资产控制面和批准的transfer，不读原生raw settings、不取得原生密钥。若所选模型要求素材而未提供，保持原生拒绝，不换用无素材模型。
5. **下一步与授权**：先由用户按[3.3.7复核](canvas-agent-v3.3.7-review.md)审阅新CLI并在原生窗口配对，再验证真实目标/模型/报价；生成只在用户当前批准后单次提交，受理不明只查询。本交接不授权原生修改、版本升级、生产构建/推送/Tag/Release或付费实测；这些仍由用户交给你后按原生规则处理。
