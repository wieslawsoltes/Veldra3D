import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectCadAvailability } from '../tools/check-cad-availability.mjs';

function fixture(t, files = [], scripts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'veldra-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), '// fixture, not implementation\n');
  }
  return root;
}

test('absent CAD source is unavailable, not a passing compatibility claim', t => {
  const report = inspectCadAvailability(fixture(t));
  assert.equal(report.cad.available, false);
  assert.equal(report.archive.available, false);
  assert.equal(report.cad.missing.length, 3);
  assert.equal(report.archive.missing.length, 2);
});
test('a partial CAD script upload is rejected', t => {
  assert.throws(() => inspectCadAvailability(fixture(t, ['tools/verify-cad.sh'])), /Incomplete cad/);
});
test('a CAD package script without its implementation is rejected', t => {
  assert.throws(() => inspectCadAvailability(fixture(t, [], { 'vendor:cad': 'node tools/vendor-cad.mjs' })), /Incomplete cad/);
});
test('a partial native archive verifier is rejected', t => {
  assert.throws(() => inspectCadAvailability(fixture(t, ['tests/NativeArchiveVerify.cs'])), /Incomplete archive/);
});
test('complete CAD and native archive entrypoints enable their dedicated test jobs', t => {
  const root = fixture(t, ['tools/vendor-cad.mjs', 'tools/verify-cad.sh', 'tools/native-archive-fixtures.mjs', 'tests/NativeArchiveVerify.cs'], { 'vendor:cad': 'node tools/vendor-cad.mjs' });
  const report = inspectCadAvailability(root);
  assert.equal(report.cad.available, true);
  assert.equal(report.archive.available, true);
});
