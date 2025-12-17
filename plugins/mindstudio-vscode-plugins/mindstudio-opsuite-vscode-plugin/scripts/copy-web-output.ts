import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, '../web/out/');
const targetPath = path.resolve(__dirname, '../out/web/');

// 检查源目录是否存在
if (!fs.existsSync(sourcePath)) {
  console.error(`错误: 源目录不存在: ${sourcePath}`);
  console.error('请先运行 npm run compile:web 构建 web 项目');
  process.exit(1);
}

// 删除目标目录（如果存在）
if (fs.existsSync(targetPath)) {
  fs.rmSync(targetPath, { force: true, recursive: true });
}

// 创建目标目录的父目录（如果不存在）
const targetParent = path.dirname(targetPath);
if (!fs.existsSync(targetParent)) {
  fs.mkdirSync(targetParent, { recursive: true });
}

// 复制文件
fs.cpSync(sourcePath, targetPath, { recursive: true });
console.log(`成功复制文件从 ${sourcePath} 到 ${targetPath}`);
