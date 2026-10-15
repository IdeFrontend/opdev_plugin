/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as path from 'path';
import { t } from 'i18next';
import * as vscode from 'vscode';

import { ProjectManager } from '@plugin/core/project/project-manager';
import { welcomeMethods } from '@plugin/controller/welcome-controller';
import {
  COMMAND_OPEN,
  COMMAND_WELCOME,
  COMMAND_OPEN_PROJECT,
} from '@plugin/constants';
import {
  isOperatorProjectViewId,
  OperatorProjectViewId,
  type OperatorProjectViewIdValue,
} from '@shared/project-type-view-id';
import { SettingsLoader } from '@plugin/service/settings-loader';
import { workbenchViewContainerCommand } from '@shared/flavor';
import { focusOpsOperateViewContainer } from '@plugin/helpers/focus-ops-operate';

function normalizeViewIdToProjectType(id: OperatorProjectViewIdValue): string {
  switch (id) {
    case OperatorProjectViewId.CANN:
      return 'cann';
    case OperatorProjectViewId.STANDARD_CUSTOM:
      return 'standard-custom';
    case OperatorProjectViewId.PYASC:
      return 'pyasc';
    case OperatorProjectViewId.TRITON:
      return 'triton';
    default:
      return '';
  }
}

function isRequestedProjectTypeEnabled(projectType: string): boolean {
  if (projectType === 'triton') {
    return SettingsLoader.isOperatorSupportEnabled('triton');
  }

  return true;
}

export interface messageItem {
  command: string;
  callback: (message: any, that: any)=> void;
}

const webviewMessageList: messageItem[] = [
  {
    command: 'alert',
    callback: (message: any) => vscode.window.showErrorMessage(message.text),
  },
  {
    command: 'info',
    callback: (message: any) =>
      vscode.window.showInformationMessage(message.text),
  },
  {
    command: 'loaded',
    callback: (message: any) => {
      if (message.status === 'error') {
        vscode.window.showWarningMessage(t('webview.opsuiteLoadError', { message: message.message }));
      }
    },
  },
  {
    command: 'openLinkWebviewPanel',
    callback: (_message: any, _that: any) => {
      vscode.commands.executeCommand(COMMAND_OPEN);
    },
  },
  {
    command: 'openProjectWebviewPanel',
    callback: (_message: any, _that: any) => {
      vscode.commands.executeCommand(COMMAND_OPEN_PROJECT);
    },
  },
  {
    command: 'openWelcome',
    callback: (_message: any, _that: any) => {
      vscode.commands.executeCommand(COMMAND_WELCOME);
    },
  },
  {
    command: 'vscodeOpenSidebar',
    callback: (_message: any, _that: any) => {
      void focusOpsOperateViewContainer();
    },
  },
  {
    command: 'openExternalLink',
    callback: async (message: any) => {
      if (message.url) {
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
      }
    },
  },
];

// Create operator project by view id:
// - CANN / PYASC / TRITON create from template
// - STANDARD_CUSTOM creates prototype first, then project
export async function handleOperatorProjectDirectoryFile(
  message:
    | {
      createOperatorProjectDirectoryFileType: OperatorProjectViewIdValue;
      subOperatorContext?: {
        parentProjectPath: string;
        opName: string;
        outputPath: string;
        skipFileGeneration?: boolean;
      };
    }
    | undefined,
  _that: unknown,
  progress: vscode.Progress<{ message?: string;
    increment?: number }>,
) {
  console.log('handleOperatorProjectDirectoryFile: called');
  console.log('handleOperatorProjectDirectoryFile: message:', message);
  console.log('handleOperatorProjectDirectoryFile: message type:', typeof message);

  if (!message) {
    console.warn('handleOperatorProjectDirectoryFile: message is empty, exiting');

    return;
  }

  const requestedProjectType = normalizeViewIdToProjectType(message.createOperatorProjectDirectoryFileType);

  if (!isRequestedProjectTypeEnabled(requestedProjectType)) {
    vscode.window.showErrorMessage(t('extension.unsupportedProjectTypeDisabled', { projectType: requestedProjectType }));
    throw new Error(`Project type '${requestedProjectType}' is currently disabled by settings.`);
  }

  // Get extension context to read templateName
  const context = (globalThis as unknown as { extensionContext: vscode.ExtensionContext })
    .extensionContext;
  const templateName = context.globalState.get<string>('templateName');

  console.log('handleOperatorProjectDirectoryFile: createOperatorProjectDirectoryFileType:', message.createOperatorProjectDirectoryFileType);
  console.log('handleOperatorProjectDirectoryFile: templateName:', templateName);

  if (
    message
    && isOperatorProjectViewId(message.createOperatorProjectDirectoryFileType)
  ) {
    console.log('handleOperatorProjectDirectoryFile: type validation passed, start processing');

    try {
      // Show connection progress
      progress.report({
        increment: 25,
        message: t('welcome.createFilesProgressTitle'),
      });

      if (message.createOperatorProjectDirectoryFileType === OperatorProjectViewId.CANN) {
        // Create operators (via prototypes)
        console.log('Start creating operator prototype (type 1)...');
        // Note: The project has been initialized in createdProject and does not need to be initialized again here.
        const pm = ProjectManager.getInstance();
        const opName = pm.projectPath ? path.basename(pm.projectPath) : undefined;

        console.log('Start creating operator prototype...');

        await welcomeMethods.createOpsByPrototype({
          opsPrototypeFile: '',
          opType: 'cann',
          templateName,
          opName,
        });
        console.log('Operator prototype creation completed');

        // Clean templateName
        if (templateName) {
          context.globalState.update('templateName', undefined);
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }

      if (message.createOperatorProjectDirectoryFileType === OperatorProjectViewId.PYASC) {
        // pyasc operator project, created using templates
        console.log('Start creating pyasc operator (type 3)...');
        const pm = ProjectManager.getInstance();
        const opName = pm.projectPath ? path.basename(pm.projectPath) : undefined;

        console.log('Start creating pyasc operator prototype...');

        await welcomeMethods.createOpsByPrototype({
          opsPrototypeFile: '',
          opType: 'pyasc',
          templateName,
          opName,
        });
        console.log('pyasc operator prototype creation completed');

        // Clean templateName
        if (templateName) {
          context.globalState.update('templateName', undefined);
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }

      if (message.createOperatorProjectDirectoryFileType === OperatorProjectViewId.TRITON) {
        // Triton operator project: scaffold from template
        console.log('Creating Triton operator project (type 4)...');
        const pm = ProjectManager.getInstance();
        const opName = pm.projectPath ? path.basename(pm.projectPath) : undefined;

        console.log('Creating Triton operator prototype...');

        await welcomeMethods.createOpsByPrototype({
          opsPrototypeFile: '',
          opType: 'triton',
          templateName: templateName || 'triton_vector_add',
          opName,
        });
        console.log('Triton operator prototype creation completed');

        if (templateName) {
          context.globalState.update('templateName', undefined);
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }

      if (message.createOperatorProjectDirectoryFileType === OperatorProjectViewId.STANDARD_CUSTOM) {
        console.log('Start creating operator (type 2)...');
        const pm = ProjectManager.getInstance();
        const ctx = message.subOperatorContext;

        const opName = ctx
          ? ctx.opName
          : (pm.projectPath ? path.basename(pm.projectPath) : undefined);

        const opsPrototypeFilePath = await welcomeMethods.createOps(ctx
          ? {
            projectPath: ctx.parentProjectPath,
            projectName: ctx.opName,
            outputPath: ctx.outputPath,
          }
          : {});

        console.log('Operator prototype file path:', opsPrototypeFilePath);

        if (opsPrototypeFilePath) {
          await welcomeMethods.createOpsByPrototype({
            opsPrototypeFile: opsPrototypeFilePath,
            opType: 'ascend',
            opName,
            ...(ctx
              ? {
                projectPath: ctx.parentProjectPath,
                opPath: ctx.outputPath,
                skipFileGeneration: ctx.skipFileGeneration === true,
              }
              : {}),
          });
        }
        else {
          throw new Error(t('webview.createPrototypeFailedEmptyPath'));
        }

        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }

      progress.report({
        increment: 100,
        message: t('webview.opFileCreated'),
      });
      vscode.window.showInformationMessage(t('webview.opFileCreated'));
    }
    catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error('Failed to create operator file:', error);
      progress.report({
        increment: 100,
        message: t('webview.createOpFileFailed', { error: errorMessage }),
      });
      vscode.window.showErrorMessage(t('webview.createOpFileFailed', { error: errorMessage }));
      throw error;
    }
  }
}

export default webviewMessageList;
