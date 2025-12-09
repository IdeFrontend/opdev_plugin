import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, '../web/out/');
const targetPath = path.resolve(__dirname, '../out/web/');

fs.rmSync(targetPath, { recursive: true });
fs.cpSync(sourcePath, targetPath, { recursive: true });
