# 本地检索后端扩展

DSH-zhen 在 Host 提供 `ctx.zhenRag`。默认 `lexical` 复用既有中文词法查询，
没有新增云端检索、向量模型或索引迁移。知识库的暂停/恢复及高级选择由 Owner 操作，
不向模型提供注册后端、更改设置或扩大资料权限的工具。

扩展先依赖本插件和当前钉死的 Cordis/DSH 包，再注册后端；注册返回的清理函数
必须交给扩展作用域，不能在插件卸载后留下失效注册。

```ts
import type { Context } from '@deepseek-ai/cordis';
import type { RagSearchProvider } from 'dsh-zhen';

export const inject = ['zhenRag'];
export function apply(ctx: Context) {
  const provider: RagSearchProvider = {
    id: 'example-local',
    label: '示例本地检索',
    search(_query, scope) {
      // 示例委托原词法候选；实际后端可使用自己的本地召回策略。
      return scope.lexical();
    },
  };
  ctx.effect(() => ctx.zhenRag.register(provider));
}
```

`search(query, scope)` 可同步或异步，只返回 `{id, epoch}[]`，最多12条且不得重复。
不能返回自制正文、路径或引用位置。`scope.project` 和冻结的 `scope.collections`
仅包含当前会话目录所绑定、已允许向 Seedance 提供且另行允许会话检索的集合修订。
没有授权集合时不会调用后端。`scope.lexical()` 返回原词法候选编号，但不是后端
必须使用的候选池：另一种召回策略可以选取其他合法编号。

需要构建本地索引时，使用 `await scope.scan(cursor)`：首个游标为 `null`，每页
最多32条索引片段，返回 `{items, next}`；`next === null` 表示结束。每次读取都复核
当前目录、绑定和集合修订，并在只读事务中查询。只返回该授权范围内的规范化索引
正文和出处，不接受文件路径、SQL或任意项目参数。扫描不创建会话授权记录，也不会
自动把整页发送给模型；只有最终命中进入工具结果。资料是索引快照，不是实时文件。

这些函数仅在本次后端查询期间可用。查询结束、取消、超时、切换或注销后，保留的
函数不能继续读取。后续分页若发现授权/修订变化会失败。扩展应监听 `scope.signal`，
将本地缓存绑定空间、集合和修订，勿复用旧修订的命中。默认异步查询预算10秒；
同步CPU任务不能被异步计时器抢占，耗时计算应放入可终止的自有工作进程。

Host 插件是受信任本机代码。注册表不是文件、网络或进程沙箱，不自动批准第三方
插件安装或网络外发；本接口也不把集合的 Seedance 权限扩展到其他服务。后端仍须
遵守安装时的权限与网络策略。向量、OCR和画布语义检索属于后续独立实现。

本地索引在查询前后复核授权，并在同一自有SQLite事务中重新解析所有最终编号。
出现越权、过期、伪造正文或重复编号时整体拒绝，不写入部分新的会话授权。继续读取
来源仍需原会话授权。暂停或所选后端不可用时，含旧自动引用的会话在LLM传输前被拦截。

后端配置仅保存版本、ID和启用开关；按当前修订显式提交，旧窗口表单不能覆盖新设置。
缺少所选后端或损坏设置时显示不可用/修复状态，不静默改选。后端仅在当前Host
注册，扩展重新加载后需重新注册；已保存的选择保留。

固定错误包括 `RAG_PAUSED`、`RAG_BACKEND_UNAVAILABLE`、`RAG_CONFIGURATION_INVALID`、
`RAG_BACKEND_CHANGED`、`RAG_BACKEND_TIMEOUT`、`RAG_BACKEND_FAILED`、
`RAG_INVALID_RESULT`、`RAG_ACCESS_CHANGED` 和 `RAG_SETTINGS_CONFLICT`。
工具沿已发布 `HarnessError` 保留 `error.info.code`；界面只按固定代码显示说明，
不显示扩展抛出的原始异常详情。不得在异常、日志或缓存诊断中记录资料正文或凭据。

验证范围见 [0057决策](decisions/0057-replaceable-local-retrieval.md)。该合同不代表
已经验证任意第三方检索插件、真实浏览器交互或同步计算的强制时限。
