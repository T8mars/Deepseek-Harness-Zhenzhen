import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Entirely invented reference material. No user files, providers or embeddings.
export const qualityDocuments = [
  ['people/luochuan.md', '# EXAMPLE ONLY\n洛川的随身乐器是琵琶。服装为深蓝配色，徽章为银色。'],
  ['people/qinglan.md', '# EXAMPLE ONLY\n青岚使用横笛。服装为白色，徽章为金色。'],
  ['places/harbor.md', '# EXAMPLE ONLY\n潮汐港位于北岸。钟楼在港口入口，广场在南侧。'],
  ['boards/camera.md', '# EXAMPLE ONLY\n琵琶演奏分镜采用低角度推镜，先拍手部特写，再切全景。'],
  ['boards/light.md', '# EXAMPLE ONLY\n琵琶场景使用烛光和柔和侧光，背景保持暖色。'],
  ['boards/costume.md', '# EXAMPLE ONLY\n琵琶表演服装的袖口要收紧，避免遮挡指法。'],
  ['reference/long.md', '# EXAMPLE ONLY\n' + '琵琶参考甲。\n'.repeat(5200)],
  ['tech/connector.md', '# EXAMPLE ONLY\nMCP memory 保存创作记忆。\nEXAMPLE_MODEL_REF 使用 URI sample_asset。'],
  ['tech/assets.md', '# EXAMPLE ONLY\n资产 ID 使用固定编号；导出需要记录素材出处。'],
  ['tech/normalized.md', '# EXAMPLE ONLY\nＦｌａｓｈ ＭＣＰ 用于本例连接说明。'],
  ['reference/boundary.md', '# EXAMPLE ONLY\n' + '占位背景。'.repeat(316) + '星桦是一枚虚构道具。\n末尾。'],
  ['reference/citations.md', '# EXAMPLE ONLY\n' + '背景与镜头说明。\n'.repeat(260) + '霜桥是本例虚构场景。\n此处是结尾。'],
];

export const qualityQueries = [
  { id: 'diverse-sources', query: '琵琶', expected: ['people/luochuan.md', 'boards/camera.md', 'boards/light.md', 'boards/costume.md', 'reference/long.md'] },
  { id: 'two-keywords', query: '琵琶 分镜', expected: ['boards/camera.md'] },
  { id: 'person-instrument', query: '洛川 琵琶', expected: ['people/luochuan.md'] },
  { id: 'reverse-keywords', query: '琵琶 洛川', expected: ['people/luochuan.md'] },
  { id: 'short-name', query: '洛川', expected: ['people/luochuan.md'] },
  { id: 'single-character', query: '蓝', expected: ['people/luochuan.md'] },
  { id: 'other-instrument', query: '青岚 横笛', expected: ['people/qinglan.md'] },
  { id: 'place-name', query: '潮汐港', expected: ['places/harbor.md'] },
  { id: 'separated-words', query: '钟楼 北岸', expected: ['places/harbor.md'] },
  { id: 'latin-case', query: 'mcp MEMORY', expected: ['tech/connector.md'] },
  { id: 'identifier', query: 'EXAMPLE_MODEL_REF', expected: ['tech/connector.md'] },
  { id: 'latin-punctuation', query: 'uri:sample_asset', expected: ['tech/connector.md'] },
  { id: 'unicode-normalization', query: 'flash MCP', expected: ['tech/normalized.md'] },
  { id: 'mixed-script', query: '资产 ID', expected: ['tech/assets.md'] },
  { id: 'chunk-boundary', query: '星桦', expected: ['reference/boundary.md'] },
  { id: 'citation-location', query: '霜桥', expected: ['reference/citations.md'] },
  { id: 'absent-name', query: '未出现的银杏树', expected: [] },
  { id: 'absent-identifier', query: 'EXAMPLE_MISSING_ID', expected: [] },
  { id: 'no-implicit-or', query: '洛川 横笛', expected: [] },
  { id: 'fts-syntax-is-literal', query: '洛川 OR 横笛', expected: [] },
  { id: 'punctuation-only', query: '" * : ()', expected: [] },
];

export async function seedQualityCorpus(store, root, project = 'EXAMPLE_QUALITY_PROJECT') {
  for (const [file, body] of qualityDocuments) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), body, 'utf8');
  }
  const collection = await store.create(project, 'EXAMPLE_QUALITY_COLLECTION', root);
  const imported = await store.index(project, collection.id);
  if (imported.indexed !== qualityDocuments.length || imported.failed) throw new Error('Synthetic corpus import failed.');
  return collection;
}

export function evaluateQuality(store, project = 'EXAMPLE_QUALITY_PROJECT') {
  return qualityQueries.map(item => {
    const hits = store.search(project, item.query);
    const files = [...new Set(hits.map(hit => hit.path))];
    const correct = files.filter(file => item.expected.includes(file)).length;
    return { id: item.id, expected: item.expected, files, hits: hits.length,
      recall: item.expected.length ? correct / item.expected.length : null,
      precision: files.length ? correct / files.length : null,
      passed: files.length === item.expected.length && correct === files.length,
    };
  });
}
