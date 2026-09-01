jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: { getOpPlugin: jest.fn() } }));

jest.mock('@plugin/domain/utils/ascend-util', () => ({ resolveEffectiveCannSoc: jest.fn(() => 'ascend910b') }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { ConfigService } from '@plugin/service/config-service';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { resolveEffectiveCannSoc } from '@plugin/domain/utils/ascend-util';
import { getIdeSettingsFilePath } from '@plugin/helpers/ide-config-dir';

describe('ConfigService.ensureOpDevtoolsSettingsSeeded', () => {
  let projectPath: string;

  const scripts = {
    buildScript: 'build.sh',
    cpuDebugScript: 'cpu.sh',
    npuDebugScript: 'npu.sh',
    exampleScript: 'example.sh',
    utTestScript: 'ut.sh',
    onBoardScript: 'ob.sh',
    simulateScript: 'sim.sh',
    sanitizerScript: 'san.sh',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-seed-'));
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue({
      getInitialConfigScripts: jest.fn(() => ({ ...scripts })),
      getDefaultPaths: jest.fn(() => ({
        targetOpFile: 'python3 ./run.py',
        targetExampleFile: './example.py',
      })),
    });
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend910b');
  });

  afterEach(() => {
    fs.rmSync(projectPath, {
      recursive: true,
      force: true,
    });
  });

  function readSettings(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(getIdeSettingsFilePath(projectPath), 'utf8')) as Record<string, unknown>;
  }

  it('seeds workspace settings with default arguments (opPath = projectPath, type = ascend)', async () => {
    await ConfigService.ensureOpDevtoolsSettingsSeeded(projectPath);

    const settings = readSettings();

    expect(settings['op-devtools.compileAndDeploy.buildConfig.compileCommand'])
      .toBe('build.sh');
    expect(settings['op-devtools.compileAndDeploy.buildConfig.operatorNameToCompile'])
      .toBe(path.basename(projectPath));
    expect(settings['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand'])
      .toBe('python3 ./run.py');
    expect(settings['op-devtools.compileAndDeploy.buildConfig.sanitizerCompileCommand'])
      .toBe('san.sh');
    expect(settings['op-devtools.environment.environmentScript'])
      .toBe('');

    expect(OperatorPluginRegistry.getOpPlugin)
      .toHaveBeenCalledWith('ascend');
    expect(OperatorPluginRegistry.getOpPlugin('ascend').getInitialConfigScripts)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          op_name: path.basename(projectPath),
          op_type: 'ascend',
          op_path: projectPath,
        }),
        expect.anything(),
      );
  });

  it('resolves the op type from the workspace projectType setting when opType is omitted', async () => {
    fs.mkdirSync(path.dirname(getIdeSettingsFilePath(projectPath)), { recursive: true });
    fs.writeFileSync(
      getIdeSettingsFilePath(projectPath),
      JSON.stringify({ 'op-devtools.projectType': 'cann' }),
      'utf8',
    );

    await ConfigService.ensureOpDevtoolsSettingsSeeded(projectPath);

    expect(OperatorPluginRegistry.getOpPlugin)
      .toHaveBeenCalledWith('cann');
  });

  it('maps standard-custom and ascend-c project types to the ascend toolchain', async () => {
    await ConfigService.ensureOpDevtoolsSettingsSeeded(projectPath, '', 'standard-custom');
    await ConfigService.ensureOpDevtoolsSettingsSeeded(projectPath, '', 'ascend-c');

    expect(OperatorPluginRegistry.getOpPlugin)
      .toHaveBeenCalledWith('ascend');
    expect(OperatorPluginRegistry.getOpPlugin)
      .not.toHaveBeenCalledWith('cann');
  });

  it('uses the torch_library_template target override', async () => {
    await ConfigService.ensureOpDevtoolsSettingsSeeded(projectPath, '', 'ascend', projectPath, 'torch_library_template');

    const settings = readSettings();

    expect(settings['op-devtools.compileAndDeploy.buildConfig.deployCommandOrRunCommand'])
      .toBe('python ../run.py');
  });

  it('warns and swallows a failing plugin script lookup', async () => {
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue({
      getInitialConfigScripts: jest.fn(() => {
        throw new Error('scripts exploded');
      }),
      getDefaultPaths: jest.fn(() => ({
        targetOpFile: 'x',
        targetExampleFile: 'y',
      })),
    });
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await expect(ConfigService.ensureOpDevtoolsSettingsSeeded(projectPath))
      .resolves
      .toBeUndefined();
    expect(warnSpy)
      .toHaveBeenCalledWith('[ensureOpDevtoolsSettingsSeeded] failed: scripts exploded');
    warnSpy.mockRestore();
  });

  it('stringifies non-Error failures in the warning', async () => {
    (OperatorPluginRegistry.getOpPlugin as jest.Mock).mockReturnValue({
      getInitialConfigScripts: jest.fn(() => {
        throw 'boom';
      }),
      getDefaultPaths: jest.fn(() => ({
        targetOpFile: 'x',
        targetExampleFile: 'y',
      })),
    });
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await ConfigService.ensureOpDevtoolsSettingsSeeded(projectPath);

    expect(warnSpy)
      .toHaveBeenCalledWith('[ensureOpDevtoolsSettingsSeeded] failed: boom');
    warnSpy.mockRestore();
  });

  it('seeds A5 profiler flags when the effective CANN SOC is the A5', async () => {
    (resolveEffectiveCannSoc as jest.Mock).mockReturnValue('ascend950');

    await ConfigService.ensureOpDevtoolsSettingsSeeded(projectPath);

    const settings = readSettings();

    expect(settings['op-devtools.performanceTuning.onBoard.pcSampling'])
      .toBe(true);
    expect(settings['op-devtools.performanceTuning.onBoard.cacheHeatmap'])
      .toBe(false);
  });

  it('falls back to the project path as the plugin workspace root when no folder is open', async () => {
    const originalFolders = vscode.workspace.workspaceFolders;

    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = undefined;

    try {
      await ConfigService.ensureOpDevtoolsSettingsSeeded(projectPath);
    }
    finally {
      (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = originalFolders;
    }

    expect(OperatorPluginRegistry.getOpPlugin('ascend').getInitialConfigScripts)
      .toHaveBeenCalledWith(expect.anything(), projectPath);
  });
});
