import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function packageFile(name, path) { return readFileSync(resolve(dirname(require.resolve(`${name}/package.json`)), path), 'utf8'); }

test('C6: every registered slot exists in the pinned published slot contract', () => {
  const source = readFileSync('packages/dsh-zhen/src/client/index.tsx', 'utf8');
  const registered = [...source.matchAll(/slots\.register\(\{ name: '([^']+)'/g)].map(match => match[1]);
  const declarations = [
    packageFile('@deepseek-ai/dsh-client-ui-layout', 'lib/types/client/index.d.ts'),
    packageFile('@deepseek-ai/dsh-client-ui-sidebar', 'lib/types/client/contract/slots.d.ts'),
    packageFile('@deepseek-ai/dsh-client-ui-conversation', 'lib/types/client/contract/slots.d.ts'),
    packageFile('@deepseek-ai/dsh-client-ui-tool', 'lib/types/client/contract/slots.d.ts'),
  ].join('\n');
  for (const slot of registered) assert.ok(declarations.includes(`'${slot}':`), slot);
  assert.ok(registered.includes('main'));
});

function luminance(hex) {
  const rgb = hex.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function ratio(a,b) { const values = [luminance(a), luminance(b)].sort((a,b) => b-a); return (values[0] + .05) / (values[1] + .05); }
test('C7: text and primary actions pass contrast on all four required surfaces', () => {
  const ragCss = readFileSync('packages/dsh-zhen/src/client/rag.css', 'utf8');
  const modes = [...ragCss.matchAll(/--zr-bg:(#[A-Fa-f0-9]{6});--zr-text:(#[A-Fa-f0-9]{6});--zr-muted:(#[A-Fa-f0-9]{6});--zr-control:(#[A-Fa-f0-9]{6});--zr-focus:(#[A-Fa-f0-9]{6})/g)];
  assert.equal(modes.length, 2);
  for (const mode of modes) {
    for (const fg of [mode[2], mode[3]]) assert.ok(ratio(mode[1], fg) >= 4.5);
    for (const fg of [mode[4], mode[5]]) assert.ok(ratio(mode[1], fg) >= 3);
  }
  for (const background of ['#F4F9FA', '#FFFFFF']) for (const foreground of ['#0B1F26', '#435C65', '#0F5B6B']) assert.ok(ratio(background, foreground) >= 4.5, `${foreground} on ${background}`);
  for (const background of ['#0A1418', '#14242A']) for (const foreground of ['#EAF5F7', '#B5CDD3', '#7AD3DD']) assert.ok(ratio(background, foreground) >= 4.5, `${foreground} on ${background}`);
  assert.ok(ratio('#0F5B6B', '#FFFFFF') >= 4.5);
  assert.ok(ratio('#7AD3DD', '#0A1418') >= 4.5);
  for (const background of ['#F4F9FA', '#FFFFFF']) assert.ok(ratio(background, '#647F88') >= 3);
  for (const background of ['#0A1418', '#14242A']) assert.ok(ratio(background, '#76959F') >= 3);
});
