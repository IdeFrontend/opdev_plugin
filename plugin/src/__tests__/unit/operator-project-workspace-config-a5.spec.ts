import * as vscode from 'vscode';

import { ConfigService } from '@plugin/service/config-service';

jest.mock('@plugin/domain/utils/ascend-util', () => ({ resolveEffectiveCannSoc: jest.fn(() => '') }));

import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';

describe('ConfigService.buildUserOptionsFromWorkspaceSettings A5 on-board', () => {
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

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('on_board', {});

    expect(opts.PCSampling)
      .toBe(true);
    expect(opts.MemoryDetail)
      .toBeUndefined();
  });

  it('applies cacheHeatmap but not pcSampling when workspace soc is not A5', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend910b');
    getStore['performanceTuning.onBoard.pcSampling'] = true;
    getStore['performanceTuning.onBoard.cacheHeatmap'] = false;

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('on_board', {});

    expect(opts.MemoryDetail)
      .toBe(false);
    expect(opts.PCSampling)
      .toBeUndefined();
  });

  it('applies A5 on-board metrics when effective soc is detected ascend950 without workspace override', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['performanceTuning.onBoard.pcSampling'] = true;
    getStore['performanceTuning.onBoard.cacheHeatmap'] = true;

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('on_board', {});

    expect(opts.PCSampling)
      .toBe(true);
    expect(opts.MemoryDetail)
      .toBeUndefined();
  });

  it.each([
    'ascend910b',
    'ascend910_93',
  ])('defaults sanitizer toolType to mssanitizer for A2/A3 SOC %s', (soc) => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue(soc);

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('sanitizer', {});

    expect(opts.toolType)
      .toBe('mssanitizer');
  });

  it('forces sanitizer toolType to mssanitizer for A2/A3 even when npu-check is configured', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend910b');
    getStore['sanitizer.toolType'] = 'npu-check';

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('sanitizer', {});

    expect(opts.toolType)
      .toBe('mssanitizer');
  });

  it('defaults sanitizer toolType to npu-check for non-A2/A3 SOC', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('sanitizer', {});

    expect(opts.toolType)
      .toBe('npu-check');
  });

  it.each([
    'mssanitizer',
    'npu-check',
  ])('keeps configured sanitizer toolType %s for non-A2/A3 SOC', (toolType) => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    getStore['sanitizer.toolType'] = toolType;

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('sanitizer', {});

    expect(opts.toolType)
      .toBe(toolType);
  });
});
