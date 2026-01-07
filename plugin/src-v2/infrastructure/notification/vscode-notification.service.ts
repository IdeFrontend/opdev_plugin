import * as vscode from 'vscode';

import { INotificationService } from '@plugin-v2/application/interfaces/notification.interface';

/**
 * VSCode 通知服务实现
 * 基础设施层,封装 VSCode API
 */
export class VscodeNotificationService implements INotificationService {
  showInfo(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  showError(message: string): void {
    vscode.window.showErrorMessage(message);
  }

  showWarning(message: string): void {
    vscode.window.showWarningMessage(message);
  }

  async showProgress(title: string, task: ()=> Promise<void>): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
      },
      async () => {
        await task();
      },
    );
  }
}
