/**
 * syncAscendEnvScriptFromWorkspaceSettings must mirror the EXPLICIT
 * environment script only. An unset script must NOT materialize the
 * '/etc/profile' schema default as a user setting (this path never writes
 * settings.json — the record holds the explicit value).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

jest.mock('@plugin/helpers/output-channel', () => ({
  appendLog: jest.fn(),
  getOperatorToolOutputChannel: jest.fn(),
}));

jest.mock('@plugin/core/project/project-manager', () => ({ ProjectManager: { getInstance: jest.fn() } }));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    writeOpDevtoolsDottedSettings: jest.fn()
      .mockResolvedValue(true),
  },
}));

import { ProjectManager } from '@plugin/core/project/project-manager';
import { ConfigService } from '@plugin/service/config-service';
import { projectService } from '@plugin/service/project-service';

const writeSettings = ConfigService.writeOpDevtoolsDottedSettings as jest.Mock;

describe('syncAscendEnvScriptFromWorkspaceSettings (explicit value only)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-env-sync-'));
    (ProjectManager.getInstance as jest.Mock).mockReturnValue({ projectPath: tmpRoot });
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('an unset script is NOT written (no /etc/profile default materialization)', async () => {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn(() => undefined),
      get: jest.fn(),
      update: jest.fn(),
    });

    await projectService.syncAscendEnvScriptFromWorkspaceSettings();

    expect(writeSettings)
      .not.toHaveBeenCalled();
  });

  it('an explicitly configured script IS written', async () => {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      inspect: jest.fn(() => ({ workspaceFolderValue: '/custom/env.sh' })),
      get: jest.fn(),
      update: jest.fn(),
    });

    await projectService.syncAscendEnvScriptFromWorkspaceSettings();

    expect(writeSettings)
      .toHaveBeenCalledWith({ 'environment.environmentScript': '/custom/env.sh' }, tmpRoot);
  });
});
