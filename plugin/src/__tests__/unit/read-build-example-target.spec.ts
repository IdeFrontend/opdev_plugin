import * as vscode from 'vscode';

import { ConfigService } from '@plugin/service/config-service';

describe('readBuildExampleTargetFromWorkspace', () => {
  const getStore: Record<string, unknown> = {};
  const inspectFromStore = <T>(key: string): vscode.ConfigurationInspect<T> | undefined => {
    if (!(key in getStore)) {
      return undefined;
    }

    return {
      key,
      workspaceFolderValue: getStore[key] as T,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: inspectFromStore,
      get: <T>(key: string) => getStore[key] as T | undefined,
    });
  });

  it('returns the configured exampleBuildConfig.targetFile value', () => {
    getStore['compileAndDeploy.exampleBuildConfig.targetFile'] = '/ws/op/build/test_aclnn_myop';

    expect(ConfigService.readBuildExampleTargetFromWorkspace())
      .toBe('/ws/op/build/test_aclnn_myop');
  });

  it('returns the empty string when the key is set to "" (callers fall back to the operator default)', () => {
    getStore['compileAndDeploy.exampleBuildConfig.targetFile'] = '';

    expect(ConfigService.readBuildExampleTargetFromWorkspace())
      .toBe('');
  });

  it('returns undefined when the key is absent (package default)', () => {
    expect(ConfigService.readBuildExampleTargetFromWorkspace())
      .toBeUndefined();
  });
});

describe('hasBuildExampleConfig (pre-build example gate)', () => {
  const getStore: Record<string, unknown> = {};
  const inspectFromStore = <T>(key: string): vscode.ConfigurationInspect<T> | undefined => {
    if (!(key in getStore)) {
      return undefined;
    }

    return {
      key,
      workspaceFolderValue: getStore[key] as T,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: inspectFromStore,
      get: <T>(key: string) => getStore[key] as T | undefined,
    });
  });

  it('is true when the build_example user options are non-empty', () => {
    getStore['compileAndDeploy.exampleBuildConfig.runCommand'] = 'bash build.sh --run_example';

    expect(ConfigService.hasBuildExampleConfig())
      .toBe(true);
  });

  it('is true when the user options are empty but exampleBuildConfig.targetFile is set', () => {
    // `getBuildExampleConfigId()` — the build_example config ROW exists,
    // independent of the values it holds; a row carrying only a target_file
    // still runs the pre-build example step. The settings are the row: an
    // empty user-options map with a set targetFile must still gate the step ON.
    getStore['compileAndDeploy.exampleBuildConfig.targetFile'] = '/ws/op/build/test_aclnn_myop';

    expect(ConfigService.hasBuildExampleConfig())
      .toBe(true);
  });

  it('is false when neither user options nor targetFile are set', () => {
    expect(ConfigService.hasBuildExampleConfig())
      .toBe(false);
  });
});
