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

// 复制脚本文件
const sourcePath = path.resolve(__dirname, '../plugin/shell');
const targetPath = path.resolve(__dirname, '../out/shell');

fs.rmSync(targetPath, { force: true, recursive: true });
fs.cpSync(sourcePath, targetPath, { recursive: true });
