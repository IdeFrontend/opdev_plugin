import * as path from 'path';

jest.mock('@plugin/domain/utils/npu-hardware-probe', () => ({ startNpuHardwareProbe: jest.fn() }));
jest.mock('i18next', () => ({ t: (key: string) => key }));
jest.mock('child_process', () => ({
  exec: jest.fn((_: string, __: unknown, callback: (error: Error | null)=> void) => callback(null)),
  execSync: jest.fn(() => ''),
}));

import {
  buildRemoteBuildExampleCommand,
  buildRemoteExecCommand,
  buildRemoteDumpTensorCommand,
  buildRemoteOnBoardCommand,
  buildRemoteStTestCommand,
  createRemoteCommandWhenNoNpuTransformer,
  getRemoteToolConfig,
  getRemoteToolHost,
  getRemoteToolSeries,
  getRemoteToolSeriesSync,
  parseRemoteToolConfigOutput,
  parseSeriesFromConfigOutput,
  resolveRemotePullDir,
} from '@plugin/helpers/remote-command';
import { startNpuHardwareProbe } from '@plugin/domain/utils/npu-hardware-probe';
import * as vscode from 'vscode';
import {
  exec, execSync,
} from 'child_process';

describe('remote command helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (exec as jest.Mock).mockImplementation((_: string, __: unknown, callback: (error: Error | null)=> void) => callback(null));
  });

  it('builds a fixed remote exec command without optional runtime settings', () => {
    const command = buildRemoteExecCommand("cd /repo && bash build.sh --name='add custom'");

    expect(command)
      .toBe("remote_tool.sh exec --progress --command 'cd /repo && bash build.sh --name='\\''add custom'\\'''");
  });

  it('pulls both build directories for remote build-example commands', () => {
    const command = buildRemoteBuildExampleCommand(
      'bash build.sh --example',
      'C:\\repo\\my operator',
    );

    expect(command)
      .toBe("remote_tool.sh exec --progress --command 'bash build.sh --example' --pull-dir 'C:/repo/my operator/build/,C:/repo/my operator/build_out/'");
  });

  it('requires a project root for remote build-example commands', () => {
    expect(() => buildRemoteBuildExampleCommand('bash build.sh --example', undefined))
      .toThrow('Project root path not found for remote build artifact retrieval');
  });

  it('uses the supplied opprof directory for remote on-board commands', () => {
    const command = buildRemoteOnBoardCommand(
      "msprof op --output=/repo/.vscode/opprof ./run.sh --case='add'",
      '/repo/.vscode/opprof/',
    );

    expect(command)
      .toBe("remote_tool.sh exec --progress --command 'msprof op --output=/repo/.vscode/opprof ./run.sh --case='\\''add'\\''' --pull-dir '/repo/.vscode/opprof/'");
  });

  it('uses the supplied DumpTensor directory for remote DumpTensor commands', () => {
    const command = buildRemoteDumpTensorCommand(
      'export ASCEND_GLOBAL_LOG_LEVEL=1 && export ASCEND_DUMP_PATH=../.vscode/dump_tensor_temp_data && ./run.sh',
      '/repo/.vscode/DumpTensor/',
    );

    expect(command)
      .toBe("remote_tool.sh exec --progress --command 'export ASCEND_GLOBAL_LOG_LEVEL=1 && export ASCEND_DUMP_PATH=../.vscode/dump_tensor_temp_data && ./run.sh' --pull-dir '/repo/.vscode/DumpTensor/'");
  });

  it('uses the supplied ST results directory for remote ST test commands', () => {
    const command = buildRemoteStTestCommand(
      'python3 -m ttk kernel -i /repo/add/tests/st/arch35/a.csv -o /repo/.vscode/st-results/add/run/kernel/001-result.csv --plugin /repo/add/tests',
      '/repo/.vscode/st-results/',
    );

    expect(command)
      .toBe("remote_tool.sh exec --progress --command 'python3 -m ttk kernel -i /repo/add/tests/st/arch35/a.csv -o /repo/.vscode/st-results/add/run/kernel/001-result.csv --plugin /repo/add/tests' --pull-dir '/repo/.vscode/st-results/'");
  });

  it('uses the caller-provided remote command builder only when no local NPU is available', async () => {
    (startNpuHardwareProbe as jest.Mock).mockResolvedValue(false);
    const buildRemoteCommand = jest.fn((command: string) => `remote ${command}`);
    const transformCommand = createRemoteCommandWhenNoNpuTransformer(buildRemoteCommand);

    await expect(transformCommand('bash build.sh --example')).resolves.toBe('remote bash build.sh --example');
    expect(buildRemoteCommand)
      .toHaveBeenCalledWith('bash build.sh --example');
  });

  it('keeps build-example commands local when a local NPU is available', async () => {
    (startNpuHardwareProbe as jest.Mock).mockResolvedValue(true);
    const buildRemoteCommand = jest.fn((command: string) => `remote ${command}`);
    const transformCommand = createRemoteCommandWhenNoNpuTransformer(buildRemoteCommand);

    await expect(transformCommand('bash build.sh --example')).resolves.toBe('bash build.sh --example');
    expect(buildRemoteCommand).not.toHaveBeenCalled();
  });

  it('runs build-example commands remotely when the hardware probe fails', async () => {
    (startNpuHardwareProbe as jest.Mock).mockRejectedValue(new Error('probe failed'));
    const buildRemoteCommand = jest.fn((command: string) => `remote ${command}`);
    const transformCommand = createRemoteCommandWhenNoNpuTransformer(buildRemoteCommand);

    await expect(transformCommand('bash build.sh --example')).resolves.toBe('remote bash build.sh --example');
    expect(buildRemoteCommand)
      .toHaveBeenCalledWith('bash build.sh --example');
  });

  it('shows an NPU environment prompt and does not build a remote command when remote_tool.sh is unavailable', async () => {
    (startNpuHardwareProbe as jest.Mock).mockResolvedValue(false);
    (exec as jest.Mock).mockImplementation((_: string, __: unknown, callback: (error: Error | null)=> void) => callback(new Error('not found')));
    const buildRemoteCommand = jest.fn((command: string) => `remote ${command}`);
    const transformCommand = createRemoteCommandWhenNoNpuTransformer(buildRemoteCommand);

    await expect(transformCommand('bash build.sh --example')).rejects.toMatchObject({ name: 'RemoteToolUnavailableError' });
    expect(vscode.window.showInformationMessage)
      .toHaveBeenCalledWith(
        'extension.remoteToolRequired',
        { modal: true },
      );
    expect(buildRemoteCommand).not.toHaveBeenCalled();
  });

  it('parses remote tool host and series from config output', () => {
    expect(parseRemoteToolConfigOutput('HOST=10.1.2.3\nSERIES=A3\n'))
      .toEqual({
        host: '10.1.2.3',
        series: 'a3',
      });
  });

  it('keeps commands local when the caller predicate excludes them', async () => {
    const buildRemoteCommand = jest.fn((command: string) => `remote ${command}`);
    const transformCommand = createRemoteCommandWhenNoNpuTransformer(
      buildRemoteCommand,
      (command) => command.startsWith('msprof op '),
    );

    await expect(transformCommand('bash build.sh --onboard')).resolves.toBe('bash build.sh --onboard');
    expect(startNpuHardwareProbe).not.toHaveBeenCalled();
    expect(buildRemoteCommand).not.toHaveBeenCalled();
  });

  it('parses only the series out of config output', () => {
    expect(parseSeriesFromConfigOutput('HOST=1.2.3.4\nSERIES=A2\n'))
      .toBe('a2');
    expect(parseSeriesFromConfigOutput('HOST=1.2.3.4'))
      .toBeUndefined();
  });

  it('reads the remote tool config through the shell', async () => {
    (exec as jest.Mock).mockImplementation((_command: string, _options: unknown, callback: (error: Error | null, result: { stdout: string })=> void) => callback(null, { stdout: 'HOST=10.1.2.3\nSERIES=A5\n' }));

    await expect(getRemoteToolConfig())
      .resolves.toEqual({
        host: '10.1.2.3',
        series: 'a5',
      });

    expect(exec)
      .toHaveBeenCalledWith('remote_tool.sh config', {
        encoding: 'utf8',
        shell: '/bin/bash',
        timeout: 5000,
      }, expect.anything()); // the promisified wrapper appends its own callback
  });

  it('returns undefined when the remote tool config command fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => {});

    (exec as jest.Mock).mockImplementation((_command: string, _options: unknown, callback: (error: Error | null)=> void) => callback(new Error('not found')));

    await expect(getRemoteToolConfig())
      .resolves.toBeUndefined();

    expect(warnSpy)
      .toHaveBeenCalledWith('Failed to get remote tool config:', expect.any(Error));
    warnSpy.mockRestore();
  });

  it('delegates series and host queries to the config reader', async () => {
    (exec as jest.Mock).mockImplementation((_command: string, _options: unknown, callback: (error: Error | null, result: { stdout: string })=> void) => callback(null, { stdout: 'HOST=10.1.2.3\nSERIES=A3\n' }));

    await expect(getRemoteToolSeries())
      .resolves.toBe('a3');
    await expect(getRemoteToolHost())
      .resolves.toBe('10.1.2.3');
  });

  it('reads the remote tool series synchronously', () => {
    (execSync as jest.Mock).mockReturnValue('SERIES=A2\n');

    expect(getRemoteToolSeriesSync())
      .toBe('a2');
  });

  it('returns undefined when the sync config command fails', () => {
    (execSync as jest.Mock).mockImplementation(() => {
      throw new Error('not found');
    });

    expect(getRemoteToolSeriesSync())
      .toBeUndefined();
  });

  it('resolves a pull dir under the IDE config dir of the resolved root', () => {
    const root = 'C:\\repo\\my operator';

    expect(resolveRemotePullDir(root, 'st-results', 'ST test'))
      .toBe('C:/repo/my operator/.vscode/st-results/');
  });

  it('resolves a pull dir through a caller-supplied resolver', () => {
    const resolvedRoot = path.resolve('/repo/ops/add');
    const resolver = jest.fn((root: string) => `${root}/build_out`);

    expect(resolveRemotePullDir('/repo/ops/add', resolver, 'build example'))
      .toBe(`${resolvedRoot.replace(/\\/g, '/')}/build_out/`);
    expect(resolver)
      .toHaveBeenCalledWith(resolvedRoot);
  });

  it('throws when no root is known for the pull dir', () => {
    expect(() => resolveRemotePullDir(undefined, 'st-results', 'ST test'))
      .toThrow('Output root path not found for ST test');
  });
});
