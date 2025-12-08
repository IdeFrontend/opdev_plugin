import vue from '@vitejs/plugin-vue';
import path from 'path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile'
import { createHtmlPlugin } from 'vite-plugin-html'
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => {
  let createHtmlPluginOptions = {}
  let rollupOptions = {}
  let targets: any = []
  if (mode === 'link') {
    rollupOptions = {
      input: {
        link: 'src/views/Link/Link.html',
      }
    }

    createHtmlPluginOptions = {
      entry: path.join(__dirname, 'src/views/Link/main.ts'),
      filename: 'Link.html',
      template: 'src/views/Link/Link.html',
    }

    targets = [{
      src: 'dist/src/views/Link/Link.html',
      dest: '../out'
    }]

  }
  if (mode === 'config') {
    rollupOptions = {
      input: {
        Config: 'src/views/Config/Config.html'
      }
    }
    createHtmlPluginOptions = {
      entry: path.join(__dirname, 'src/views/Config/main.ts'),
      filename: 'Config.html',
      template: 'src/views/Config/Config.html',
      data: {
        basePath: './'
      }
    }

    targets = [{
      src: 'dist/src/views/Config/Config.html',
       dest: '../out'
    }]
  }
  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    plugins: [createHtmlPlugin({
      minify: true,
      pages: [createHtmlPluginOptions]
    }),
    viteSingleFile(), vue(),
    viteStaticCopy({
      targets,
    }),],
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      rollupOptions
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
  }
});