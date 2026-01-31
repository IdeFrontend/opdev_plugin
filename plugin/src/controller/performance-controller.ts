import * as vscode from 'vscode';
import * as path from 'path';

import {
  DownloadDataParams,
  DeleteNodeParams,
  SelectFolderParams,
  SelectFolderResult,
  SelectFileParams,
  SelectFileResult,
  JumpToFileParams,
} from '@shared/api-types';

export const performanceDataMethods = {
  /**
   * 下载数据
   * @param params 下载参数
   */
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
        progress.report({
          increment: 0,
          message: '正在读取远程文件...',
        });

        // 创建远程文件 URI
        const remoteFileUri = vscode.Uri.file(remoteFilePath);

        // 检查远程文件是否存在
        try {
          const stat = await vscode.workspace.fs.stat(remoteFileUri);

          progress.report({
            increment: 30,
            message: `文件大小: ${(stat.size / 1024).toFixed(2)} KB`,
          });
        }
        catch {
          throw new Error(`远程文件不存在: ${remoteFilePath}`);
        }

        // 读取远程文件内容
        progress.report({
          increment: 40,
          message: '正在读取文件内容...',
        });
        const fileData = await vscode.workspace.fs.readFile(remoteFileUri);

        // 获取文件名
        const fileName = path.basename(remoteFilePath);

        progress.report({
          increment: 60,
          message: '请选择保存位置...',
        });

        // 让用户选择本地保存位置
        const localFileUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(fileName),
          saveLabel: '保存',
          filters: { 所有文件: ['*'] },
        });

        if (!localFileUri) {
          // 用户取消了保存对话框
          return;
        }

        // 将文件内容写入本地
        progress.report({
          increment: 80,
          message: '正在保存文件...',
        });
        await vscode.workspace.fs.writeFile(localFileUri, fileData);

        progress.report({
          increment: 100,
          message: '下载完成',
        });
        vscode.window.showInformationMessage(`文件已成功下载到: ${localFileUri.fsPath}`);
      },
    );
  },

  /**
   * 删除节点
   * @param params 删除参数
   */
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

  /**
   * 选择文件夹
   * @param params 选择参数，包含可选的默认路径
   * @returns 选择的文件夹路径
   */
  async selectFolder(params?: SelectFolderParams): Promise<SelectFolderResult | null> {
    const options: vscode.OpenDialogOptions = {
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: '选择目录',
    };

    // 如果提供了默认路径，使用它作为初始路径
    if (params?.defaultPath) {
      try {
        const defaultUri = vscode.Uri.file(params.defaultPath);
        const stat = await vscode.workspace.fs.stat(defaultUri);
        
        // 如果路径是目录，直接使用
        if (stat.type === vscode.FileType.Directory) {
          options.defaultUri = defaultUri;
        }
        // 如果路径是文件，使用其父目录
        else {
          options.defaultUri = vscode.Uri.file(path.dirname(params.defaultPath));
        }
      }
      catch {
        // 如果路径不存在或无效，尝试使用父目录
        try {
          const parentPath = path.dirname(params.defaultPath);
          if (parentPath && parentPath !== params.defaultPath) {
            options.defaultUri = vscode.Uri.file(parentPath);
          }
        }
        catch {
          // 忽略错误，使用默认行为
        }
      }
    }

    // 调用 VS Code 原生对话框（支持选择目录）
    const uris = await vscode.window.showOpenDialog(options);

    if (uris && uris[0]) {
      return uris[0].fsPath;
    }

    return null;
  },

  /**
   * 选择文件
   * @param params 选择参数，包含可选的默认路径
   * @returns 选择的文件路径
   */
  async selectFile(params?: SelectFileParams): Promise<SelectFileResult | null> {
    const options: vscode.OpenDialogOptions = {
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: '选择文件',
      filters: {
        'Shell脚本': ['sh'],
        '所有文件': ['*'],
      },
    };

    // 如果提供了默认路径，使用它作为初始路径
    if (params?.defaultPath) {
      try {
        const defaultUri = vscode.Uri.file(params.defaultPath);
        const stat = await vscode.workspace.fs.stat(defaultUri);
        
        // 如果路径是文件，直接使用
        if (stat.type === vscode.FileType.File) {
          options.defaultUri = defaultUri;
        }
        // 如果路径是目录，使用该目录
        else {
          options.defaultUri = defaultUri;
        }
      }
      catch {
        // 如果路径不存在，尝试使用父目录
        try {
          const parentPath = path.dirname(params.defaultPath);
          if (parentPath && parentPath !== params.defaultPath) {
            options.defaultUri = vscode.Uri.file(parentPath);
          }
        }
        catch {
          // 忽略错误，使用默认行为
        }
      }
    }

    // 调用 VS Code 原生对话框（支持选择文件）
    const uris = await vscode.window.showOpenDialog(options);

    if (uris && uris[0]) {
      return uris[0].fsPath;
    }

    return null;
  },

  /**
   * 跳转到文件
   * @param params 跳转参数
   */
  async jumpToFile(params: JumpToFileParams): Promise<void> {
    try {
      console.log('jumpToFile', params);
      const {
        fileLink, row, col, errorMessage, errorTitle,
      } = params;
      const uri = vscode.Uri.file(fileLink);

      console.log('uri', uri);
      const document = await vscode.workspace.openTextDocument(uri);

      console.log('document', document);
      const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.One });
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

      // 构建错误信息显示文本
      let errorDisplayText = '';
      if (errorTitle || errorMessage) {
        if (errorTitle && errorMessage) {
          errorDisplayText = `${errorTitle}: ${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}`;
        }
        else {
          errorDisplayText = errorTitle || errorMessage || '';
        }
      }

      // 创建高亮装饰
      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 200, 0, 0.3)', // 黄色半透明背景
        border: '1px solid rgba(255, 200, 0, 0.8)', // 黄色边框
        isWholeLine: true, // 高亮整行
      });

      // 如果有错误信息，创建行尾装饰来显示错误信息
      let afterDecorationType: vscode.TextEditorDecorationType | undefined;
      if (errorDisplayText) {
        afterDecorationType = vscode.window.createTextEditorDecorationType({
          after: {
            contentText: `  ⚠ ${errorDisplayText}`,
            color: 'rgba(255, 200, 0, 0.9)',
            fontWeight: 'normal',
            fontStyle: 'italic',
          },
        });
      }

      // 应用高亮到目标行
      const lineRange = new vscode.Range(
        new vscode.Position(line, 0),
        new vscode.Position(line, document.lineAt(line).text.length),
      );

      editor.setDecorations(decorationType, [lineRange]);

      // 如果有错误信息，在行尾显示
      if (afterDecorationType && errorDisplayText) {
        const endPos = new vscode.Position(line, document.lineAt(line).text.length);
        editor.setDecorations(afterDecorationType, [{
          range: new vscode.Range(endPos, endPos),
        }]);
      }

      // 如果有错误信息，显示通知
      if (errorTitle || errorMessage) {
        const notificationMessage = errorTitle || errorMessage || '检测到错误';
        vscode.window.showInformationMessage(
          notificationMessage,
          { modal: false },
        );
      }

      // 5秒后移除高亮（延长显示时间以便查看错误信息）
      setTimeout(() => {
        decorationType.dispose();
        if (afterDecorationType) {
          afterDecorationType.dispose();
        }
      }, 5000);
    }
    catch (error) {
      console.log('jumpToFile', error);
      vscode.window.showErrorMessage(`打开文件失败：${error}`);
      throw error;
    }
  },
};
