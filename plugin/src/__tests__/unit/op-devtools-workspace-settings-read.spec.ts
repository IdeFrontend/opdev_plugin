import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';
import { resolveBuildOpBaseContext } from '@plugin/domain/services/command';
import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';
import {
  getConfiguredEnvironmentScriptPath,
  getEnvironmentScriptPathFromWorkspace,
  getEnvironmentSocVersionFromWorkspace,
  getSocVersionWithWorkspaceOverride,
  getWorkspaceSimulatorType,
  readWorkspaceProjectTypeSetting,
} from '@plugin/helpers/operator-project-workspace-config';
import { ConfigService } from '@plugin/service/config-service';

/**
 * Runtime configs are synthesized from workspace settings + cache.json only —
 * the per-section DAO factories.
 */
describe('ConfigService per-section DAO factories (settings + cache only)', () => {
  const getStore: Record<string, unknown> = {};
  const inspectStore: Record<string, vscode.ConfigurationInspect<unknown> | undefined> = {};
  let workspacePath: string;
  let cachePath: string;

  const inspectFromStore = <T>(key: string): vscode.ConfigurationInspect<T> | undefined => {
    if (!(key in getStore)) {
      return undefined;
    }

    return {
      key,
      workspaceFolderValue: getStore[key] as T,
    };
  };

  function seedCache(content: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, `${JSON.stringify({
      schemaVersion: 1,
      ...content,
    }, null, 2)}\n`, 'utf8');
  }

  beforeEach(() => {
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);
    Object.keys(inspectStore)
      .forEach((k) => delete inspectStore[k]);
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-read-'));
    cachePath = path.join(workspacePath, '.vscode', 'cache.json');
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: <T>(key: string) => (
        inspectStore[key] as vscode.ConfigurationInspect<T> | undefined
      ) ?? inspectFromStore<T>(key),
      get: <T>(key: string) => getStore[key] as T | undefined,
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: workspacePath } } as vscode.WorkspaceFolder];
  });

  afterEach(() => {
    fs.rmSync(workspacePath, {
      recursive: true,
      force: true,
    });
  });

  it('build_op script/target come from workspace settings only (no stored row)', () => {
    getStore['compileAndDeploy.buildConfig.compileCommand'] = 'from-settings';
    getStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = 'from-settings-run';

    const config = ConfigService.getBuildOpConfig();

    expect(config.script)
      .toBe('from-settings');
    expect(config.targetFile)
      .toBe('from-settings-run');
  });

  it('does not surface user-scope (global) deploy target when the workspace scopes are unset', () => {
    inspectStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = {
      key: 'compileAndDeploy.buildConfig.deployCommandOrRunCommand',
      // User-level settings are reported by VS Code as `globalValue` on the
      // inspect result (there is no `userValue` field). The workspace config
      // read must NOT fall back to user scope — settings.json is the only source.
      globalValue: 'user-scope-run',
      workspaceValue: undefined,
      workspaceFolderValue: undefined,
    };

    expect(ConfigService.getBuildOpConfig().targetFile)
      .toBeNull();
  });

  it('workspace-folder deploy target wins over user/workspace scopes', () => {
    getStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = 'workspace-folder-run';
    inspectStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = {
      key: 'compileAndDeploy.buildConfig.deployCommandOrRunCommand',
      globalValue: 'user-scope-run',
      workspaceValue: 'workspace-scope-run',
      workspaceFolderValue: 'workspace-folder-run',
    };

    expect(ConfigService.getBuildOpConfig().targetFile)
      .toBe('workspace-folder-run');
  });

  it('build_example script comes from settings, not a default', () => {
    getStore['compileAndDeploy.exampleBuildConfig.runCommand'] = 'example-from-settings';

    expect(ConfigService.getBuildExampleConfig().script)
      .toBe('example-from-settings');
  });

  it('build_example script is empty when runCommand setting is absent (no fallback)', () => {
    expect(ConfigService.getBuildExampleConfig().script)
      .toBe('');
  });

  it('build_example execution_mode defaults to eager when the setting is absent', () => {
    expect(ConfigService.getBuildExampleConfig().executionMode)
      .toBe('eager');
  });

  it('build_example execution_mode comes from settings when set', () => {
    getStore['compileAndDeploy.exampleBuildConfig.executionMode'] = 'graph';

    expect(ConfigService.getBuildExampleConfig().executionMode)
      .toBe('graph');
  });

  it('sanitizer script is empty when sanitizerCompileCommand setting is absent (no fallback)', () => {
    expect(ConfigService.getSanitizerConfig(workspacePath, 'op_add').script)
      .toBe('');
  });

  it('on_board script is empty when onBoardCompileCommand is absent (no compileCommand fallback)', () => {
    getStore['compileAndDeploy.buildConfig.compileCommand'] = 'general-compile';

    expect(ConfigService.getOnBoardConfig(workspacePath).script)
      .toBe('');
  });

  it('surfaces the synced sanitizer target_file from cache.sanitizerPythonTarget[op]', () => {
    seedCache({ sanitizerPythonTarget: { triton_vector_add: 'python3 ./triton_vector_add.py' } });

    // The sanitizer target surfaces on the DAO directly — command builders read
    // `targetFile` off the config.
    expect(ConfigService.getSanitizerConfig(workspacePath, 'triton_vector_add').targetFile)
      .toBe('python3 ./triton_vector_add.py');
  });

  it('does not leak another op sanitizer target into the config', () => {
    seedCache({ sanitizerPythonTarget: { other_op: 'python3 ./other.py' } });

    expect(ConfigService.getSanitizerConfig(workspacePath, 'triton_vector_add').targetFile)
      .toBeNull();
  });

  it('Triton getProfilerTargetFile resolves the synced sanitizer target end-to-end via getSanitizerConfig', () => {
    seedCache({ sanitizerPythonTarget: { triton_vector_add: 'python3 ./triton_vector_add.py' } });

    const config = ConfigService.getSanitizerConfig(workspacePath, 'triton_vector_add');
    const strategy = new TritonCommandStrategy();

    expect(strategy.getProfilerTargetFile(config, null, 'triton_vector_add'))
      .toBe('python3 ./triton_vector_add.py');
  });

  it('carries the persisted fileMapList from cache.fileMapLists[configType]', () => {
    seedCache({
      fileMapLists: {
        sanitizer: [
          {
            filePath: 'report.txt',
            reportTime: 42,
          },
        ],
        simulate: [],
        on_board: [],
      },
    });

    expect(ConfigService.getSanitizerConfig(workspacePath, 'op_add').fileMapList)
      .toEqual([
        {
          filePath: 'report.txt',
          reportTime: 42,
        },
      ]);
  });

  it('maps sanitizer detectionScope=singleBlock to useBlock=true and carries blockId', () => {
    getStore['sanitizer.detectionScope'] = 'singleBlock';
    getStore['sanitizer.blockId'] = 7;

    const config = ConfigService.getSanitizerConfig(workspacePath);

    expect(config.useBlock)
      .toBe(true);
    expect(config.blockId)
      .toBe(7);
  });

  it('maps sanitizer detectionScope=global to useBlock=false', () => {
    getStore['sanitizer.detectionScope'] = 'global';
    getStore['sanitizer.blockId'] = 7;

    expect(ConfigService.getSanitizerConfig(workspacePath).useBlock)
      .toBe(false);
  });

  it('null socVersion is unset on the workspace scope — readers fall through to empty', () => {
    getStore['environment.socVersion'] = null;

    expect(getSocVersionWithWorkspaceOverride(null))
      .toBe('');
    expect(getEnvironmentSocVersionFromWorkspace())
      .toBe('');
  });

  it('null simulatorType is unset — simulator type reader returns empty', () => {
    getStore['performanceTuning.simulation.simulatorType'] = null;

    expect(getWorkspaceSimulatorType())
      .toBe('');
  });

  it('null environmentScript is unset — script readers fall back to the default', () => {
    getStore['environment.environmentScript'] = null;

    expect(getConfiguredEnvironmentScriptPath())
      .toBeUndefined();
    expect(getEnvironmentScriptPathFromWorkspace())
      .toBe('/etc/profile');
  });

  it('null projectType is unset — project type reader returns undefined', () => {
    getStore['projectType'] = null;

    expect(readWorkspaceProjectTypeSetting())
      .toBeUndefined();
  });

  it('getBuildOpConfig reads op from the operatorNameToCompile setting', () => {
    getStore['compileAndDeploy.buildConfig.operatorNameToCompile'] = 'saved_op';

    expect(ConfigService.getBuildOpConfig().op)
      .toBe('saved_op');
  });

  it('resolveBuildOpBaseContext backfills the op from the operatorNameToCompile setting when the sidebar selection is empty', () => {
    getStore['projectType'] = 'ascend';
    getStore['compileAndDeploy.buildConfig.operatorNameToCompile'] = 'saved_op';

    const ctx = resolveBuildOpBaseContext(workspacePath);

    expect(ctx.op)
      .toBe('saved_op');
    expect(ctx.config.op)
      .toBe('saved_op');
  });

  it('resolveBuildOpBaseContext prefers the config-carried operator name over the sidebar selection', () => {
    getStore['projectType'] = 'ascend';
    getStore['compileAndDeploy.buildConfig.operatorNameToCompile'] = 'saved_op';

    const ctx = resolveBuildOpBaseContext(workspacePath, 'sidebar_op');

    // The config-carried name wins: a standard-custom collection carries the
    // ROOT name in its single config set, and the selection flows only into
    // the --ops={operatorNames} placeholder.
    expect(ctx.op)
      .toBe('saved_op');
    expect(ctx.config.op)
      .toBe('saved_op');
  });
});
