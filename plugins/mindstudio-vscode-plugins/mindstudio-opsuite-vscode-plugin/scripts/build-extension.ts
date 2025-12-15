import fs from 'node:fs';
import path from 'node:path';

import esbuild from 'esbuild';

const useSourcemap = process.argv.some((item) => item === '--sourcemap' || item === '--sourcemap=true') || false;

esbuild.build({
  entryPoints: ['./plugin/src/extension.ts'],
  outfile: 'out/extension.js',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  external: ['vscode'],
  sourcemap: useSourcemap,
});

const sourcePath = path.resolve(__dirname, '../plugin/register_extension.sh');
const targetPath = path.resolve(__dirname, '../out/register_extension.sh');

fs.rmSync(targetPath, { force: true });
fs.cpSync(sourcePath, targetPath);
