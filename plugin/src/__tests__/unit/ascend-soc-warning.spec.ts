jest.mock('i18next', () => ({
  t: (key: string) => {
    const labels: Record<string, string> = {
      'extension.ascendEnv.socNotDetected.message': 'NPU information could not be found.',
      'extension.ascendEnv.socNotDetected.openSettings': 'Open SoC setting…',
      'extension.ascendEnv.socNotDetected.continue': 'Continue',
    };

    return labels[key] ?? key;
  },
}));

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
  resolveAscendEnvForOperatorCommand,
} from '@plugin/domain/utils/ascend-util';
import { maybeWarnSocNotDetected } from '@plugin/helpers/ascend-soc-warning';
import {
  EXTENSION_ID, settingsKey,
} from '@shared/flavor';
import enMessages from '@shared/i18n/en';
import zhMessages from '@shared/i18n/zh-cn';

const emptyDefaultResolution = {
  socVersion: '',
  npuArch: '',
  simulatorType: undefined,
  source: {
    socVersion: 'default' as const,
    simulatorType: 'n/a' as const,
    npuArch: 'derived-from-soc' as const,
  },
};

describe('ascend SOC undetected warning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.window.showWarningMessage as jest.Mock).mockReset();
    (vscode.window.showWarningMessage as jest.Mock).mockImplementation(jest.fn());
    _primeSocDetectionFailedForTest();
    const { getSocVersionWithWorkspaceOverride } = jest.requireMock('@plugin/helpers/operator-project-workspace-config') as { getSocVersionWithWorkspaceOverride: jest.Mock };

    getSocVersionWithWorkspaceOverride.mockReturnValue('');
  });

  it('shows a warning on every operator command run when SOC resolution uses the empty default', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockImplementation(() => Promise.resolve('Continue'));

    await resolveAscendEnvForOperatorCommand({ script: 'cd build && ./build.sh' });
    await resolveAscendEnvForOperatorCommand({ script: 'cd build && ./build.sh' });

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledTimes(2);
  });

  it('does not warn from resolveAscendEnv even when SOC is empty', () => {
    resolveAscendEnv({ isSimulator: false });
    resolveAscendEnv({ isSimulator: false });

    expect(vscode.window.showWarningMessage)
      .not.toHaveBeenCalled();
  });

  it('does not warn when SOC is resolved from workspace', async () => {
    const { getSocVersionWithWorkspaceOverride } = jest.requireMock('@plugin/helpers/operator-project-workspace-config') as { getSocVersionWithWorkspaceOverride: jest.Mock };

    getSocVersionWithWorkspaceOverride.mockReturnValue('ascend950');

    await resolveAscendEnvForOperatorCommand({ script: 'cd build && ./build.sh' });

    expect(vscode.window.showWarningMessage)
      .not.toHaveBeenCalled();
  });

  it('does not warn when explicit workspace socVersion setting is set', () => {
    const { getSocVersionWithWorkspaceOverride } = jest.requireMock('@plugin/helpers/operator-project-workspace-config') as { getSocVersionWithWorkspaceOverride: jest.Mock };

    getSocVersionWithWorkspaceOverride.mockReturnValue('ascend950');

    maybeWarnSocNotDetected(emptyDefaultResolution);

    expect(vscode.window.showWarningMessage)
      .not.toHaveBeenCalled();
  });

  it('still warns when only User-scoped socVersion would apply (resolver ignores User scope)', () => {
    const { getSocVersionWithWorkspaceOverride } = jest.requireMock('@plugin/helpers/operator-project-workspace-config') as { getSocVersionWithWorkspaceOverride: jest.Mock };

    getSocVersionWithWorkspaceOverride.mockReturnValue('');

    maybeWarnSocNotDetected(emptyDefaultResolution);

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledTimes(1);
  });

  it('maybeWarnSocNotDetected fires on every call for empty default source', async () => {
    await maybeWarnSocNotDetected(emptyDefaultResolution);
    await maybeWarnSocNotDetected(emptyDefaultResolution);

    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalledTimes(2);

    await maybeWarnSocNotDetected({
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
      .toHaveBeenCalledTimes(2);
  });

  it('opens the Workspace-scope SOC setting when the warning action is clicked', async () => {
    // Resolve the warning button click with whatever label was offered, so the
    // assertion does not depend on i18next initialization.
    (vscode.window.showWarningMessage as jest.Mock).mockImplementation((_message: string, label: string) => Promise.resolve(label));

    await maybeWarnSocNotDetected(emptyDefaultResolution);

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'workbench.action.openWorkspaceSettings',
        `@ext:${EXTENSION_ID} ${settingsKey('environment.socVersion')}`,
      );
  });

  it('returns continue when user clicks Continue button', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockImplementation((_message: string, _openSettingsLabel: string, continueLabel: string) => Promise.resolve(continueLabel));

    const result = await maybeWarnSocNotDetected(emptyDefaultResolution);

    expect(result)
      .toBe('continue');
  });

  it('returns open-settings when user clicks Open Settings button', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockImplementation((_message: string, openSettingsLabel: string) => Promise.resolve(openSettingsLabel));

    const result = await maybeWarnSocNotDetected(emptyDefaultResolution);

    expect(result)
      .toBe('open-settings');
  });

  it('returns cancelled when user dismisses the warning', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockImplementation(() => Promise.resolve(undefined));

    const result = await maybeWarnSocNotDetected(emptyDefaultResolution);

    expect(result)
      .toBe('cancelled');
  });

  it('returns undefined from resolveAscendEnvForOperatorCommand when user opens settings', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Open SoC setting…');

    const result = await resolveAscendEnvForOperatorCommand({ script: 'cd build && ./build.sh' });

    expect(result)
      .toBeUndefined();
  });

  it('returns undefined from resolveAscendEnvForOperatorCommand when user cancels', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

    const result = await resolveAscendEnvForOperatorCommand({ script: 'cd build && ./build.sh' });

    expect(result)
      .toBeUndefined();
  });
});

describe('SOC-not-detected message (issue #43)', () => {
  const KEY = 'extension.ascendEnv.socNotDetected.message';

  it('uses short English wording without asys/npu-smi troubleshooting', () => {
    expect(enMessages[KEY])
      .toBe('NPU information could not be found. Please configure the SoC version manually.');
    expect(enMessages[KEY]).not.toContain('asys');
    expect(enMessages[KEY]).not.toContain('npu-smi');
  });

  it('uses short Chinese wording per issue #43', () => {
    expect(zhMessages[KEY])
      .toBe('找不到 NPU 相关信息，请手动配置 SoC 版本。');
    expect(zhMessages[KEY]).not.toContain('asys');
    expect(zhMessages[KEY]).not.toContain('npu-smi');
  });
});
