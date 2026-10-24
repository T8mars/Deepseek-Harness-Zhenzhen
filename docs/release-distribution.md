> 0129：包含完整契约检查的build任务限时为45分钟，替代旧20分钟。依据精确全绿Windows检查实测26分7秒；未缩减测试、改变权限或自动开启发布。具体证据及未验证项见 `decisions/0129-distribution-build-budget.md`。

# 候选包、Git 快照和分发索引

W4 `release.yml` 已实现默认预览、不可变编译快照、隔离安装验证、Canary Release、
通道索引和可选 Pages 部署。W5 晋升已于0074接入，操作见`stable-promotion.md`，真实发布仍待验证；正式 Release、索引和 Pages 尚未
实际发布。开发备份标签不等于产品发布。

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

快照需先由发布器或明确的测试备份动作写入目标GitHub仓库，才可运行：

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

## W4 操作与恢复

在 GitHub Actions 运行 **Prepare or publish DSH-zhen canary**，默认 channel 是
development、publish 为 false。它会完整检查、打包、临时安装/卸载，再保存14天
的两文件发布输入和预览。默认流程不会建立远端快照、产品标签、Release或索引，
不调用模型。开发预览不需要仓库密钥。

真实候选必须先在源码里使用真正的 `x.y.z-canary.N` 包版本并通过 main 的检查。
选择 canary、填写匹配的 `v版本` 标签并启用 publish 才发布；当前0.1.0不能
直接当作canary。该操作没有稳定版发布入口。

1. build任务只有读取权限，运行所有检查与官方CLI临时安装；发布输入只含归档和
   来源元数据，不携带源码、凭据或用户目录。
2. snapshot任务不安装依赖、不执行包。仅用受控Git和Node内置模块，重新核对
   来源提交/时间/manifest/runtime pin、归档全部字节及Git对象，并核对GitHub
   服务端同一次工作流的成功build和精确提交的main检查，再建立不可变快照引用。
3. verify任务只有读取权限，从同一源码独立构建相同归档，经官方CLI安装真实
   Git提交，核对全包文件、Host/解析器与完整卸载基线。无写令牌或网关密钥。
4. finalize任务不运行候选包；服务端核对build/snapshot/verify成功后建立草稿
   Release，上传tgz、compat、provenance和SHA256SUMS，逐字节回读再公开。Canary
   始终是prerelease且不设为latest。索引使用实际published_at时间。
5. 最后将索引写入 `codex/distribution`，保留前版本和父提交，非强制快进。
   `channels/canary/market/index.json`用于候选，`market/index.json`保留稳定通道，
   当前稳定通道为空；不会将canary写进稳定通道。原始Git地址也可读取索引。

发布标签、快照、资产或已登记版本存在且不一致时停止，不覆盖、不删除、不强推。
相同输入重跑可复用；已有compat中的安装证明必须重新向GitHub核对。上传中断、
并发冲突或响应丢失后，先查远端状态再重跑；未知/部分/额外资产不会自动清理。
Release已公开而索引更新失败时，可用相同候选恢复索引，不能改名掩盖资产冲突。
索引账本最多100个候选，满后须单独审核保留策略，不悄悄丢历史版本。

Pages是独立只读导出与部署任务：仓库Pages须设置为GitHub Actions，并设置
`DISTRIBUTION_PAGES_ENABLED=true`。未配置时只跳过Pages，已发布的Git索引仍可用。
部署需要官方Pages环境与相应权限；流水线不会修改仓库Pages设置或静默打开开关。
站点只包含核验过的五份静态文件。没有将安装任务与pages/id-token写权限混用。

发布任务没有Seedance密钥、不发送模型请求。W6费用开关和凭据仍独立配置。W5的
七日观察、ack和稳定晋升尚未完成，不以W4测试通过代替这些条件。

0068首次真实默认预览被既有C26配对测试拦住，481/482；源提交主CI通过482。
已保留失败并在0069复现、修复DSH连接传输，未跳过或删除检查。新提交预览需
另验；不能将本机测试或main CI写成该失败预览已经成功。

0069新主CI/默认预览均通过486，但预览如实sourceDirty=true，未发候选。0070
修公共技能feed在autocrlf检出后生成LF造成的首个Git状态误报，仍要求真候选
干净；不通过忽略变化、重置文件或先diff刷新来跳过门禁。新预览clean状态另验。

0071：版本改从自身公开package.json读取，生成runtime pin不再包含自身版本。
C76以真实生产双构建、双打包及官方CLI双安装验证，只忽略manifest版本即可
得到相同payload摘要；依赖、其他151文件和执行位仍逐一参与。测试的peer解析
hook仅用于裸CLI加载，不随应用分发，不代表Host授权或W5七日观察已通过。

0072加入Actions原始证据读取和固定候选七日规则，详见[决策](decisions/0072-candidate-observation-evidence.md)。
公开只读API预先拒绝写请求；ZIP在内存限界读取，验证服务器摘要和完整文件集合。
七个完整UTC日须逐一核对实际候选包/SDK、服务器付费步骤、首次attempt与原始收据；
0073已接入候选W6并实现采集器；promote工作流仍待完成，EXAMPLE测试不是真实七日或稳定发布。

候选检查操作见[受控网关检查](real-gateway-smoke.md)。采集器按晋升任务服务器创建时刻固定截止，
读取完整列表、首次attempt与原始ZIP，结束前再复核历史。达到API搜索界限或留存上限会拒绝，
不能把失败、在途、重跑、缺失或被截断的记录排除后发布。真实候选尚未发布，不伪造观测。

0074已实现[稳定晋升](stable-promotion.md)：默认预览，首次适用性审阅、原W3/W4、
连续七日原始W6、同完整包/SDK及独立精确Git安装同时通过后才允许稳定发布。
双通道索引仍是五个规范文件，保留原候选/旧版本和父历史；稳定资产新增完整promotion证明。
不可变冲突、main漂移和降级不写入；丢失响应不自动重发。真实首次审阅/观察/发布另验。
