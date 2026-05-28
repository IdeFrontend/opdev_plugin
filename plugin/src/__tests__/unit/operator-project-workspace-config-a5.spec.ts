import type { BuildConfig } from '@shared/api-types';
import * as vscode from 'vscode';

import { mergeBuildConfigsWithOperatorProjectWorkspace } from '@plugin/helpers/operator-project-workspace-config';

jest.mock('@plugin/domain/utils/ascend-util', () => ({
  resolveEffectiveCannSoc: jest.fn(() => ''),
}));

import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';

const inspectStore: Record<string, { workspaceValue?: unknown }> = {};

describe('mergeBuildConfigsWithOperatorProjectWorkspace A5 on-board', () => {
  beforeEach(() => {
    Object.keys(inspectStore)
      .forEach((k) => delete inspectStore[k]);
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('');
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: <T>(key: string) => inspectStore[key] as {
        workspaceValue?: T;
      } | undefined,
      get: jest.fn(),
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  it('applies pcSampling but not cacheHeatmap when workspace soc is ascend950', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    inspectStore['environment.socVersion'] = { workspaceValue: 'ascend950' };
    inspectStore['performanceTuning.onBoard.pcSampling'] = { workspaceValue: true };
    inspectStore['performanceTuning.onBoard.cacheHeatmap'] = { workspaceValue: true };

    const configs: BuildConfig[] = [
      {
        config_type: 'on_board',
        user_options: {},
      } as BuildConfig,
    ];

    const merged = mergeBuildConfigsWithOperatorProjectWorkspace(configs);
    const opts = merged[0].user_options as Record<string, unknown>;

    expect(opts.PCSampling)
      .toBe(true);
    expect(opts.MemoryDetail)
      .toBeUndefined();
  });

  it('applies cacheHeatmap but not pcSampling when workspace soc is not A5', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend910b');
    inspectStore['environment.socVersion'] = { workspaceValue: 'ascend910b' };
    inspectStore['performanceTuning.onBoard.pcSampling'] = { workspaceValue: true };
    inspectStore['performanceTuning.onBoard.cacheHeatmap'] = { workspaceValue: false };

    const configs: BuildConfig[] = [
      {
        config_type: 'on_board',
        user_options: {},
      } as BuildConfig,
    ];

    const merged = mergeBuildConfigsWithOperatorProjectWorkspace(configs);
    const opts = merged[0].user_options as Record<string, unknown>;

    expect(opts.MemoryDetail)
      .toBe(false);
    expect(opts.PCSampling)
      .toBeUndefined();
  });

  it('applies A5 on-board metrics when effective soc is detected ascend950 without workspace override', () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');
    inspectStore['performanceTuning.onBoard.pcSampling'] = { workspaceValue: true };
    inspectStore['performanceTuning.onBoard.cacheHeatmap'] = { workspaceValue: true };

    const configs: BuildConfig[] = [
      {
        config_type: 'on_board',
        user_options: {},
      } as BuildConfig,
    ];

    const merged = mergeBuildConfigsWithOperatorProjectWorkspace(configs);
    const opts = merged[0].user_options as Record<string, unknown>;

    expect(opts.PCSampling)
      .toBe(true);
    expect(opts.MemoryDetail)
      .toBeUndefined();
  });
});
