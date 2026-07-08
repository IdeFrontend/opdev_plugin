jest.mock('@plugin/domain/services/configuration', () => ({
  getConfigById: jest.fn(),
  getConfig: jest.fn(),
}));

import * as vscode from 'vscode';
import { getConfigById } from '@plugin/domain/services/configuration';
import { ConfigService } from '@plugin/service/config-service';
import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';

describe('ConfigService.getRuntimeConfigById', () => {
  const getStore: Record<string, unknown> = {};
  const inspectStore: Record<string, vscode.ConfigurationInspect<unknown> | undefined> = {};
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
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);
    Object.keys(inspectStore)
      .forEach((k) => delete inspectStore[k]);
    (getConfigById as jest.Mock).mockImplementation(() => undefined);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: <T>(key: string) => (
        inspectStore[key] as vscode.ConfigurationInspect<T> | undefined
      ) ?? inspectFromStore<T>(key),
      get: <T>(key: string) => getStore[key] as T | undefined,
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
  });

  it('uses workspace compileCommand only (no legacy script in user_options)', () => {
    (getConfigById as jest.Mock).mockReturnValue({
      config_id: 1,
      config_type: 'build_op',
      script: 'stale-db-script-column',
      target_file: 'stale-db-target-column',
      user_options: {
        script: 'from-db-should-not-appear',
        target_file: 'stale-db-target',
      },
    });
    getStore['compileAndDeploy.buildConfig.compileCommand'] = 'from-settings';
    getStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = 'from-settings-run';

    const runtime = ConfigService.getRuntimeConfigById(1);

    expect((runtime?.user_options as Record<string, unknown>).script)
      .toBe('from-settings');
    expect(runtime?.script)
      .toBe('from-settings');
    expect(runtime?.target_file)
      .toBe('from-settings-run');
  });

  it('ignores user-scope deploy target when workspace deploy target is unset', () => {
    (getConfigById as jest.Mock).mockReturnValue({
      config_id: 10,
      config_type: 'build_op',
      user_options: { target_file: 'stale-db-target' },
    });
    getStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = 'user-scope-run';
    inspectStore['compileAndDeploy.buildConfig.deployCommandOrRunCommand'] = {
      key: 'compileAndDeploy.buildConfig.deployCommandOrRunCommand',
      userValue: 'user-scope-run',
    };

    const runtime = ConfigService.getRuntimeConfigById(10);

    expect(runtime?.target_file)
      .toBeUndefined();
    expect((runtime?.user_options as Record<string, unknown>).target_file)
      .toBeUndefined();
  });

  it('build_example script comes from settings, not legacy DB column', () => {
    (getConfigById as jest.Mock).mockReturnValue({
      config_id: 2,
      config_type: 'build_example',
      script: 'stale-db-example-script',
      user_options: { script: 'stale-db-user-options-script' },
    });
    getStore['compileAndDeploy.exampleBuildConfig.runCommand'] = 'example-from-settings';

    const runtime = ConfigService.getRuntimeConfigById(2);

    expect(runtime?.script)
      .toBe('example-from-settings');
    expect((runtime?.user_options as Record<string, unknown>).script)
      .toBe('example-from-settings');
  });

  it('build_example script is undefined when runCommand setting is absent (no legacy fallback)', () => {
    (getConfigById as jest.Mock).mockReturnValue({
      config_id: 3,
      config_type: 'build_example',
      user_options: { script: 'bash build.sh --vendor_name=custom --run_example' },
    });

    const runtime = ConfigService.getRuntimeConfigById(3);

    expect(runtime?.script)
      .toBeUndefined();
    expect((runtime?.user_options as Record<string, unknown>).script)
      .toBeUndefined();
  });

  it('build_example execution_mode is undefined when setting is absent (no legacy default)', () => {
    (getConfigById as jest.Mock).mockReturnValue({
      config_id: 5,
      config_type: 'build_example',
      user_options: {
        script: 'bash build.sh --run_example',
        execution_mode: 'eager',
      },
    });

    const runtime = ConfigService.getRuntimeConfigById(5);

    expect((runtime?.user_options as Record<string, unknown>).execution_mode)
      .toBeUndefined();
  });

  it('build_example execution_mode comes from settings when set', () => {
    (getConfigById as jest.Mock).mockReturnValue({
      config_id: 6,
      config_type: 'build_example',
      user_options: {
        script: 'bash build.sh',
        execution_mode: 'graph',
      },
    });
    getStore['compileAndDeploy.exampleBuildConfig.executionMode'] = 'graph';

    const runtime = ConfigService.getRuntimeConfigById(6);

    expect((runtime?.user_options as Record<string, unknown>).execution_mode)
      .toBe('graph');
  });

  it('sanitizer script is undefined when sanitizerCompileCommand setting is absent (no legacy fallback)', () => {
    (getConfigById as jest.Mock).mockReturnValue({
      config_id: 4,
      config_type: 'sanitizer',
      user_options: { script: 'bash build.sh --mssanitizer' },
    });

    const runtime = ConfigService.getRuntimeConfigById(4);

    expect((runtime?.user_options as Record<string, unknown>).script)
      .toBeUndefined();
  });

  it('on_board script is undefined when onBoardCompileCommand setting is absent (no compileCommand fallback)', () => {
    (getConfigById as jest.Mock).mockReturnValue({
      config_id: 7,
      config_type: 'on_board',
      user_options: { script: 'bash build.sh --onboard' },
    });
    getStore['compileAndDeploy.buildConfig.compileCommand'] = 'general-compile';

    const runtime = ConfigService.getRuntimeConfigById(7);

    expect((runtime?.user_options as Record<string, unknown>).script)
      .toBeUndefined();
  });

  it('surfaces the synced sanitizer target_file from user_options as the runtime top-level target_file', () => {
    (getConfigById as jest.Mock).mockReturnValue({
      config_id: 8,
      config_type: 'sanitizer',
      user_options: { target_file: 'python3 ./triton_vector_add.py' },
    });

    const runtime = ConfigService.getRuntimeConfigById(8);

    expect(runtime?.target_file)
      .toBe('python3 ./triton_vector_add.py');
  });

  it('Triton getProfilerTargetFile resolves the synced sanitizer target end-to-end via getRuntimeConfigById', () => {
    (getConfigById as jest.Mock).mockReturnValue({
      config_id: 9,
      config_type: 'sanitizer',
      op: 'triton_vector_add',
      user_options: { target_file: 'python3 ./triton_vector_add.py' },
    });

    const runtime = ConfigService.getRuntimeConfigById(9) as Parameters<
      TritonCommandStrategy['getProfilerTargetFile']
    >[0];
    const strategy = new TritonCommandStrategy();

    expect(strategy.getProfilerTargetFile(runtime, null, NaN))
      .toBe('python3 ./triton_vector_add.py');
  });

  it('maps sanitizer detectionScope=singleBlock to useBlock=true and carries blockId', () => {
    getStore['sanitizer.detectionScope'] = 'singleBlock';
    getStore['sanitizer.blockId'] = 7;

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('sanitizer', {});

    expect(opts.useBlock)
      .toBe(true);
    expect(opts.blockId)
      .toBe(7);
  });

  it('maps sanitizer detectionScope=global to useBlock=false', () => {
    getStore['sanitizer.detectionScope'] = 'global';
    getStore['sanitizer.blockId'] = 7;

    const opts = ConfigService.buildUserOptionsFromWorkspaceSettings('sanitizer', {});

    expect(opts.useBlock)
      .toBe(false);
  });
});
