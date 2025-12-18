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

// 复制资源文件
const copyDirs = [
  [path.resolve(__dirname, '../plugin/shells'), path.resolve(__dirname, '../out/shells')], // 脚本
  [path.resolve(__dirname, '../plugin/templates'), path.resolve(__dirname, '../out/templates')], // 模板
  [path.resolve(__dirname, '../plugin/insight-vscode-plugin'), path.resolve(__dirname, '../out/insight-vscode-plugin')], // 模板
];

for (const [sourcePath, targetPath] of copyDirs) {
  fs.rmSync(targetPath, { force: true, recursive: true });
  fs.cpSync(sourcePath, targetPath, { recursive: true });
}
