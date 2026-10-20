import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, rename } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalSkills } from '../lib/local-skills.js';
import { LOCAL_SKILL_POLICY } from '../lib/local-skills-schema.js';

const text = (name = 'example-creative', body = 'EXAMPLE_ONLY_BODY', fields = '') => `---\nname: ${name}\ndescription: "EXAMPLE ONLY creator skill"\n${fields}---\n\n${body}\n`;
async function fixture() {
  const root = realpathSync.native(await mkdtemp(join(tmpdir(), 'dsh-zhen-local-skills-')));
  const store = new LocalSkills(join(root, 'local-skills.json'), 50);
  return { root, store, async close() { store.close(); const rel = relative(realpathSync.native(tmpdir()), realpathSync.native(root)); assert.ok(rel && !isAbsolute(rel) && !rel.startsWith('..')); await rm(root, { recursive: true, force: true }); } };
}
async function skill(folder, name, body, fields) { await mkdir(folder, { recursive: true }); await writeFile(join(folder, 'SKILL.md'), text(name, body, fields)); }
async function connect(store, folder, mode = 'skill') { const draft = await store.preview(folder, mode); await store.connect(folder, mode, draft.digest, LOCAL_SKILL_POLICY); return draft; }

test('single local skill preserves original body/resource location, invocation flags and license without installing or executing resources', async () => {
  const f = await fixture(), folder = join(f.root, 'example-source');
  try {
    await skill(folder, 'example-creative', '参阅 references/guide.md，脚本在 scripts/example.mjs。', 'disable-model-invocation: true\nuser-invocable: true\nlicense: EXAMPLE_CUSTOM_LICENSE\n');
    await mkdir(join(folder, 'references')); await mkdir(join(folder, 'scripts'));
    await writeFile(join(folder, 'references', 'guide.md'), 'EXAMPLE_REFERENCE');
    await writeFile(join(folder, 'scripts', 'example.mjs'), 'throw new Error("EXAMPLE_MUST_NOT_EXECUTE");');
    const original = await readFile(join(folder, 'SKILL.md'));
    const draft = await f.store.preview(folder, 'skill'); assert.equal(draft.entries.length, 1); assert.equal((await f.store.list()).length, 0);
    await assert.rejects(f.store.connect(folder, 'skill', draft.digest, 'EXAMPLE_WRONG_POLICY'));
    await f.store.connect(folder, 'skill', draft.digest, LOCAL_SKILL_POLICY);
    const provider = f.store.provider(), candidates = await provider.list({});
    assert.equal(candidates.length, 1);
    const definition = await provider.get(candidates[0], {});
    assert.deepEqual(definition.resourceBase, { kind: 'directory', path: folder });
    assert.equal(definition.invocation.modelInvocable, false); assert.equal(definition.invocation.userInvocable, true);
    assert.match(definition.content, /references\/guide.md/);
    assert.equal(await readFile(join(definition.resourceBase.path, 'references', 'guide.md'), 'utf8'), 'EXAMPLE_REFERENCE');
    assert.deepEqual(await readFile(join(folder, 'SKILL.md')), original);
    assert.equal((await readFile(join(f.root, 'local-skills.json'), 'utf8')).includes('EXAMPLE_CUSTOM_LICENSE'), false, 'local metadata must not relicense or copy the package');
  } finally { await f.close(); }
});

test('changed preview needs fresh consent while trusted subsequent edits become new loads and stale candidates cannot load', async () => {
  const f = await fixture(), folder = join(f.root, 'example-source');
  try {
    await skill(folder, 'example-creative', 'EXAMPLE_OLD'); const draft = await f.store.preview(folder, 'skill');
    await skill(folder, 'example-creative', 'EXAMPLE_NEW');
    await assert.rejects(f.store.connect(folder, 'skill', draft.digest, LOCAL_SKILL_POLICY), /变化/);
    await connect(f.store, folder);
    const provider = f.store.provider(), [old] = await provider.list({});
    await skill(folder, 'example-creative', 'EXAMPLE_LATER');
    assert.equal(await provider.get(old, {}), undefined);
    const [fresh] = await provider.list({}); assert.match((await provider.get(fresh, {})).content, /EXAMPLE_LATER/);
    const [view] = await f.store.list(); f.store.disable(view.source.id);
    assert.deepEqual(await provider.list({}), []); assert.equal(await provider.get(fresh, {}), undefined);
    const latest = await connect(f.store, folder); assert.notEqual(latest.digest, draft.digest);
    f.store.disconnect(view.source.id); assert.deepEqual(await f.store.list(), []);
    assert.match(await readFile(join(folder, 'SKILL.md'), 'utf8'), /EXAMPLE_LATER/);
  } finally { await f.close(); }
});

test('library reads only one-level SKILL.md definitions, skips links/hidden entries and keeps malformed entries out of discovery', async () => {
  const f = await fixture(), library = join(f.root, 'library'), outside = join(f.root, 'outside');
  try {
    await skill(join(library, 'one'), 'example-one', 'EXAMPLE_ONE');
    await skill(join(library, '.hidden'), 'example-hidden', 'EXAMPLE_HIDDEN');
    await skill(outside, 'example-outside', 'EXAMPLE_OUTSIDE');
    await symlink(outside, join(library, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await mkdir(join(library, 'invalid')); await writeFile(join(library, 'invalid', 'SKILL.md'), 'EXAMPLE_NO_FRONTMATTER');
    await mkdir(join(library, 'nested', 'two'), { recursive: true }); await skill(join(library, 'nested', 'two'), 'example-too-deep', 'EXAMPLE_TOO_DEEP');
    await writeFile(join(library, 'README.md'), 'EXAMPLE_NOT_A_SKILL');
    const draft = await connect(f.store, library, 'library');
    assert.deepEqual(draft.entries.map(entry => entry.name), ['example-one']); assert.equal(draft.problems, 2); assert.equal(draft.skipped, 3);
    const all = await f.store.provider().list({}); assert.deepEqual(all.map(entry => entry.name), ['example-one']);
    await assert.rejects(f.store.body(library, '../outside', draft.entries[0].digest));
  } finally { await f.close(); }
});

test('invalid UTF-8, custom tags, oversized files and legacy fields are rejected while ordinary YAML aliases and CRLF work', async () => {
  const f = await fixture(), folder = join(f.root, 'example-source');
  try {
    await mkdir(folder);
    const samples = [Buffer.from([0xff, 0xfe]), text('example-skill', 'x'.repeat(131073)), '---\nname: example-name\ndescription: !EXAMPLE_PRIVATE_TAG value\n---\nEXAMPLE_BODY', text('example-skill', 'EXAMPLE_BODY', 'modelInvocable: true\n')];
    for (const bytes of samples) {
      await writeFile(join(folder, 'SKILL.md'), bytes);
      const draft = await f.store.preview(folder, 'skill'); assert.equal(draft.entries.length, 0); assert.equal(draft.problems, 1);
    }
    await writeFile(join(folder, 'SKILL.md'), text('example-skill', 'EXAMPLE_BODY').replaceAll('\n', '\r\n'));
    assert.equal((await f.store.preview(folder, 'skill')).entries.length, 1);
    await writeFile(join(folder, 'SKILL.md'), '---\nname: &x example-name\ndescription: *x\n---\nEXAMPLE_BODY');
    assert.equal((await f.store.preview(folder, 'skill')).entries.length, 1);
  } finally { await f.close(); }
});

test('root replacement is refused until new preview/confirmation even when the instruction bytes match', async () => {
  const f = await fixture(), folder = join(f.root, 'example-source'), retained = join(f.root, 'retained-source');
  try {
    await skill(folder, 'example-one', 'EXAMPLE_BODY'); await connect(f.store, folder);
    const provider = f.store.provider(), [candidate] = await provider.list({});
    assert.ok(relative(f.root, folder) && !isAbsolute(relative(f.root, retained)) && !relative(f.root, retained).startsWith('..'));
    await rename(folder, retained); await skill(folder, 'example-one', 'EXAMPLE_BODY');
    assert.equal((await f.store.list())[0].state, 'unavailable'); assert.equal(await provider.get(candidate, {}), undefined);
    await connect(f.store, folder); assert.equal((await provider.list({})).length, 1);
    assert.match(await readFile(join(retained, 'SKILL.md'), 'utf8'), /EXAMPLE_BODY/);
  } finally { await f.close(); }
});

test('disconnect or disable during an asynchronous body read cannot return the previously authorized definition', async () => {
  const f = await fixture(), folder = join(f.root, 'example-source');
  try {
    await skill(folder, 'example-one', 'EXAMPLE_BODY'); await connect(f.store, folder);
    const [view] = await f.store.list(), provider = f.store.provider(), [candidate] = await provider.list({});
    const read = f.store.body.bind(f.store), entered = Promise.withResolvers(), release = Promise.withResolvers();
    f.store.body = async (...args) => { const value = await read(...args); entered.resolve(); await release.promise; return value; };
    const loading = provider.get(candidate, {}); await entered.promise;
    f.store.disable(view.source.id); release.resolve(); assert.equal(await loading, undefined);
  } finally { await f.close(); }
});

test('duplicate local names select the earlier connected source and a disconnect releases the next source', async () => {
  const f = await fixture(), a = join(f.root, 'source-a'), b = join(f.root, 'source-b');
  try {
    await skill(a, 'example-same', 'EXAMPLE_FIRST'); await skill(b, 'example-same', 'EXAMPLE_SECOND');
    await connect(f.store, a); await connect(f.store, b);
    const provider = f.store.provider(), views = await f.store.list(); assert.equal(views[1].entries[0].shadowed, true);
    let candidates = await provider.list({}); assert.equal(candidates.length, 1); assert.match((await provider.get(candidates[0], {})).content, /EXAMPLE_FIRST/);
    f.store.disconnect(views[0].source.id); candidates = await provider.list({}); assert.match((await provider.get(candidates[0], {})).content, /EXAMPLE_SECOND/);
  } finally { await f.close(); }
});

test('local directory consent survives reopen without changing the original source and disabled roots are not scanned', async () => {
  const f = await fixture(), folder = join(f.root, 'example-source');
  let reopened;
  try {
    await skill(folder, 'example-one', 'EXAMPLE_BODY'); await connect(f.store, folder);
    const [view] = await f.store.list(); f.store.disable(view.source.id); f.store.close();
    reopened = new LocalSkills(join(f.root, 'local-skills.json'), 50);
    await rm(join(folder, 'SKILL.md'));
    assert.equal((await reopened.list())[0].state, 'disabled'); assert.deepEqual(await reopened.provider().list({}), []);
    assert.ok((await readFile(join(f.root, 'local-skills.json'), 'utf8')).includes(LOCAL_SKILL_POLICY));
  } finally { reopened?.close(); await f.close(); }
});
