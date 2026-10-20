import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {captureProfile} from '../scripts/upstream-inspect.mjs';
import {profileChanges,pendingReviews} from '../scripts/upstream-policy.mjs';
import {acknowledgments} from '../scripts/validate-upstream.mjs';
import {parse} from 'yaml';
test('C15: published Web profile rows match observed baseline and new source changes require concrete reviews',async()=>{
  const baseline=JSON.parse(readFileSync('contracts/upstream-baseline.json'));
  const lock=JSON.parse(readFileSync('UPSTREAM.lock.json'));
  assert.equal(baseline.dsh.version,lock.dsh.version);assert.equal(baseline.dsh.commit,lock.dsh.commit);assert.equal(baseline.observationsOnly,true);
  assert.deepEqual(profileChanges(baseline.webRows,await captureProfile(process.cwd())),[],'Upstream Web row/name/config-key shape changed; prepare and review the delta.');
  if(existsSync('UPSTREAM.prepared.json')){
    const plan=JSON.parse(readFileSync('UPSTREAM.prepared.json'));assert.equal(plan.target.commit,lock.dsh.commit);
    const prior=new Set(plan.previousBaseline.webRows.map(item=>item.id)),current=new Set(baseline.webRows.map(item=>item.id));
    for(const patch of parse(readFileSync('packages/dsh-zhen/cordis.patch.yml','utf8')))if(patch.id&&prior.has(patch.id))assert.ok(current.has(patch.id),`Overridden upstream row disappeared: ${patch.id}; update the owned patch and contracts.`);
    assert.deepEqual(pendingReviews(plan,await acknowledgments(process.cwd())),[],'Review changed guides and profile rows before promotion.');
  }
});
