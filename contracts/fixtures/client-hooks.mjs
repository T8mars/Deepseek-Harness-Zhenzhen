import assert from 'node:assert/strict';
// Component-handler unit harness only. It is not a DOM, browser or UI acceptance test.
export function clientHooks(Component, props) {
 const slots = [], pending = [];
 let cursor = 0;
 const slot = kind => {
  const index = cursor++;
  if (!slots[index]) slots[index] = {kind};
  assert.equal(slots[index].kind, kind);
  return slots[index];
 };
 const driver = {
  props,
  state(initial) {const item = slot('state'); if (!('value' in item)) item.value = typeof initial === 'function' ? initial() : initial; return [item.value, next => {item.value = typeof next === 'function' ? next(item.value) : next;}];},
  ref(initial) {const item = slot('ref'); return item.value ??= {current: initial};},
  id() {const item = slot('id'); return item.value ??= 'EXAMPLE_FIELD_' + cursor;},
  effect(run, deps) {const item = slot('effect'); if (!item.deps || deps.some((value, index) => !Object.is(value, item.deps[index]))) {item.deps = deps; pending.push(() => {item.cleanup?.(); item.cleanup = run();});}},
  render(next = driver.props) {
   driver.props = next; cursor = 0;
   globalThis.__DSH_EXAMPLE_TARGET_HOOKS = driver;
   let tree;
   try {tree = Component(next);} finally {delete globalThis.__DSH_EXAMPLE_TARGET_HOOKS;}
   for (const run of pending.splice(0)) run();
   return tree;
  },
  async settle() {for (let index = 0; index < 6; index++) await new Promise(done => setImmediate(done));},
  dispose() {for (const item of slots.toReversed()) item.cleanup?.();},
 };
 return driver;
}
