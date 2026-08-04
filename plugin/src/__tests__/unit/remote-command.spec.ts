jest.mock('@plugin/domain/utils/npu-hardware-probe', () => ({ startNpuHardwareProbe: jest.fn() }));
jest.mock('i18next', () => ({ t: (key: string) => key }));
jest.mock('child_process', () => ({ exec: jest.fn((_: string, __: unknown, callback: (error: Error | null)=> void) => callback(null)) }));

import {
  buildRemoteBuildExampleCommand,
  buildRemoteExecCommand,
  buildRemoteDumpTensorCommand,
  buildRemoteOnBoardCommand,
  buildRemoteUtCommand,
  createRemoteCommandWhenNoNpuTransformer,
  parseRemoteToolConfigOutput,
} from '@plugin/helpers/remote-command';
import { startNpuHardwareProbe } from '@plugin/domain/utils/npu-hardware-probe';
import * as vscode from 'vscode';
import { exec } from 'child_process';

describe('remote command helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (exec as jest.Mock).mockImplementation((_: string, __: unknown, callback: (error: Error | null)=> void) => callback(null));
  });

  it('builds a fixed remote exec command without optional runtime settings', () => {
    const command = buildRemoteExecCommand("cd /repo && bash build.sh --name='add custom'");

    expect(command)
      .toBe("remote_tool.sh exec -v --command 'cd /repo && bash build.sh --name='\\''add custom'\\'''");
  });

  it('does not pass pull-dir for remote UT commands', () => {
    const command = buildRemoteUtCommand('bash build.sh -u');

    expect(command)
      .toBe("remote_tool.sh exec -v --command 'bash build.sh -u'");
  });

  it('pulls both build directories for remote build-example commands', () => {
    const command = buildRemoteBuildExampleCommand(
      'bash build.sh --example',
      'C:\\repo\\my operator',
    );

    expect(command)
      .toBe("remote_tool.sh exec -v --command 'bash build.sh --example' --pull-dir 'C:/repo/my operator/build/,C:/repo/my operator/build_out/'");
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
      .toBe("remote_tool.sh exec -v --command 'msprof op --output=/repo/.vscode/opprof ./run.sh --case='\\''add'\\''' --pull-dir '/repo/.vscode/opprof/'");
  });

  it('uses the supplied DumpTensor directory for remote DumpTensor commands', () => {
    const command = buildRemoteDumpTensorCommand(
      'export ASCEND_GLOBAL_LOG_LEVEL=1 && export ASCEND_DUMP_PATH=../.vscode/dump_tensor_temp_data && ./run.sh',
      '/repo/.vscode/DumpTensor/',
    );

    expect(command)
      .toBe("remote_tool.sh exec -v --command 'export ASCEND_GLOBAL_LOG_LEVEL=1 && export ASCEND_DUMP_PATH=../.vscode/dump_tensor_temp_data && ./run.sh' --pull-dir '/repo/.vscode/DumpTensor/'");
  });

  it('uses the caller-provided remote command builder only when no local NPU is available', async () => {
    (startNpuHardwareProbe as jest.Mock).mockResolvedValue(false);
    const buildRemoteCommand = jest.fn((command: string) => `remote ${command}`);
    const transformCommand = createRemoteCommandWhenNoNpuTransformer(buildRemoteCommand);

    await expect(transformCommand('bash build.sh -u')).resolves.toBe('remote bash build.sh -u');
    expect(buildRemoteCommand)
      .toHaveBeenCalledWith('bash build.sh -u');
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

    await expect(transformCommand('bash build.sh -u')).rejects.toMatchObject({ name: 'RemoteToolUnavailableError' });
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
});
