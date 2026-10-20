# Canvas 工作源码补丁备份

`native-dsh-integration-v1.patch` 保存配对存储协调、运行单次操作与GET恢复、
素材交接、安装版兼容路径和实例发现修复，共38个源码/测试/清单/文档文件。
基线为 T8-penguin-canvas `e6702dc7770bcbe7d4895be22a06f4c7123a085b`。
`manifest.json` 列明每个原始blob与恢复后文本的SHA-256，文本按Git的LF保存。
不包含用户数据库、安装版文件或根私有手册；Native MIT 声明随目录保留。

此补丁供恢复代码、审阅和人工移植；DSH 不自动应用它，也不绕过画布自己的
工作树门、测试、版本与生产构建授权。应用前先读取画布当前上下文，核对基线
和当前源码，使用 `git apply --check`。上游发展后不能直接覆盖文件或强行应用。

可运行以下独立恢复检查：它仅从可信源码仓库读取基线的Git对象，将38个文件
在新建系统TEMP中重建并逐项校验，结束后清理；不修改原仓库、索引或安装版。

```powershell
npm run verify:canvas-backup -- --canvas-root "D:\Example\T8-penguin-canvas"
```

`native-assets-v1.patch` 与 `native-assets-v1.manifest.json` 保留0030时期的
7文件素材补丁，作为旧检查点；完整恢复以当前manifest为准，不叠加两个补丁。

验证与生产授权边界见 [0032](../../docs/decisions/0032-native-canvas-integration-delivery.md)。
