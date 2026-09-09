import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, '_site');
const standalone = path.join(root, 'dist', 'Veldra3D.html');
if (!fs.existsSync(standalone)) throw new Error('Run npm run build before staging Pages.');
fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(site, { recursive: true });
for (const name of ['index.html', 'styles.css', 'src', 'examples', 'docs', 'LICENSE', 'README.md']) {
  fs.cpSync(path.join(root, name), path.join(site, name), { recursive: true });
}
fs.copyFileSync(standalone, path.join(site, 'Veldra3D.html'));
fs.mkdirSync(path.join(site, 'tests'), { recursive: true });
fs.copyFileSync(path.join(root, 'tests', 'gpu.html'), path.join(site, 'tests', 'gpu.html'));
fs.writeFileSync(path.join(site, '.nojekyll'), '');
fs.writeFileSync(path.join(site, 'build-info.json'), JSON.stringify({
  application: 'Veldra 3D',
  version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  commit: process.env.SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? null,
  repository: process.env.GITHUB_REPOSITORY ?? 'wieslawsoltes/Veldra3D'
}, null, 2) + '\n');
console.log('Staged GitHub Pages site in _site/');
