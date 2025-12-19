import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';

import { debugEntry } from './vite-plugins/debug-entry';

/** 视图入口白名单 */
const TEMP_MULTI_ENTRIES = ['Config', 'Link', 'Welcome', 'Home', 'newPrototype', 'Board','PerformanceRunData'];

export default defineConfig(() => {
  const buildInput: Record<string, string> = { index: 'index.html' };
  for (const entry of TEMP_MULTI_ENTRIES) {
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
      outDir: 'out',
      emptyOutDir: true,
      assetsDir: 'assets',
      sourcemap: true,
      rollupOptions: { input: buildInput },
    },
  };
});
