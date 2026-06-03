import * as vscode from 'vscode';

import { ConfigService } from '@plugin/service/config-service';

jest.mock('@plugin/domain/utils/ascend-util', () => ({
  resolveEffectiveCannSoc: jest.fn(() => ''),
}));

import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';

describe('ConfigService.buildUserOptionsFromWorkspaceSettings A5 on-board', () => {
  const getStore: Record<string, unknown> = {};

  beforeEach(() => {
    Object.keys(getStore).forEach((k) => delete getStore[k]);
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('');
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn(),
      get: <T>(key: string) => getStore[key] as T | undefined,
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  it('applies pcSampling but not cacheHeatmap when workspace soc is ascend950', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['performanceTuning.onBoard.pcSampling'] = true;
    getStore['performanceTuning.onBoard.cacheHeatmap'] = true;

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('on_board', {});

    expect(opts.PCSampling).toBe(true);
    expect(opts.MemoryDetail).toBeUndefined();
  });

  it('applies cacheHeatmap but not pcSampling when workspace soc is not A5', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend910b');
    getStore['performanceTuning.onBoard.pcSampling'] = true;
    getStore['performanceTuning.onBoard.cacheHeatmap'] = false;

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('on_board', {});

    expect(opts.MemoryDetail).toBe(false);
    expect(opts.PCSampling).toBeUndefined();
  });

  it('applies A5 on-board metrics when effective soc is detected ascend950 without workspace override', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['performanceTuning.onBoard.pcSampling'] = true;
    getStore['performanceTuning.onBoard.cacheHeatmap'] = true;

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('on_board', {});

    expect(opts.PCSampling).toBe(true);
    expect(opts.MemoryDetail).toBeUndefined();
  });
});
