import fs from 'node:fs';
import path from 'node:path';

import AdmZip from 'adm-zip';
import esbuild from 'esbuild';

const useSourcemap =
  process.argv.some((item) => item === '--sourcemap' || item === '--sourcemap=true') || false;

const isWatch = process.argv.includes('--watch');
const isReadable = process.argv.includes('--readable');

const buildOptions: esbuild.BuildOptions = {
  entryPoints: ['./plugin/src/extension.ts'],
  outfile: 'out/extension.js',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  external: ['vscode'],
  sourcemap: useSourcemap, // Only enabled with --sourcemap flag
  keepNames: isReadable,
  plugins: [
    {
      // jsonc-parser's package "main" is its UMD build, which requires
      // ./impl/format etc. through a bare `require` that esbuild does not
      // rewrite — the extension host then dies at activation with
      // "Cannot find module './impl/format'". Bundle the ESM build instead.
      name: 'jsonc-parser-esm',
      setup(build) {
        build.onResolve({ filter: /^jsonc-parser$/ }, () => ({ path: path.resolve(__dirname, '../plugin/node_modules/jsonc-parser/lib/esm/main.js') }));
      },
    },
    {
      name: 'resolve-paths',
      setup(build) {
        // 解析 @plugin/* 和 @shared/* 别名
        build.onResolve({ filter: /^@plugin\// }, (args) => {
          const resolved = path.resolve(__dirname, '../plugin/src', args.path.replace(/^@plugin\//, ''));

          // 尝试文件或目录
          if (fs.existsSync(resolved + '.ts')) {
            return {
              path: resolved + '.ts',
              namespace: 'file',
            };
          }

          if (fs.existsSync(path.join(resolved, 'index.ts'))) {
            return {
              path: path.join(resolved, 'index.ts'),
              namespace: 'file',
            };
          }

          return {
            path: resolved + '.ts',
            namespace: 'file',
          };
        });
        build.onResolve({ filter: /^@shared\// }, (args) => {
          const resolved = path.resolve(__dirname, '../shared', args.path.replace(/^@shared\//, ''));

          // 尝试 .ts 和 /index.ts
          if (fs.existsSync(resolved + '.ts')) {
            return {
              path: resolved + '.ts',
              namespace: 'file',
            };
          }

          if (fs.existsSync(path.join(resolved, 'index.ts'))) {
            return {
              path: path.join(resolved, 'index.ts'),
              namespace: 'file',
            };
          }

          return {
            path: resolved + '.ts',
            namespace: 'file',
          };
        });
      },
    },
  ],
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
  for (const [
    sourcePath,
    targetPath,
  ] of copyDirs) {
    if (fs.existsSync(sourcePath)) {
      // 确保目标目录的父目录存在
      const targetDir = path.dirname(targetPath);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      fs.rmSync(targetPath, {
        force: true,
        recursive: true,
      });
      fs.cpSync(sourcePath, targetPath, { recursive: true });
    }
  }
};

const outTemplatesRoot = path.resolve(__dirname, '../out/templates/');

// Source templates are plain folders under plugin/templates/code_template/<group>/<name>/.
// Runtime still expects flat .zip archives under out/templates (see OpGeneratorFactory).
// After copying into out/, pack each template directory into "<name>.zip" and remove the folder.
function packCodeTemplateSourceDirsToZips(templatesRoot: string) {
  const codeTemplateRoot = path.join(templatesRoot, 'code_template');

  if (!fs.existsSync(codeTemplateRoot)) {
    console.warn('[build-extension] code_template missing under', templatesRoot);

    return;
  }

  const filterZipPath = (zipEntryPath: string) => {
    const parts = zipEntryPath.split(/[/\\]/);

    return !parts.some((p) => p === '.DS_Store');
  };

  const groups = [
    'cann_template',
    'ascend_template',
    'triton_template',
  ] as const;

  for (const group of groups) {
    const groupDir = path.join(codeTemplateRoot, group);

    if (!fs.existsSync(groupDir)) {
      continue;
    }

    for (const name of fs.readdirSync(groupDir)) {
      const dirPath = path.join(groupDir, name);
      const dirStat = fs.statSync(dirPath);

      if (!dirStat.isDirectory()) {
        continue;
      }

      const outZip = path.join(groupDir, `${name}.zip`);
      const zip = new AdmZip();

      zip.addLocalFolder(dirPath, '', filterZipPath);
      zip.writeZip(outZip);
      fs.rmSync(dirPath, {
        force: true,
        recursive: true,
      });
      console.log('[build-extension] packed code template', path.relative(templatesRoot, outZip));
    }
  }
}

function copyAndPrepareTemplates() {
  copyAssets();
  packCodeTemplateSourceDirsToZips(outTemplatesRoot);
}

/**
 * A previous --sourcemap build leaves out/extension.js.map behind and a
 * regular build only overwrites extension.js — the stale map would then be
 * packaged into the vsix. Drop it unless this build produces its own.
 */
function removeStaleSourceMap() {
  if (!useSourcemap) {
    fs.rmSync(path.resolve(__dirname, '../out/extension.js.map'), { force: true });
  }
}

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
              }
              else {
                console.log('Build succeeded');
                copyAndPrepareTemplates();
              }
            });
          },
        },
      ],
    });

    await ctx.watch();
    console.log('Watching for changes...');
  }
  else {
    await esbuild.build(buildOptions);
    removeStaleSourceMap();
    copyAndPrepareTemplates();
  }
})();
