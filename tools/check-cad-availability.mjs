import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Missing implementations are NOT passing CAD tests. Only a complete set of
// entrypoints enables those jobs. Reject partially uploaded extensions.
export function inspectCadAvailability(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const groups = {
    cad: [
      ['tools/vendor-cad.mjs', fs.existsSync(path.join(root, 'tools/vendor-cad.mjs'))],
      ['tools/verify-cad.sh', fs.existsSync(path.join(root, 'tools/verify-cad.sh'))],
      ['package.json scripts.vendor:cad', typeof pkg.scripts?.['vendor:cad'] === 'string']
    ],
    archive: [
      ['tools/native-archive-fixtures.mjs', fs.existsSync(path.join(root, 'tools/native-archive-fixtures.mjs'))],
      ['tests/NativeArchiveVerify.cs', fs.existsSync(path.join(root, 'tests/NativeArchiveVerify.cs'))]
    ]
  };
  const result = {};
  for (const [key, entries] of Object.entries(groups)) {
    const present = entries.filter(([, exists]) => exists).map(([name]) => name);
    const missing = entries.filter(([, exists]) => !exists).map(([name]) => name);
    if (present.length && missing.length) {
      throw new Error(`Incomplete ${key} source upload: missing ${missing.join(', ')}`);
    }
    result[key] = { available: missing.length === 0, present, missing };
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const report = inspectCadAvailability(root);
  console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
      Object.entries(report).map(([key, value]) => `${key}=${value.available}\n`).join(''));
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '## CAD source recovery status\n\n' + Object.entries(report).map(([key, value]) =>
        `- **${key}**: ${value.available ? 'entrypoints present; dedicated tests required' : 'source unavailable; compatibility NOT verified'}.\n`).join('') +
      '\nThe application suite tests the committed modeler and final renderer. A skipped extension job is not a passed compatibility test. See `docs/RECOVERY-AUDIT.md`.\n');
  }
}
