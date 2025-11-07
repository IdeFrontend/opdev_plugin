import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '~':path.resolve(__dirname,'../common')
    }
  },
  plugins: [vue()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    // 确保资源路径正确
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
      }
    }
  },
  server: {
    port: 8000,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  define: {
    'process.env': {}
  },
});