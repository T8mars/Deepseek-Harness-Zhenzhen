import React from 'react';
import type {KnowledgeImportReport, KnowledgeImportIssue} from 'dsh-zhen';

const reasons: Record<KnowledgeImportIssue['code'], string> = {
  HIDDEN_OR_LINK: '隐藏条目或链接，已跳过',
  EXCLUDED_DIRECTORY: '依赖或构建目录，已跳过',
  UNSUPPORTED_FORMAT: '暂不支持的文件格式',
  FILE_TOO_LARGE: '超过单文件 2 MiB 上限，请拆分后导入',
  SOURCE_CHANGED: '读取时文件或路径发生变化，请核对后更新索引',
  NON_TEXT: '文件含二进制内容，无法作为文本导入',
  NO_TEXT: '没有提取到可索引正文；扫描 PDF 需要文字层',
  FILE_READ_FAILED: '文件无法读取，请检查是否仍存在及本机读取权限',
  DOCUMENT_LIMIT: '文档页数、压缩内容或提取文本超出支持上限',
  DOCUMENT_PASSWORD: 'PDF 需要密码，请另存无密码副本后导入',
  DOCUMENT_UNSUPPORTED: '文档包含暂不支持的类型或内容',
  DOCUMENT_INVALID: '文档损坏、加密或格式无法解析',
  DECODE_TIMEOUT: '本机解析超时，请检查文档后更新索引',
  DECODER_BUSY: '本机解析队列已满，请稍后更新索引',
  TEXT_ENCODING: '文本不是有效的 UTF-8，请转换编码后导入',
};

/** Owner-only report. React escapes file names; no parser messages or document bodies. */
export function ImportReport({report}: {report: KnowledgeImportReport}): React.ReactElement {
  return <div className="zhen-margin" aria-label="导入详情">
    <h3>上次导入详情</h3>
    <p>检查 {report.examined} 项 · 已索引 {report.indexed} 个文件 · 跳过 {report.skipped} 项 · 失败 {report.failed} 项</p>
    {report.issues.length ? <ul>{report.issues.map((issue, index) => <li key={index} className="zhen-margin">
      <div className="zhen-source-path">{issue.path}{issue.pathTruncated && '…（名称已截短）'}</div>
      <span>{issue.outcome === 'skipped' ? '跳过' : '失败'}：{reasons[issue.code]}</span>
    </li>)}</ul> : <p>没有跳过或失败的条目。</p>}
    {report.omitted > 0 && <p>仅展示前 {report.issues.length} 条问题，另有 {report.omitted} 项未展开。</p>}
    <p className="zhen-muted">相对路径以此集合文件夹为起点。报告仅在当前运行期间保留；更新索引或更改权限后，旧报告失效。</p>
  </div>;
}
