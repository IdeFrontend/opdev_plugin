import { t } from 'i18next';
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
      throw new Error(t('performance.filePathEmpty'));
    }

    // 显示下载进度
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('performance.downloadingFile'),
        cancellable: false,
      },
      async (progress) => {
        progress.report({
          increment: 0,
          message: t('performance.readingRemoteFile'),
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
          throw new Error(t('performance.remoteFileNotExist', { path: remoteFilePath }));
        }

        // 读取远程文件内容
        progress.report({
          increment: 40,
          message: t('performance.readingFileContent'),
        });
        const fileData = await vscode.workspace.fs.readFile(remoteFileUri);

        // 获取文件名
        const fileName = path.basename(remoteFilePath);

        progress.report({
          increment: 60,
          message: t('common.selectSaveLocation'),
        });

        // 让用户选择本地保存位置
        const localFileUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(fileName),
          saveLabel: t('common.save'),
          filters: { [t('common.allFiles')]: ['*'] },
        });

        if (!localFileUri) {
          // 用户取消了保存对话框
          return;
        }

        // 将文件内容写入本地
        progress.report({
          increment: 80,
          message: t('common.savingFile'),
        });
        await vscode.workspace.fs.writeFile(localFileUri, fileData);

        progress.report({
          increment: 100,
          message: t('common.downloadComplete'),
        });
        vscode.window.showInformationMessage(t('performance.fileDownloadedTo', { path: localFileUri.fsPath }));
      },
    );
  },

  /**
   * 删除节点
   * @param params 删除参数
   */
  async deleteNode(params: DeleteNodeParams): Promise<void> {
    if (!params.nodeKey) {
      throw new Error(t('performance.nodeKeyRequired'));
    }

    // 确认删除
    const confirmBtn = t('common.confirm');
    const cancelBtn = t('common.cancel');
    const result = await vscode.window.showWarningMessage(
      t('performance.confirmDelete', { key: params.nodeKey }),
      confirmBtn,
      cancelBtn,
    );

    if (result === confirmBtn) {
      console.log('删除节点:', params.nodeKey, params.filePath);
      vscode.window.showInformationMessage(t('performance.deleted', { key: params.nodeKey }));
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
      openLabel: t('common.selectFolder'),
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
      openLabel: t('common.selectFile'),
      filters: {
        [t('common.shellScript')]: ['sh'],
        [t('common.allFiles')]: ['*'],
      },
    };

    // 如果提供了文件类型，使用它们
    if (params?.fileTypes && params.fileTypes.length > 0) {
      params.fileTypes.forEach((fileType) => {
        options.filters![fileType.label] = fileType.extensions;
      });
    } else {
      // 默认过滤器
      options.filters![t('common.shellScript')] = ['sh'];
      options.filters![t('common.allFiles')] = ['*'];
    }

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
        const notificationMessage = errorTitle || errorMessage || t('performance.errorDetected');
        vscode.window.showInformationMessage(
          notificationMessage,
          { modal: false },
        );
      }

      // 监听光标位置变化，在同一文档中光标“离开当前错误位置”后移除高亮
      const targetDocUri = document.uri.toString();
      const targetLine = line;
      const targetChar = charactor;

      const selectionDisposable = vscode.window.onDidChangeTextEditorSelection(
        (e) => {
          // 只关注同一文档
          if (e.textEditor.document.uri.toString() !== targetDocUri) {
            return;
          }

          const selection = e.selections[0];
          if (!selection) {
            return;
          }

          const active = selection.active;

          // 如果光标还停留在当前错误位置，则不清除高亮
          if (active.line === targetLine && active.character === targetChar) {
            return;
          }

          // 光标真正移动到其他位置后，再移除高亮
          decorationType.dispose();
          if (afterDecorationType) {
            afterDecorationType.dispose();
          }
          selectionDisposable.dispose();
        },
      );
    }
    catch (error) {
      console.log('jumpToFile', error);
      vscode.window.showErrorMessage(t('performance.openFileFailed', { error: String(error) }));
      throw error;
    }
  },
};
