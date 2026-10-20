# 0051 · Word 正文的本地资料检索

2026-10-21，开发检查点。为创作者导入常用DOCX设定、剧本及策划资料，扩展现有
授权文件夹导入；继续使用同一检索、出处、会话授权与撤权链路。没有新增画布
API、云端解析、模型调用或数据库迁移，原schema3及文字/PDF记录格式保持。

通过OPC根关系定位主文档，并核对ContentTypes；读取正文段落、表格、可见文字、
换行与制表符，保持源文档顺序。支持常规WordprocessingML命名空间及UTF-8/UTF-16。
只展示“Word提取文本行”，不虚构页码或版面。暂不还原页眉页脚、脚注、文本框、
自动编号、图片和旧版DOC；altChunk/外部主文档及含宏的主文档类型拒绝。
正文删除内容、隐藏run与域指令不会加入索引，超链接只保留可见文字，不读取目标。

原文件上限2MiB，ZIP目录最多512项，主XML最多8MiB、元信息各256KiB、提取文字
2MiB、XML深度128。核对本地/中央目录身份、解压长度和CRC，解压本身也受
Node `maxOutputLength`约束，不能靠伪造压缩包大小绕过。仅内存读取指定part，
不释放压缩包文件到磁盘。固定子进程限时30秒、V8堆256MiB、最多4个待处理，
只经IPC传字节，不在argv/env/日志中放资料路径或正文；撤权及超时均等待进程关闭。
堆上限不等于OS全部内存保证，解压输出另有限制。源文件不修改，授权可随时撤回。

严格XML解析使用已发布saxes6.0.0及锁定的xmlchars2.2.0；前者仓库已归档，
因此固定版本、禁用DTD和外部解析，并隔离在有界本机解码路径。未使用其私有API。
官方版本的完整ISC及原始MIT声明存于`packages/dsh-zhen/licenses/saxes-6.0.0.txt`，
构建核对规范换行后的SHA并连同xmlchars许可写入分发的THIRD_PARTY_NOTICES。
这两个库是外部运行时依赖，不进入浏览器包。直接声明依赖，不依赖上游偶然安装。

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| 完整369/369及干净类型检查；7项C51检查含真实固定子进程、损坏/DTD/外部主文档/宏类型拒绝、CRC/重复条目/伪造大小解压上限、取消/超时/队列；138文件包及官方CLI同版本临时换装、已安装DOCX/PDF worker通过 | 真实用户资料的浏览器导入与兼容性反馈 | 浏览器、Microsoft Word界面、真实模型引用与通用排版识别 |
| 实际已发布Host/Gateway/ToolRuntime、全新TEMP SQLite、严格Remote codec、匿名拒绝、来源授权、跨会话拒绝及撤权；真实来源卡片SSR转义 | 本检查点GitHub备份与对应Windows CI | 不能把SSR称作浏览器，或把隔离Host称作完整用户现场 |
| 独立python-docx1.2.0生成的中文正文/表格，生产子进程逐字匹配，原始字节SHA保持；为EXAMPLE合成资料，无真实用户文档 | 更多真实文档的兼容范围 | 页眉页脚等未纳入本版正文索引；没有OCR/向量或Native语义索引接入 |

旧10问/80%首版基线及其8/10结果保留为0041的已采纳历史结果。本轮未更改查询、
排序、分词或基线判据，没有将新增格式的成功当成新一轮通用相关性评测。
上一dev22的Windows CI39459477068已实际362/362、134文件包与公共CLI安装检查
成功；本轮需要自己的结果。根四份私有文档及创作资料仍不上传、不打包。

协议与实现来源：[WordprocessingML结构](https://learn.microsoft.com/en-us/office/open-xml/word/structure-of-a-wordprocessingml-document)、
[Node22.19 zlib](https://nodejs.org/download/release/v22.19.0/docs/api/zlib.html#class-options)、
[saxes6文档](https://github.com/lddubeau/saxes/tree/v6.0.0)。

本机源码准备入口根据依赖身份变化重新执行锁定安装，再构建/换装；新包SHA为
`3c58f381ff8fdd580f0245bdbcc28d4b28b7335f6f7eaafadc127b80f55a65b3`。
已安装Host、客户端、patch、技能目录、PDF及DOCX worker摘要与本机产物一致。
独立生成DOCX的已安装worker正文摘要与预期相符，原文件字节保持；临时profile的
完整Provider配置、Flash默认、隐私及Host回环启动也通过。这是安装解码器检查，
不是完整真实用户知识导入UI证明；实际Host授权组合由C51另行覆盖。
角色包、画布配置、旧CLI pin、源码更新开关、自有RAG记录数量及备份保持。
实际索引仍schema2懒加载，不将临时库schema3验收当成已迁移用户索引。
原Native0050验证仅为上次特定Host的历史证据；本轮未修改DSH的画布模块或画布仓库，
没有重跑Native矩阵，也不宣称新增RAG后整个Host与原Native验证是相同字节。
