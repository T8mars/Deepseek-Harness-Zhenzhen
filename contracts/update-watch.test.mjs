import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { candidateRecord } from '../scripts/update-watch.mjs';

test('candidate PR record excludes failures and carries exact immutable evidence without activating updates', () => {
  const result = candidateRecord([
    { id: 'dsh', current: '0.2.1-rc.2', available: '0.2.2-rc.1', revision: 'sha512-EXAMPLE_ONLY', url: 'https://example.invalid', changed: true, state: 'checked' },
    { id: 'canvas', current: '3.3.6', available: '', revision: '', changed: true, state: 'error' },
  ]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.activation, 'requires-contracts-and-review');
});

test('candidate workflow never runs untrusted PR code with write credentials or gateway secrets', () => {
  const raw = readFileSync('.github/workflows/upstream-watch.yml', 'utf8');
  const workflow = parse(raw);
  assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch']);
  assert.equal(raw.includes('SEEDANCE_API_KEY'), false);
  assert.deepEqual(workflow.jobs.prepare.permissions,{contents:'read'});
  assert.equal(workflow.jobs.publish.permissions.contents,'write');
  assert.equal(workflow.jobs.publish.steps.some(step=>/npm |npm\n|prepare-upstream|npm ci/.test(step.run??'')),false);
  for (const job of Object.values(workflow.jobs)) for (const step of job.steps) {
    if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
    if (step.uses?.startsWith('actions/checkout@')) assert.equal(step.with['persist-credentials'],false);
  }
});
