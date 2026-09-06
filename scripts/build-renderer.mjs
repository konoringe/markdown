import { build } from 'esbuild';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src', 'renderer');
const outDir = path.join(root, 'dist', 'renderer');
const prod = process.argv.includes('--prod');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
copyFileSync(path.join(srcDir, 'index.html'), path.join(outDir, 'index.html'));

await build({
  entryPoints: [path.join(srcDir, 'app.js')],
  outfile: path.join(outDir, 'app.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome140',
  sourcemap: prod ? false : 'linked',
  minify: prod,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'info',
});
