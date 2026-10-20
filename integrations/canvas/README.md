# Canvas 工作源码补丁备份

`native-assets-v1.patch` 保存本轮素材交接和安装版兼容路径的有限源代码修改，
基线为 T8-penguin-canvas `e6702dc7770bcbe7d4895be22a06f4c7123a085b`。
它不包含用户数据库、安装版文件或根私有手册。Native MIT 声明随目录保留。

此补丁供恢复代码、审阅和人工移植；DSH 不自动应用它，也不绕过画布自己的
工作树门、测试、版本与生产构建授权。应用前先读取画布当前上下文，核对基线
和当前源码，使用 `git apply --check`。上游发展后不能直接覆盖文件或强行应用。

验证与限制见 [0030](../../docs/decisions/0030-saved-media-canvas-transfer.md)。
