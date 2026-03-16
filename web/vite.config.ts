import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { AntDesignVueResolver } from 'unplugin-vue-components/resolvers';
import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';

import { debugEntry } from './vite-plugins/debug-entry';

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
