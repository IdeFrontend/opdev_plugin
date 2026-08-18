import * as vscode from 'vscode';

import {
  ENVIRONMENT_SCRIPT_SETTING,
  getAscendEnvScriptWithWorkspaceOverride,
  getConfiguredEnvironmentScriptPath,
  getEnvironmentScriptPathFromWorkspace,
  getEnvironmentSocVersionFromWorkspace,
  getSocVersionWithWorkspaceOverride,
  getWorkspaceNpuArch,
  getWorkspaceSimulatorType,
} from '@plugin/helpers/operator-project-workspace-config';
import { ConfigService } from '@plugin/service/config-service';

const NPU_ARCH_SETTING = 'environment.npuArch';
const SOC_VERSION_SETTING = 'environment.socVersion';
const SIMULATOR_TYPE_SETTING = 'performanceTuning.simulation.simulatorType';

type Inspection = {
  workspaceFolderValue?: unknown;
  workspaceValue?: unknown;
};

const settings: Record<string, Inspection> = {};

/** Mirrors VS Code: a configured `null` reaches `get` as `null`, the default is not applied. */
const effectiveValue = (key: string): unknown => {
  const inspection = settings[key];

  if (!inspection) {
    return undefined;
  }

  return 'workspaceFolderValue' in inspection
    ? inspection.workspaceFolderValue
    : inspection.workspaceValue;
};

const setSetting = (key: string, value: unknown): void => {
  settings[key] = { workspaceValue: value };
};

describe('workspace settings written as null (issue #29 follow-up)', () => {
  beforeEach(() => {
    Object.keys(settings)
      .forEach((key) => delete settings[key]);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: (key: string) => settings[key],
      get: (key: string, fallback: unknown) => {
        const value = effectiveValue(key);

        return value === undefined ? fallback : value;
      },
      update: jest.fn(),
    });
  });

  it('getWorkspaceNpuArch keeps the SOC-derived arch instead of exporting the string "null"', () => {
    setSetting(NPU_ARCH_SETTING, null);

    expect(getWorkspaceNpuArch())
      .toBe('');
  });

  it('getWorkspaceNpuArch ignores an empty npuArch', () => {
    setSetting(NPU_ARCH_SETTING, '');

    expect(getWorkspaceNpuArch())
      .toBe('');
  });

  it('getWorkspaceNpuArch still returns a real arch, trimmed', () => {
    setSetting(NPU_ARCH_SETTING, '  dav-3510  ');

    expect(getWorkspaceNpuArch())
      .toBe('dav-3510');
  });

  it('a null folder-scope value falls through to the workspace-scope value', () => {
    settings[NPU_ARCH_SETTING] = {
      workspaceFolderValue: null,
      workspaceValue: 'dav-2201',
    };

    expect(getWorkspaceNpuArch())
      .toBe('dav-2201');
  });

  it('every sibling reader treats null like an absent setting', () => {
    setSetting(NPU_ARCH_SETTING, null);
    setSetting(SIMULATOR_TYPE_SETTING, null);
    setSetting(SOC_VERSION_SETTING, null);
    setSetting(ENVIRONMENT_SCRIPT_SETTING, null);

    expect(getWorkspaceSimulatorType())
      .toBe('');
    expect(getEnvironmentSocVersionFromWorkspace())
      .toBe('');
    expect(getSocVersionWithWorkspaceOverride('ascend910b'))
      .toBe('ascend910b');
    expect(getConfiguredEnvironmentScriptPath())
      .toBeUndefined();
    expect(getEnvironmentScriptPathFromWorkspace())
      .toBe('/etc/profile');
    expect(getAscendEnvScriptWithWorkspaceOverride('/opt/stored/set_env.sh'))
      .toBe('/opt/stored/set_env.sh');
  });

  it('readOpDevtoolsSetting hands callers undefined for a null setting, not null', () => {
    setSetting(SOC_VERSION_SETTING, null);
    setSetting('compileAndDeploy.buildConfig.compileCommand', null);

    // Callers type this as `string` and run it through String()/trim() — see
    // build-service buildOpCompileScript and readNonEmptyOpDevtoolsSetting.
    expect(ConfigService.readOpDevtoolsSetting<string>(SOC_VERSION_SETTING))
      .toBeUndefined();
    expect(ConfigService.readOpDevtoolsSetting<string>('compileAndDeploy.buildConfig.compileCommand'))
      .toBeUndefined();
  });

  it('readOpDevtoolsSetting falls through a null folder scope to the workspace value', () => {
    settings[SOC_VERSION_SETTING] = {
      workspaceFolderValue: null,
      workspaceValue: 'ascend910b',
    };

    expect(ConfigService.readOpDevtoolsSetting<string>(SOC_VERSION_SETTING))
      .toBe('ascend910b');
  });

  it('never puts a null into build_op user_options', () => {
    setSetting('compileAndDeploy.buildConfig.operatorNameToCompile', null);
    setSetting('compileAndDeploy.buildConfig.deployCommandOrRunCommand', null);

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('build_op');

    expect(opts)
      .not
      .toHaveProperty('op');
    expect(opts)
      .not
      .toHaveProperty('target_file');
  });

  it('an empty string never reaches a command as a value', () => {
    setSetting(SIMULATOR_TYPE_SETTING, '');
    setSetting(SOC_VERSION_SETTING, '');
    setSetting(ENVIRONMENT_SCRIPT_SETTING, '');

    expect(getWorkspaceSimulatorType())
      .toBe('');
    expect(getEnvironmentSocVersionFromWorkspace())
      .toBe('');
    expect(getConfiguredEnvironmentScriptPath())
      .toBeUndefined();
    expect(getEnvironmentScriptPathFromWorkspace())
      .toBe('/etc/profile');
    // Blank is a value the user typed, so it clears the stored override rather than
    // falling through to it — unlike null, which is now read as "never set".
    expect(getSocVersionWithWorkspaceOverride('ascend910b'))
      .toBe('');
    expect(getAscendEnvScriptWithWorkspaceOverride('/opt/stored/set_env.sh'))
      .toBe('');
  });
});
