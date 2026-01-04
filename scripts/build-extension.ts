import fs from 'node:fs';
import path from 'node:path';

import esbuild from 'esbuild';

const useSourcemap =
  process.argv.some(
    (item) => item === '--sourcemap' || item === '--sourcemap=true',
  ) || false;

const isWatch = process.argv.includes('--watch');

const buildOptions: esbuild.BuildOptions = {
  entryPoints: ['./plugin/src/extension.ts'],
  outfile: 'out/extension.js',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  external: ['vscode'],
  sourcemap: useSourcemap,
};

// 复制资源文件
const copyDirs = [
  // [
  //   path.resolve(__dirname, '../web/out/'),
  //   path.resolve(__dirname, '../out/web/'),
  // ], // web
  [
    path.resolve(__dirname, '../plugin/templates/'),
    path.resolve(__dirname, '../out/templates/'),
  ], // 模板
  [
    path.resolve(__dirname, '../plugin/mindstudio-debug-vscode-plugin/'),
    path.resolve(__dirname, '../out/plugin/mindstudio-debug-vscode-plugin/'),
  ], // mindstudio-debug-vscode-plugin 插件
];

const copyAssets = () => {
  for (const [sourcePath, targetPath] of copyDirs) {
    if (fs.existsSync(sourcePath)) {
      // 确保目标目录的父目录存在
      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.rmSync(targetPath, { force: true, recursive: true });
      fs.cpSync(sourcePath, targetPath, { recursive: true });
    }
  }
};

(async () => {
  if (isWatch) {
    const ctx = await esbuild.context({
      ...buildOptions,
      plugins: [
        {
          name: 'watch-plugin',
          setup(build) {
            build.onEnd((result) => {
              if (result.errors.length > 0) {
                console.error('Build failed:', result.errors);
              } else {
                console.log('Build succeeded');
                copyAssets();
              }
            });
          },
        },
      ],
    });

    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    copyAssets();
  }
})();
