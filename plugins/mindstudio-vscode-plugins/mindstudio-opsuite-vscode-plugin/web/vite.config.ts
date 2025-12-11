import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';

/** 视图入口白名单 */
const TEMP_MULTI_ENTRIES = ['Config', 'Link', 'Welcome', 'Home', 'newPrototype', 'Board'];

export default defineConfig(({ mode }) => {
  const buildInput: Record<string, string> = {};
  // 配置多入口
  const isBuildingSingleView = TEMP_MULTI_ENTRIES.includes(mode);
  for (const entry of TEMP_MULTI_ENTRIES) {
    if (isBuildingSingleView && entry !== mode) {
      continue;
    }
    buildInput[entry] = `src/views/${entry}/${entry}.html`;
  }

  return {
    base: './',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    plugins: [vue()],
    build: {
      outDir: 'out',
      emptyOutDir: true,
      assetsDir: 'assets',
      sourcemap: true,
      rollupOptions: { input: buildInput },
    },
  };
});
