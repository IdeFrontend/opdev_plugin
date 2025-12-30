import * as fs from 'fs';
import * as path from 'path';

export interface FileItem {
  name: string;
  path: string;
  type: string;
}

export function getFiles(dirPath: string): FileItem[] {
  try {
    if (!dirPath) return [];
    let basePath = path.resolve(dirPath);
    let searchKey = '';
    // 转换成搜索模式
    if (!fs.existsSync(basePath)) {
      searchKey = basePath.split(path.sep).at(-1)!;
      basePath = basePath.slice(0, basePath.length - searchKey.length - 1);
    }

    if (!fs.existsSync(basePath)) {
      console.error(`${basePath} does not exist`);
      return [];
    }

    const items: FileItem[] = [];
    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    for (const entry of entries) {
      if (searchKey && !entry.name.includes(searchKey)) {
        continue;
      }
      const entryPath = path.join(basePath, entry.name);
      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          path: path.resolve(entryPath),
          type: 'directory',
        });
      } else {
        const ext = path.extname(entry.name);
        items.push({
          name: entry.name,
          path: path.resolve(entryPath),
          type: ext.startsWith('.') ? ext.slice(1) : '',
        });
      }
    }

    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  } catch (e) {
    console.error(e);
    return [];
  }
}

export default { getFiles };
