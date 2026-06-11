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
import {
  EXTENSION_ID, settingsKey,
} from '@shared/flavor';
import enMessages from '@shared/i18n/en';
import zhMessages from '@shared/i18n/zh-cn';

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
    const { getSocVersionWithWorkspaceOverride } = jest.requireMock('@plugin/helpers/operator-project-workspace-config') as { getSocVersionWithWorkspaceOverride: jest.Mock };

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

  it('opens the Workspace-scope SOC setting when the warning action is clicked', async () => {
    // Resolve the warning button click with whatever label was offered, so the
    // assertion does not depend on i18next initialization.
    (vscode.window.showWarningMessage as jest.Mock).mockImplementation((_message: string, label: string) => Promise.resolve(label));

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

    await new Promise((resolve) => setImmediate(resolve));

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'workbench.action.openWorkspaceSettings',
        `@ext:${EXTENSION_ID} ${settingsKey('environment.socVersion')}`,
      );
  });
});

describe('SOC-not-detected message A3 example', () => {
  const KEY = 'extension.ascendEnv.socNotDetected.message';

  it('recommends ascend910_93 (not ascend910b) for A3 in English', () => {
    expect(enMessages[KEY])
      .toContain('ascend910_93 on A3');
    expect(enMessages[KEY]).not.toContain('ascend910b on A3');
  });

  it('recommends ascend910_93 for A3 in Chinese', () => {
    expect(zhMessages[KEY])
      .toContain('A3 使用 ascend910_93');
    expect(zhMessages[KEY]).not.toContain('A3 使用 ascend910b');
  });
});
