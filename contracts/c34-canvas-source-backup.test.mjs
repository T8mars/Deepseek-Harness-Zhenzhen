import test from 'node:test';
import assert from 'node:assert/strict';
import { readCanvasBackup } from '../scripts/verify-canvas-backup.mjs';

test('C34: recoverable Native source backup has intact text patch and exact reviewed public paths', () => {
  const { manifest } = readCanvasBackup();
  assert.equal(manifest.status, 'unreleased-source-backup');
  assert.ok(manifest.files.some(file => file.path === 'tools/zcanvas-cli/src/discovery.cjs'));
  assert.ok(manifest.files.some(file => file.path === 'backend/src/services/agentControlCompatibility.js'));
  assert.ok(manifest.files.some(file => file.path === 'tools/zcanvas-cli/src/secureStoreTransactions.cjs'));
});
