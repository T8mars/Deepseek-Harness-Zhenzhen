import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

// Positive test packages must match both the reviewed project pin and the
// published SDK actually installed in this checkout. This grants no exemption.
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const lock=read(new URL('../../UPSTREAM.lock.json',import.meta.url));
const workspace=read(new URL('../../package.json',import.meta.url));
const installed=read(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
assert.equal(installed.version,lock.dsh.version,'Test runtime differs from the reviewed upstream pin.');
assert.equal(workspace.dependencies['@deepseek-ai/dsh'],installed.version,'Test runtime differs from the exact workspace dependency.');
export const PINNED_DSH_VERSION=installed.version;
