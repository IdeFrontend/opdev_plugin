/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('i18next', () => ({ t: (key: string) => key }));

import * as vscode from 'vscode';

import { promptReloadWindow } from '@plugin/helpers/reload-window-prompt';

describe('promptReloadWindow', () => {
  const showInformationMessage = vscode.window.showInformationMessage as jest.Mock;
  const executeCommand = vscode.commands.executeCommand as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    showInformationMessage.mockResolvedValue(undefined);
    executeCommand.mockResolvedValue(undefined);
  });

  it('reloads the window when the reload action is picked', async () => {
    showInformationMessage.mockResolvedValue('extension.reloadWindowAction');

    await promptReloadWindow('Settings changed');

    expect(showInformationMessage)
      .toHaveBeenCalledWith('Settings changed', 'extension.reloadWindowAction');
    expect(executeCommand)
      .toHaveBeenCalledWith('workbench.action.reloadWindow');
  });

  it('does nothing when the prompt is dismissed', async () => {
    await promptReloadWindow('Settings changed');

    expect(executeCommand)
      .not
      .toHaveBeenCalled();
  });

  it('does nothing when any other button is picked', async () => {
    showInformationMessage.mockResolvedValue('some other action');

    await promptReloadWindow('Settings changed');

    expect(executeCommand)
      .not
      .toHaveBeenCalled();
  });
});
