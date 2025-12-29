import fs from 'node:fs';
import path from 'node:path';

import type { Plugin } from 'vite';

/**
 * 开发模式生成入口html文件
 */
export function debugEntry(): Plugin {
  /** vue项目根目录 */
  let root: string;

  /** 构建输出目录 */
  let outDir: string;

  /** 开发模式server域名 */
  let serverHost: string;
  return {
    name: 'generate-debug-html',
    apply: 'serve',
    configResolved(resolvedConfig) {
      root = resolvedConfig.root;
      outDir = resolvedConfig.build.outDir;
      const { host = 'localhost', port = 5173 } = resolvedConfig.server;
      serverHost = `http://${host}:${port}`;
    },
    buildStart() {
      const htmlPath = path.join(root, 'index.html');
      const outputPath = path.join(outDir, 'index.html');
      const htmlText = fs.readFileSync(htmlPath, 'utf-8').replaceAll('/src/main.ts', `${serverHost}/src/main.ts`);

      // 生成构建输出目录和debug html文件
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outputPath, htmlText);
    },
  };
}
