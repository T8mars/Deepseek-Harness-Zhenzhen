# 0047 · 本地PDF文字与页码引用

2026-10-20，开发检查点。为本地RAG增加带文字层PDF，继续使用原词法索引与
资料/云端引用/Agent检索的独立授权；不引入OCR或云端解析。自有解析器仅
通过bundle服务与独立解码进程实现，不修改上游、会话或画布。

固定外部依赖pdfjs-dist6.4.299；读取过原Apache-2.0及其CMap/字体资源单独
许可，外部包保留自己的声明。本适配只允许本地内置CMap资源，不把它的字体
分配给UI，不请求远程资源，也不执行PDF动作或脚本。6.x已没有旧版的
isEvalSupported选项，不能把未生效的旧参数当作安全措施。

二进制数据经IPC交给固定Node子进程，命令行不含资料路径、文字或密钥；
不继承应用凭据环境，stdout/stderr丢弃，失败只返回固定信息。输入2 MiB、
最多200页、提取文字2 MiB、12秒时限；同模块串行，最多4项等待/执行。
解码进程V8堆设256 MiB，这不是全部原生内存的OS上限。父进程在子进程
关闭后才完成请求；撤权复核与超时会终止子进程，IPC断开时解码进程退出。

一次导入原文件与提取文本分别最多32 MiB。无文字PDF跳过，损坏、受密码
保护、超出页数/提取量或时限的PDF计失败。原文件不修改。每个PDF是一个
来源文档，各页独立分块；引用携带真实页码，行号为该页的提取文本位置。
多栏、复杂排版或字体编码不完整仍可能影响文字顺序和识别，不等同视觉还原。

自有SQLite schema2→3只给chunks增加page（旧记录默认0），事务迁移保留
原文片段、ID、授权、工作目录绑定和会话撤权记录。原文本引用的结构保持，
PDF命中新增可选page。旧包不应打开schema3，更不能删库作为降级方法。

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| `npm run check` 348/348；六项真实解码、六项索引及迁移测试；补充实际图片层PDF后定向14/14 | 新检查点对应的远端CI | 扫描件OCR、向量与真实模型引用质量 |
| Unicode/本地CMap中文、压缩文字输出限额、密码/损坏/图片无文字、页数、超时及撤权关闭；C47实际Host/Gateway/ToolRuntime与React SSR保留页码、独立授权、转义 | 更多真实PDF字体/多栏版式与浏览器交互 | SSR不是浏览器、原生窗口或用户项目验收 |
| 原1007篇参考文档索引、1空跳过、0失败，固定10问/top5/80%首版基线仍8/10，判据摘要未改 | 实际用户创作项目相关性 | 不把参考文档命中率写成通用语义能力或完整M3验收 |
| 标准W3C文字PDF真实下载一次，本地解码/索引/页码与源字节核对；官方CLI临时换装129文件包、已安装独立解析进程提取中文第2页、Host启动通过，TEMP清理 | 安装环境中经界面完整导入操作 | 安装包独立解析检查不等于安装环境中完整服务导入；后者的组合由C47隔离合同验证 |
| 本机经源码准备入口换装并运行新包；Host/客户端/worker/补丁/技能摘要与构建相符；原角色包与画布配置/pin保持，未触及画布 | 实际索引首次访问时迁移 | 本轮模型/收费请求均0，不重复唯一已消费Flash授权 |

本机新包 `ca8206ad7cd9932870443132a5f28209e4b5a7710e33233f92181b7d151f9a25`，
129项发布文件。正式替换前，身份核对停止自有Host，通过Node22.19原生
`backup()`只备份本项目自有索引至忽略目录，并以只读连接核对schema与
quick_check。本机旧索引当前仍schema2、各表记录数保持；首次访问知识库
时才创建Store并迁移。schema2→3迁移与授权保留已在EXAMPLE临时库验证，
不能把该结果写成本机实际索引已经迁移。备份不含原生画布数据库或凭据。

工具author DSL不接受 `minimum`/`maximum`，加入后会导致工具注册失败；
使用其支持的integer描述，边界继续由自有解码器及严格Zod DTO校验，C47
覆盖实际注册和调用。`plugin exec`不自动提供Host peer解析，安装测试只
直接运行本包明确发布的独立worker；Host启动及服务组合分别核对，未引入
开发目录依赖或改写上游引导器。

来源：[PDF.js公开API](https://mozilla.github.io/pdf.js/api/draft/api.js.html)、
[官方Node示例](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs)、
[W3C标准样本](https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf)、
[Node22.19 SQLite备份](https://nodejs.org/download/release/v22.19.0/docs/api/sqlite.html#sqlitebackupsourceDb-destination-options)。
