/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('@plugin/helpers/task-method-dispatch', () => ({ dispatchStTestFromWebview: jest.fn() }));

import { StTestController } from '@plugin/controller/st-test-controller';
import type { StTestMode } from '@shared/st-test-results';

describe('StTestController', () => {
  const workspaceRoot = '/workspace';
  const contextToken = '/workspace:/workspace/add';
  const context = {
    workspaceRoot,
    operatorName: 'add',
    operatorPath: '/workspace/add',
    availableModes: [
      'kernel',
      'aclnn',
    ] as StTestMode[],
  };
  let readWorkspaceSetting: jest.Mock;
  let persistWorkspaceSettings: jest.Mock;
  let dispatch: jest.Mock;
  let closeOptionsPanel: jest.Mock;

  beforeEach(() => {
    readWorkspaceSetting = jest.fn();
    persistWorkspaceSettings = jest.fn(async () => true);
    dispatch = jest.fn(async () => true);
    closeOptionsPanel = jest.fn();
  });

  function createController(): StTestController {
    return new StTestController({
      resolveContext: async () => context,
      readWorkspaceSetting,
      persistWorkspaceSettings,
      createContextToken: (value) => `${value.workspaceRoot}:${value.operatorPath}`,
      dispatch,
      closeOptionsPanel,
    });
  }

  it('filters stale saved modes and loads safe per-mode defaults', async () => {
    readWorkspaceSetting.mockImplementation((_root: string, key: string) => {
      if (key === 'stTest.selectedModes') {
        return ['e2e'];
      }

      if (key === 'stTest.kernel.arguments') {
        return [
          '--custom',
          'two words',
        ];
      }

      return undefined;
    });

    const result = await createController()
      .loadOptions();

    expect(result)
      .toEqual({
        contextToken,
        operatorName: 'add',
        availableModes: [
          'kernel',
          'aclnn',
        ],
        selectedModes: ['kernel'],
        argumentsByMode: {
          kernel: [
            '--custom',
            'two words',
          ],
          aclnn: [],
          e2e: [],
        },
        defaultArgumentsByMode: {
          kernel: [
            '-d=false',
            '-b=release',
            '--pc=8',
          ],
          aclnn: [],
          e2e: [],
        },
      });
  });

  it('rejects opening the options panel when the selected operator has no ST CSV files', async () => {
    const controller = new StTestController({
      resolveContext: async () => ({
        ...context,
        availableModes: [],
      }),
      readWorkspaceSetting,
      persistWorkspaceSettings,
      createContextToken: (value) => `${value.workspaceRoot}:${value.operatorPath}`,
      dispatch,
      closeOptionsPanel,
    });

    await expect(controller.ensureOptionsAvailable())
      .rejects.toThrow();
    expect(readWorkspaceSetting).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('allows opening the options panel when at least one ST CSV mode is available', async () => {
    await expect(createController()
      .ensureOptionsAvailable())
      .resolves.toBeUndefined();
  });

  it('persists all available mode arguments before dispatching canonical modes', async () => {
    await createController()
      .runOptions({
        contextToken,
        selectedModes: [
          'aclnn',
          'kernel',
        ],
        argumentsByMode: {
          kernel: [
            '--warmup',
            'false',
          ],
          aclnn: ['--repeat=2'],
        },
      });

    expect(persistWorkspaceSettings)
      .toHaveBeenCalledWith({
        'stTest.selectedModes': [
          'kernel',
          'aclnn',
        ],
        'stTest.kernel.arguments': [
          '--warmup',
          'false',
        ],
        'stTest.aclnn.arguments': ['--repeat=2'],
      }, workspaceRoot);
    expect(dispatch)
      .toHaveBeenCalledWith({
        workspaceRoot,
        operatorName: 'add',
        operatorPath: '/workspace/add',
        modes: [
          'kernel',
          'aclnn',
        ],
        argumentsByMode: {
          kernel: [
            '--warmup',
            'false',
          ],
          aclnn: ['--repeat=2'],
          e2e: [],
        },
      });
    expect(closeOptionsPanel)
      .toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'reserved',
      ['--output=/tmp/escape.csv'],
    ],
    [
      'empty',
      ['   '],
    ],
    [
      'nul',
      ['bad\0token'],
    ],
  ])('rejects %s tokens without saving or queueing', async (_label, kernelArguments) => {
    await expect(createController()
      .runOptions({
        contextToken,
        selectedModes: ['kernel'],
        argumentsByMode: {
          kernel: kernelArguments,
          aclnn: [],
        },
      })).rejects.toThrow();
    expect(persistWorkspaceSettings).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not persist when a selected mode became unavailable', async () => {
    await expect(createController()
      .runOptions({
        contextToken,
        selectedModes: ['e2e'],
        argumentsByMode: {},
      })).rejects.toThrow();
    expect(persistWorkspaceSettings).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects a stale panel context before saving or queueing', async () => {
    await expect(createController()
      .runOptions({
        contextToken: 'another-operator',
        selectedModes: ['kernel'],
        argumentsByMode: { kernel: [] },
      })).rejects.toThrow();
    expect(persistWorkspaceSettings).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('reports when the queue does not accept the run', async () => {
    dispatch.mockResolvedValue(false);

    await expect(createController()
      .runOptions({
        contextToken,
        selectedModes: ['kernel'],
        argumentsByMode: { kernel: [] },
      })).rejects.toThrow();
    expect(persistWorkspaceSettings)
      .toHaveBeenCalled();
    expect(closeOptionsPanel).not.toHaveBeenCalled();
  });
});
