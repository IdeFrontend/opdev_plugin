import vue from '@vitejs/plugin-vue';
import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';

import { debugEntry } from './vite-plugins/debug-entry';

export default defineConfig(({ mode }) => {
  const buildInput: Record<string, string> = {};

  // 动态读取 views 目录下的所有符合规则的入口
  const viewsDir = path.resolve(__dirname, 'src/views');
  const entries = fs.readdirSync(viewsDir).filter((entry) => {
    const entryPath = path.join(viewsDir, entry);
    const htmlPath = path.join(entryPath, `${entry}.html`);
    return fs.statSync(entryPath).isDirectory() && fs.existsSync(htmlPath);
  });

  for (const entry of entries) {
    buildInput[entry] = `src/views/${entry}/${entry}.html`;
  }

  return {
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'plugin:': path.resolve(__dirname, '../plugin/src'),
        'shared:': path.resolve(__dirname, '../shared'),
      },
    },
    plugins: [vue(), debugEntry()],
    server: {
      cors: true,
    },
    build: {
      outDir: '../out/web',
      emptyOutDir: true,
      assetsDir: 'assets',
      sourcemap: mode === 'debug' || mode === 'readable',
      minify: mode === 'readable' ? false : 'esbuild',
      rollupOptions: { input: buildInput },
    },
  };
});
