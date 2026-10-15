/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface FileItem {
  name: string;
  path: string;
  type: string;
}

export function getFiles(dirPath: string): FileItem[] {
  try {
    if (!dirPath) {
      return [];
    }

    let basePath = path.resolve(dirPath);
    let searchKey = '';

    // Switch to search mode
    if (!fs.existsSync(basePath)) {
      searchKey = basePath.split(path.sep)
        .at(-1)!;
      basePath = basePath.slice(0, basePath.length - searchKey.length - 1);
    }

    if (!fs.existsSync(basePath)) {
      console.error(`${basePath} does not exist`);

      return [];
    }

    // Check if the path is a directory, if not return an empty array
    const stats = fs.statSync(basePath);

    if (!stats.isDirectory()) {
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
      }
      else {
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
  }
  catch (e) {
    console.error(e);

    return [];
  }
}

export default { getFiles };
