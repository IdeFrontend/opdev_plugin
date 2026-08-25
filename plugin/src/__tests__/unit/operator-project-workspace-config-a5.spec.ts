import * as vscode from 'vscode';

import { ConfigService } from '@plugin/service/config-service';

jest.mock('@plugin/domain/utils/ascend-util', () => ({ resolveEffectiveCannSoc: jest.fn(() => '') }));

import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';

describe('ConfigService.getOnBoardConfig A5 on-board', () => {
  const getStore: Record<string, unknown> = {};

  beforeEach(() => {
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('');
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      // readOpDevtoolsSetting uses inspect() workspace* values, not get().
      inspect: jest.fn((key: string) => {
        if (!(key in getStore)) {
          return undefined;
        }

        return { workspaceValue: getStore[key] };
      }),
      get: <T>(key: string) => getStore[key] as T | undefined,
      update: jest.fn(),
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  it('applies pcSampling but not cacheHeatmap when workspace soc is ascend950', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['performanceTuning.onBoard.pcSampling'] = true;
    getStore['performanceTuning.onBoard.cacheHeatmap'] = true;

    const config = ConfigService.getOnBoardConfig('/workspace');

    expect(config.pcSampling)
      .toBe(true);
    // cacheHeatmap is gated off on A5 profilers — the DAO yields false, not undefined.
    expect(config.memoryDetail)
      .toBe(false);
  });

  it('applies cacheHeatmap but not pcSampling when workspace soc is not A5', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend910b');
    getStore['performanceTuning.onBoard.pcSampling'] = true;
    getStore['performanceTuning.onBoard.cacheHeatmap'] = false;

    const config = ConfigService.getOnBoardConfig('/workspace');

    expect(config.memoryDetail)
      .toBe(false);
    // pcSampling is gated off on non-A5 profilers — the DAO yields false, not undefined.
    expect(config.pcSampling)
      .toBe(false);
  });

  it('applies A5 on-board metrics when effective soc is detected ascend950 without workspace override', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['performanceTuning.onBoard.pcSampling'] = true;
    getStore['performanceTuning.onBoard.cacheHeatmap'] = true;

    const config = ConfigService.getOnBoardConfig('/workspace');

    expect(config.pcSampling)
      .toBe(true);
    expect(config.memoryDetail)
      .toBe(false);
  });
});
