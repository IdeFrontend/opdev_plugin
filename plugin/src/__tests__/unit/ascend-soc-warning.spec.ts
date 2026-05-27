jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({
  getWorkspaceSimulatorType: jest.fn(() => ''),
  getSocVersionWithWorkspaceOverride: jest.fn(() => ''),
}));
jest.mock('@plugin/domain/utils/global-env-snapshot', () => ({
  getGlobalEnvSnapshot: jest.fn(() => ({
    socVersion: undefined,
    simulatorType: undefined,
    npuArch: undefined,
    ascendEnvScript: undefined,
  })),
}));

import * as vscode from 'vscode';

import {
  _primeSocDetectionFailedForTest,
  resolveAscendEnv,
} from '@plugin/domain/utils/ascend-util';
import {
  _resetSocUndetectedWarningForTest,
  maybeWarnSocNotDetected,
} from '@plugin/helpers/ascend-soc-warning';

describe('ascend SOC undetected warning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _primeSocDetectionFailedForTest();
    _resetSocUndetectedWarningForTest();
  });

  it('shows a warning once when SOC resolution uses the empty default', () => {
    resolveAscendEnv({ isSimulator: false });
    resolveAscendEnv({ isSimulator: false });

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledTimes(1);
  });

  it('does not warn when SOC is resolved from workspace', () => {
    const { getSocVersionWithWorkspaceOverride } = jest.requireMock(
      '@plugin/helpers/operator-project-workspace-config',
    ) as { getSocVersionWithWorkspaceOverride: jest.Mock };

    getSocVersionWithWorkspaceOverride.mockReturnValue('ascend950');

    resolveAscendEnv({ isSimulator: false });

    expect(vscode.window.showWarningMessage)
      .not.toHaveBeenCalled();
  });

  it('maybeWarnSocNotDetected only fires for empty default source', () => {
    maybeWarnSocNotDetected({
      socVersion: '',
      npuArch: '',
      simulatorType: undefined,
      source: {
        socVersion: 'default',
        simulatorType: 'n/a',
        npuArch: 'derived-from-soc',
      },
    });
    maybeWarnSocNotDetected({
      socVersion: '',
      npuArch: '',
      simulatorType: undefined,
      source: {
        socVersion: 'default',
        simulatorType: 'n/a',
        npuArch: 'derived-from-soc',
      },
    });

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledTimes(1);

    _resetSocUndetectedWarningForTest();

    maybeWarnSocNotDetected({
      socVersion: 'ascend950',
      npuArch: 'dav-3510',
      simulatorType: undefined,
      source: {
        socVersion: 'workspace-setting',
        simulatorType: 'n/a',
        npuArch: 'derived-from-soc',
      },
    });

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledTimes(1);
  });
});
