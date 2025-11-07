import { defineConfig } from 'vite';
import { resolve } from 'path';

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
    sourcemap: true
  }
});