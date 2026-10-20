# 画布Agent交接 · 参考素材与编辑

2026-10-21。请由用户转交。本DSH Agent没有修改画布仓库、CLI、安装版或配置。

1. **DSH结果与复现**：连接页可读取项目素材元数据，按稳定assetId、contentRevision、contentHash选择及排序，支持image、edit-image、edit-video和audio引用；预览核对原生v1附件证据摘要及brief顺序，送审/应用前再次读取。新增文本/参考理解模型选择。`node scripts/verify-native-canvas.mjs --canvas-root <画布源码绝对路径> --include-reference-assets`使用原生产路由、决策、审批和Patch，在全新系统TEMP库测试；审批窗口为模拟，网络封锁、无Provider调用。具体结果见[0050](../decisions/0050-canvas-reference-workflows.md)。
2. **顺序、数量与入口**：3.3.7源码`agentControl.js`的`creativeInputWithAttachments`先Set去重，再只解析前16项；brief仍可能保留更多ID。普通`videoPatch`没有绑定参考，`editVideoPatch`才写入媒体引用。因此DSH明确拒绝重复ID/超过16，并将视频参考放在edit-video入口。请在现有控制面增加可发现的引用限制/有序重复槽合同；不要悄悄丢弃用户选择，也不要另建付费提交链。
3. **内容版本与原子性**：当前图片Patch的asset引用记录ID和修订号，没有contentHash；视频编辑bindings包含hash。原生`assertCreativeApprovalStillCurrent`会复核计划/目录/必需模型就绪，但未看到其在实际提交事务内重新读取资产hash和revision。DSH前置GET不能消除GET到提交之间的变化窗口。请在原生批准/应用的权威事务中核对引用证据，明确过期状态，并补内容变化/组织元数据变化的并发回归；图片binding也需完整内容身份。
4. **大小与模型就绪**：原生upsertAsset将大小放在metadata时，公开详情没有顶层sizeBytes/size，而附件resolver只读这两个顶层字段，证据中的大小会成为0。DSH保留0表示未知，界面显示“大小未提供”，不伪称已校验媒体字节。另在仅配置Seedance示例凭据的TEMP中，带图自动选择了未配置的工坊视觉LLM，计划ready后在完成审批时APPROVAL_STALE/readiness；显式选择图片模型也不改变这项必需LLM选择。补充TEMP视觉LLM示例凭据和明确选择后才完成结构应用。请检查规划ready与必需模型readiness的一致性，以及Seedance视觉能力元数据的准确覆盖；DSH已拒绝必需decision非ready的引用计划。
5. **边界与回传**：以上只证明当前源码的隔离组合，不证明真实窗口、用户旧库、安装版或付费生成。请回复精确的公开合同版本、字段、测试命令及已验证/待验证/未验证；已有能力优先复用。重复插槽、原子内容复核、图片hash及未知大小尚未由DSH修复。本交接不授权原生版本升级、生产构建、推送、Tag、Release或费用；仍按用户给画布Agent的授权执行。
