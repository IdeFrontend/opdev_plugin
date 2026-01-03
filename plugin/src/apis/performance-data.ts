import * as vscode from 'vscode';
import * as path from 'path';

import { ApiGroup } from 'plugin:/core/ApiServer';
import {
  DownloadDataParams,
  DeleteNodeParams,
  SelectFolderResult,
  JumpToFileParams,
} from 'shared:/api-types';

export const performanceRunDataApis: ApiGroup = {
  webview: {
    // 下载数据
    async downloadData(params: DownloadDataParams): Promise<void> {
      // 使用 filePath 优先，如果没有则使用 nodeKey
      const remoteFilePath = params.filePath || params.nodeKey;

      if (!remoteFilePath) {
        throw new Error('文件路径不能为空');
      }

      // 显示下载进度
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '正在下载文件',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 0, message: '正在读取远程文件...' });

          // 创建远程文件 URI
          const remoteFileUri = vscode.Uri.file(remoteFilePath);

          // 检查远程文件是否存在
          try {
            const stat = await vscode.workspace.fs.stat(remoteFileUri);

            progress.report({
              increment: 30,
              message: `文件大小: ${(stat.size / 1024).toFixed(2)} KB`,
            });
          } catch (error) {
            throw new Error(`远程文件不存在: ${remoteFilePath}`);
          }

          // 读取远程文件内容
          progress.report({ increment: 40, message: '正在读取文件内容...' });
          const fileData = await vscode.workspace.fs.readFile(remoteFileUri);

          // 获取文件名
          const fileName = path.basename(remoteFilePath);

          progress.report({ increment: 60, message: '请选择保存位置...' });

          // 让用户选择本地保存位置
          const localFileUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(fileName),
            saveLabel: '保存',
            filters: {
              所有文件: ['*'],
            },
          });

          if (!localFileUri) {
            // 用户取消了保存对话框
            return;
          }

          // 将文件内容写入本地
          progress.report({ increment: 80, message: '正在保存文件...' });
          await vscode.workspace.fs.writeFile(localFileUri, fileData);

          progress.report({ increment: 100, message: '下载完成' });
          vscode.window.showInformationMessage(
            `文件已成功下载到: ${localFileUri.fsPath}`,
          );
        },
      );
    },

    // 删除节点
    async deleteNode(params: DeleteNodeParams): Promise<void> {
      if (!params.nodeKey) {
        throw new Error('节点信息不能为空');
      }
      // 确认删除
      const result = await vscode.window.showWarningMessage(
        `确定要删除 ${params.nodeKey} 吗？`,
        '确定',
        '取消',
      );

      if (result === '确定') {
        console.log('删除节点:', params.nodeKey, params.filePath);
        // 这里可以添加删除文件的逻辑
        vscode.window.showInformationMessage(`已删除: ${params.nodeKey}`);
      }
    },

    // 选择文件夹
    async selectFolder(): Promise<SelectFolderResult | null> {
      // 调用 VS Code 原生对话框（支持选择目录）
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: '选择目录',
      });

      if (uris && uris[0]) {
        return uris[0].fsPath;
      }

      return null;
    },

    // 跳转到文件
    async jumpToFile(params: JumpToFileParams): Promise<void> {
      try {
        console.log('jumpToFile', params);
        const { fileLink, row, col } = params;
        const uri = vscode.Uri.file(fileLink);

        console.log('uri', uri);
        const document = await vscode.workspace.openTextDocument(uri);

        console.log('document', document);
        const editor = await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One,
        });
        const line = Math.max(0, row - 1);
        const charactor = Math.max(0, col - 1);
        const pos = new vscode.Position(line, charactor);

        // 设置光标位置
        editor.selection = new vscode.Selection(pos, pos);

        // 滚动到目标行，并将其置于视图中央
        editor.revealRange(
          new vscode.Range(pos, pos),
          vscode.TextEditorRevealType.InCenter,
        );

        // 创建高亮装饰
        const decorationType = vscode.window.createTextEditorDecorationType({
          backgroundColor: 'rgba(255, 200, 0, 0.3)', // 黄色半透明背景
          border: '1px solid rgba(255, 200, 0, 0.8)', // 黄色边框
          isWholeLine: true, // 高亮整行
        });

        // 应用高亮到目标行
        const lineRange = new vscode.Range(
          new vscode.Position(line, 0),
          new vscode.Position(line, document.lineAt(line).text.length),
        );

        editor.setDecorations(decorationType, [lineRange]);

        // 2秒后移除高亮
        setTimeout(() => {
          decorationType.dispose();
        }, 2000);
      } catch (error) {
        console.log('jumpToFile', error);
        vscode.window.showErrorMessage(`打开文件失败：${error}`);
        throw error;
      }
    },
  },
};
