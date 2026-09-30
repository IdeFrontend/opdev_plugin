/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
export const env = { uriScheme: 'vscode' };

export const workspace = {
  workspaceFolders: [{ uri: { fsPath: '/workspace' } }] as Array<{ uri: { fsPath: string } }> | undefined,
  getConfiguration: jest.fn(() => ({
    inspect: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
  })),
  onDidChangeConfiguration: jest.fn()
    .mockReturnValue({ dispose: jest.fn() }),
};

export const extensions = {
  all: [] as Array<{ id: string;
    packageJSON: unknown }>,
  getExtension: jest.fn(),
};

export const window = {
  activeTextEditor: undefined as
  | { document: { fileName: string;
    uri: { fsPath: string } } }
    | undefined,
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn()
    .mockResolvedValue(undefined),
  showInputBox: jest.fn()
    .mockResolvedValue(undefined),
};

export const commands = {
  executeCommand: jest.fn()
    .mockResolvedValue(undefined),
  getCommands: jest.fn()
    .mockResolvedValue([]),
};

export const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

export const Uri = { file: (fsPath: string) => ({ fsPath }) };
