import { ApiGroup } from 'plugin:/core/ApiServer';
import * as vscode from 'vscode';
import * as fs from 'fs';
import path from 'path';
import { PermanentStorage } from 'plugin:/class/PermanentStorage';

const MARKED_STORAGE_KEY = 'msSanitizer_marks';

function formatTimestampToYYYYMMDD(timestamp: number): string {
  const date = new Date(timestamp);

  // 检查日期是否有效
  if (isNaN(date.getTime())) {
    throw new Error('无效的时间戳');
  }

  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${year}${month}${day}`;
}

function getMsSanitizerMarks() {
  const storageValue = PermanentStorage.getInstance().get<string[]>(
    MARKED_STORAGE_KEY,
    [],
  );

  return new Set(storageValue);
}

function setMsSanitizerMarks(vals: string[]) {
  PermanentStorage.getInstance().set<string[]>(MARKED_STORAGE_KEY, [...vals]);
}

export const msSanitizerApis: ApiGroup = {
  msSanitizer: {
    async getRunData(params) {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        console.log('getRunData1 no workspaceFolders');

        return [];
      }

      const workspacePath = workspaceFolders[0].uri.fsPath;

      console.log('getRunData2', workspacePath);
      // 获取目录下.vscode/mindstudio_sanitizer_log文件夹中的所有文件
      const logPath = path.join(
        path.join(workspacePath, '.vscode/mindstudio_sanitizer_log'),
      );

      // 本地测试数据
      // const logPath = path.join(__dirname, '../.vscode/mindstudio_sanitizer_log');
      console.log('getRunData3', logPath);
      // 文件夹不存在
      if (!fs.existsSync(logPath)) {
        return [];
      }

      const allFileNames = await fs.readdirSync(logPath);

      const markSet = getMsSanitizerMarks();
      const res = allFileNames.map((filename) => {
        const _filename = filename.replace('.log', '');
        const [title, timestamp] = _filename.split('_');

        return {
          title: `${title}-${formatTimestampToYYYYMMDD(+timestamp)}`,
          timestamp: +timestamp,
          id: filename,
          path: path.join(logPath, filename),
          marked: markSet.has(filename),
        };
      });

      return res;
    },

    async toggleMark(params) {
      const { id } = params;
      // 修改mark标记状态
      const markSet = getMsSanitizerMarks();

      if (markSet.has(id)) {
        markSet.delete(id);
      } else {
        markSet.add(id);
      }
      setMsSanitizerMarks([...markSet]);

      return;
    },
    openPanel(params) {
      // 打开异常检测数据面板
      vscode.commands.executeCommand(
        'huawei-op-devtools.open-ms-sanitizer-panel-view',
        params,
      );
    },
  },
};
