# 候选包、Git 快照和分发索引

当前是 W4/W5 的准备层，尚未发布正式 Release、市场索引或 Pages，晋升工作流
仍需继续实现。开发备份标签不等于产品发布。

## 为什么需要构建快照

已钉的 `@deepseek-ai/dsh-plugin-market-index` 格式1只支持npm及固定Git提交。
它会拒绝tgz来源，不能把下载地址伪装成Git仓库。也不能让用户安装缺少lib的
主源码树。此处的选择是：保留tgz作为发布资产，另建只含包内构建文件和来源
证明的Git提交；索引使用官方 `parseMarketIndex` / `marketInstallTarget`。

快照的 `package/` 包含实际归档文件，`provenance.json` 记录来源提交和SHA256。
Git blob/tree/commit以确定性字节构造，可在以后由隔离写任务写入GitHub，生成器
不执行包中程序。没有修改上游市场协议，也没有占用npm发布名。

```powershell
npm run check
npm run pack:bundle
node scripts/prepare-release.mjs --channel development
```

预览写入 `.runtime/distribution-staging/`。已有目录必须逐文件相同才能复用，
不会覆盖损坏或部分输出。tgz、快照、compat.json、market/index.json和manifest
分别有摘要。当前预览时间取来源提交时间，不是实际发布时间；正式发布器必须
用真实发布结果更新公开索引，不能直接把预览当作已发布。

`canary`要求包自身版本为 `x.y.z-canary.N`，标签精确匹配；`stable-candidate`
要求无预发布后缀且标签匹配。不会把当前0.1.0偷偷改称另一个可安装版本。
候选要求源检出干净。`compat.json`仅声明当前严格runtime pin，证据初始为null；
旧技能正文的INSTRUCTION_HOSTS兼容线不能被解释成所有旧Host已经运行验收。

payload摘要只忽略package.json中的version并对该JSON做规范化，其他文件内容、
依赖和执行位仍参与摘要，供后续canary到stable比较；这不是晋升授权或七天观察。

## 输入和发布边界

归档限8MiB，展开限32MiB，仅允许共享打包清单中的普通文本文件；验证tar校验和、
结束/填充、普通USTAR及受限PAX字段，拒绝软硬链接、越界/混淆/重复路径、特殊权限、
私有运行文件、密钥候选和带安装脚本的manifest。归档及元数据会再次匹配后才写入
本机普通目录；不把候选下载目录或符号链接当成可信工作区。

## 真实Git安装探针

快照需先由后续发布器或明确的测试备份动作写入目标GitHub仓库，才可运行：

```powershell
node scripts/smoke-install.mjs --git-snapshot
```

它使用当前预览的官方市场安装spec，在全新TEMP配置中经公共CLI安装，核对整个
包的文件字节、模型/隐私/附件、解析器和Host启动；停止后卸载并与完整官方基线
比较。不读取用户会话或凭据，不打开浏览器，不提交模型/画布生成。

已有不可变预览可按其目录名重验，避免源码提交变化时误算另一个快照：

```powershell
node scripts/smoke-install.mjs --git-stage EXAMPLE_REPLACE_WITH_OWNED_STAGE_NAME
```

目录名只在本项目 `.runtime/distribution-staging/` 查找，并重新匹配当前包的全部
字节与快照，旧包或手工变更不会通过。大写占位不能直接执行。

0067已将经过审查的基线构建保存到独立测试备份分支，主分支未因此改动；
[固定测试快照](https://github.com/T8mars/Deepseek-Harness-Zhenzhen/tree/7a76c19bb71685fa721d6100fadec345a7c288f7)
有152包文件和一份来源证明。真实HTTPS Git安装的全152文件一致、Host/解析器与
卸载基线检查通过。它是协议测试备份，不是正式Release/市场索引，也不代表新
上游、Unix平台、浏览器、原生窗口生成或稳定版晋升通过。

后续发布API与Pages部署分别参照
[GitHub Releases](https://docs.github.com/en/rest/releases/releases)和
[Pages工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
