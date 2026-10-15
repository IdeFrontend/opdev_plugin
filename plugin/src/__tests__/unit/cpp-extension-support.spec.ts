/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as vscode from 'vscode';

import {
  CPP_EXTENSION_PROMPT_DISMISSED_KEY,
  hasCppLanguageSupportExtension,
  maybePromptInstallCppExtension,
  MICROSOFT_CPP_EXTENSION_ID,
} from '@plugin/helpers/cpp-extension-support';

jest.mock('i18next', () => ({ t: (key: string) => key }));

const logDebug = jest.fn();

type InstalledExtension = {
  id: string;
  packageJSON: unknown;
};

function setInstalledExtensions(installed: InstalledExtension[]): void {
  (vscode.extensions as { all: InstalledExtension[] }).all = installed;
}

function cppProvider(id: string): InstalledExtension {
  return {
    id,
    packageJSON: {
      contributes: {
        languages: [
          { id: 'cpp' },
          { id: 'c' },
        ],
      },
    },
  };
}

function createContext(dismissed = false): vscode.ExtensionContext {
  return {
    globalState: {
      get: jest.fn()
        .mockReturnValue(dismissed),
      update: jest.fn(),
    },
  } as unknown as vscode.ExtensionContext;
}

beforeEach(() => {
  jest.clearAllMocks();
  setInstalledExtensions([]);
});

describe('hasCppLanguageSupportExtension', () => {
  it('detects any vendor C/C++ provider, not just Microsoft', () => {
    setInstalledExtensions([cppProvider('huawei.huawei-cpp')]);

    expect(hasCppLanguageSupportExtension())
      .toBe(true);
  });

  it('ignores the built-in vscode.cpp grammar extension', () => {
    setInstalledExtensions([
      cppProvider('vscode.cpp'),
      {
        ...cppProvider('some.vendor-builtin'),
        packageJSON: {
          isBuiltin: true,
          contributes: { languages: [{ id: 'cpp' }] },
        },
      },
    ]);

    expect(hasCppLanguageSupportExtension())
      .toBe(false);
  });

  it('ignores extensions that contribute no C/C++ language', () => {
    setInstalledExtensions([
      {
        id: 'some.python',
        packageJSON: { contributes: { languages: [{ id: 'python' }] } },
      },
    ]);

    expect(hasCppLanguageSupportExtension())
      .toBe(false);
  });

  it('ignores extension language entries without an id', () => {
    setInstalledExtensions([
      {
        id: 'some.shell',
        packageJSON: { contributes: { languages: [{ name: 'Shell Script' }] } },
      },
    ]);

    expect(hasCppLanguageSupportExtension())
      .toBe(false);
  });
});

describe('maybePromptInstallCppExtension', () => {
  it('stays quiet when a C/C++ provider is already installed', async () => {
    setInstalledExtensions([cppProvider(MICROSOFT_CPP_EXTENSION_ID)]);

    await maybePromptInstallCppExtension(createContext(), logDebug);

    expect(vscode.window.showInformationMessage)
      .not
      .toHaveBeenCalled();
  });

  it('installs Microsoft C/C++ when the user accepts', async () => {
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('extension.cppSupport.install');

    await maybePromptInstallCppExtension(createContext(), logDebug);

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith('workbench.extensions.installExtension', MICROSOFT_CPP_EXTENSION_ID);
  });

  it('remembers a dismissal and never prompts again', async () => {
    (vscode.window.showInformationMessage as jest.Mock)
      .mockResolvedValueOnce('extension.cppSupport.dontAskAgain');

    const context = createContext();

    await maybePromptInstallCppExtension(context, logDebug);

    expect(context.globalState.update)
      .toHaveBeenCalledWith(CPP_EXTENSION_PROMPT_DISMISSED_KEY, true);

    await maybePromptInstallCppExtension(createContext(true), logDebug);

    expect(vscode.window.showInformationMessage)
      .toHaveBeenCalledTimes(1);
  });

  it('warns instead of throwing when the marketplace is unreachable', async () => {
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('extension.cppSupport.install');
    (vscode.commands.executeCommand as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    await maybePromptInstallCppExtension(createContext(), logDebug);

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledWith('extension.cppSupport.installFailed');
  });

  it('does nothing when the user closes the prompt with another button', async () => {
    (vscode.window.showInformationMessage as jest.Mock).mockResolvedValueOnce('some other action');

    const context = createContext();

    await maybePromptInstallCppExtension(context, logDebug);

    expect(vscode.commands.executeCommand)
      .not
      .toHaveBeenCalled();
    expect(context.globalState.update)
      .not
      .toHaveBeenCalled();
  });
});
