import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers';
import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

import { debugEntry } from './vite-plugins/debug-entry';

/**
 * Static files that must appear in the packaged VSIX under `out/web/` with stable paths:
 * - package.json icons / font (branding, fonts)
 * - native tree SVGs loaded by the extension host (`OperateTreeProvider.getAssetIcon`) under `tree-icons/svg/`
 */
function copyPackagedStaticAssets(): Plugin {
  return {
    name: 'copy-packaged-static-assets',
    closeBundle() {
      const outWeb = path.resolve(__dirname, '../out/web');
      const flavorBranding = path.resolve(__dirname, '.flavor/branding');
      const defaultBranding = path.resolve(__dirname, 'src/assets/branding');
      const brandingSrc = fs.existsSync(flavorBranding) ? flavorBranding : defaultBranding;
      const brandingDest = path.join(outWeb, 'branding');
      const fontSrc = path.resolve(__dirname, 'src/assets/fonts/opdevtools-icons.woff');
      const fontDestDir = path.join(outWeb, 'fonts');
      const animatedSrc = path.resolve(__dirname, 'src/assets/svg/animated');
      const animatedDest = path.join(outWeb, 'tree-icons', 'svg', 'animated');

      if (fs.existsSync(brandingSrc)) {
        fs.mkdirSync(brandingDest, { recursive: true });
        fs.cpSync(brandingSrc, brandingDest, { recursive: true });
      }

      fs.mkdirSync(fontDestDir, { recursive: true });

      if (fs.existsSync(fontSrc)) {
        fs.copyFileSync(fontSrc, path.join(fontDestDir, 'opdevtools-icons.woff'));
      }
      else {
        console.warn('[vite] Missing src/assets/fonts/opdevtools-icons.woff — run pnpm run build:icons-font from repo root');
      }

      if (fs.existsSync(animatedSrc)) {
        fs.mkdirSync(animatedDest, { recursive: true });
        fs.cpSync(animatedSrc, animatedDest, { recursive: true });
      }
      else {
        console.warn('[vite] Missing src/assets/svg/animated — native tree animated icons will not be packaged');
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const buildInput: Record<string, string> = {};

  // 动态读取 views 目录下的所有符合规则的入口
  const viewsDir = path.resolve(__dirname, 'src/views');

  // 递归扫描 panels 和 sidebars 目录
  const scanDir = (dir: string, prefix: string = '') => {
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
      const entryPath = path.join(dir, entry);

      if (!fs.statSync(entryPath)
        .isDirectory()) {
        continue;
      }

      const htmlPath = path.join(entryPath, `${entry}.html`);

      if (fs.existsSync(htmlPath)) {
        const key = prefix ? `${prefix}-${entry}` : entry;

        buildInput[key] = path.relative(__dirname, htmlPath)
          .replace(/\\/g, '/');
      }
    }
  };

  // 扫描 panels 和 sidebars
  const panelsDir = path.join(viewsDir, 'panels');
  const sidebarsDir = path.join(viewsDir, 'sidebars');

  if (fs.existsSync(panelsDir)) {
    scanDir(panelsDir, 'panels');
  }

  if (fs.existsSync(sidebarsDir)) {
    scanDir(sidebarsDir, 'sidebars');
  }

  return {
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@web': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, '../shared'),
        '@huawei/profiling-report': path.resolve(__dirname, '../profiling-report/src'),
      },
    },
    plugins: [
      vue(),
      Components({
        resolvers: [
          AntDesignVueResolver({
            // css in js
            importStyle: false,
          }),
        ],
      }),
      debugEntry(),
      copyPackagedStaticAssets(),
    ],
    server: { cors: true },
    build: {
      outDir: '../out/web',
      emptyOutDir: true,
      assetsDir: 'assets',
      sourcemap: mode === 'debug' || mode === 'readable',
      minify: mode !== 'readable',
      rolldownOptions: { input: buildInput },
    },
  };
});
