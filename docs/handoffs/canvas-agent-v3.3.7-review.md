# 画布 Agent 交接 · v3.3.7 只读复核

2026-10-20。用户要求由DSH侧核对已更新的画布；需要原生修改时仍交画布Agent。

1. **结果**：源码、GitHub main均为`b813be15df9e3e6ce2d1316250c4602513c08d48`，版本3.3.7；Latest Release为v3.3.7、目标`dc4893656379c743bd67d5de2de764b7f2d163ff`，六资产元数据可见。工作树干净，worktree inspect/development及两受保护文件摘要匹配。运行源码后端的两个公开状态GET均200，HTTP兼容字段与原生CLI逐项相符；runControl/assetControl v1标记可见。本范围没有发现新的原生缺陷。
2. **DSH已自行修正的问题与证据**：Native状态是平铺兼容字段，DSH原来只读取嵌套`data.compat`，造成界面报告为空。现支持平铺报告，并原样保留旧嵌套报告和显式null；MCP原状态输出不改。C40先复现1失败/2通过，修正后专项10通过；完整325项、最终相关专项16项和公共CLI换装检查通过，本机DSH已换装，见[复核记录](../decisions/0040-canvas337-readonly-review.md)。请保持原生平铺协议，不为DSH旧误读新增嵌套包装。只读证据在DSH本机忽略的`.runtime/evidence/canvas-runtime-readonly-0040-final.json`，不含令牌或设置原文。
3. **当前连接边界**：DSH保存的CLI pin仍为`fae0b706964edbebfc630853a66d32ec591dbb4dc05661f4bf22e86284cb1ec9`，当前同目录`E:\PenguinPravite\T8-penguin-canvas\tools\zcanvas-cli`为`8a474a98bf33797018df9fe7fa9126ca55891100e64c87f91885bfc65b81b110`，因此生产连接返回CLI_CHANGED，属于预期保护。临时只读探针没有保存新信任、配对或调用业务接口；没有POST、认证请求、付费调用或Native源码写入。已验证的是源码后端，不代表安装版UI、升级回退或真人窗口审批。
4. **下一步**：按原生交接要求，在DSH连接页重新预览并审阅上述CLI摘要后再信任；随后由用户在画布窗口确认最小读取权限配对。请画布Agent确认后台服务与实际原生窗口配套，核对配对审批是否能出现，并反馈实际版本、CLI/manifest摘要和窗口结果；如果当前仅开后端，说明正确的GUI入口。本轮不要求新增原生API，不读取retained/historical数据库，也不重交付费任务。
5. **授权边界**：DSH Agent没有修改画布。后续原生修正由用户交给画布Agent，并遵守其AGENTS/SKILL；新版本、生产build、推送、Tag、Release或付费验收仍分别需要当前授权。本文不构成这些授权，也不自动改变DSH信任记录。
