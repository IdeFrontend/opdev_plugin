import { defineConfig } from 'vite';
import { resolve } from 'path';
import copy from 'rollup-plugin-copy';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'plugin/src/extension.ts'),
      formats: ['cjs'],
      fileName: 'extension'
    },
    rollupOptions: {
      external: ['vscode'],
    },
    outDir: 'out',
    emptyOutDir: true,
    sourcemap: true,
    plugins: [copy({
      targets: [
        { src: 'server/vscode_local_service', dest: 'out/server' }, // 调整目标路径到 out
        { src: 'web/out', dest: 'out/web' } // 调整目标路径到 out
      ],
      verbose: true
    })]
  }
});