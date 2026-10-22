/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
jest.mock('i18next', () => ({
  t: jest.fn((key: string, params?: { error?: string }) =>
    params?.error ? `${key}: ${params.error}` : key),
}));

// Spec-local vscode mock: the installer drives Uri.joinPath, workspace.fs and
// extension lookups that the shared minimal mock does not provide.
jest.mock('vscode', () => {
  const nodePath = jest.requireActual<typeof import('path')>('path');

  return {
    env: {
      uriScheme: 'vscode',
      appName: 'Visual Studio Code',
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
      fs: {
        stat: jest.fn()
          .mockResolvedValue(undefined),
        readFile: jest.fn()
          .mockRejectedValue(new Error('ENOENT')),
        writeFile: jest.fn()
          .mockResolvedValue(undefined),
        createDirectory: jest.fn()
          .mockResolvedValue(undefined),
      },
    },
    extensions: {
      getExtension: jest.fn(),
      all: [],
    },
    commands: {
      executeCommand: jest.fn()
        .mockResolvedValue(undefined),
    },
    window: {
      showInformationMessage: jest.fn()
        .mockResolvedValue(undefined),
      showErrorMessage: jest.fn()
        .mockResolvedValue(undefined),
      showWarningMessage: jest.fn()
        .mockResolvedValue(undefined),
    },
    Uri: {
      file: jest.fn((fsPath: string) => ({ fsPath })),
      joinPath: jest.fn((base: { fsPath: string }, ...segments: string[]) =>
        ({ fsPath: nodePath.join(base.fsPath, ...segments) })),
    },
  };
});

// The installer loads adm-zip dynamically; the mock simulates unzip by
// copying a prepared extension/ payload into the target temp dir.
jest.mock('adm-zip', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Redirect os.homedir to a per-test temp dir so the code-server/CodeArts
// install paths never touch the real user home. (ts-jest wraps
// `import * as os` in a non-configurable namespace proxy, so spyOn fails;
// mocking the module keeps the real tmpdir while stubbing homedir.)
jest.mock('os', () => ({
  ...jest.requireActual<typeof import('os')>('os'),
  homedir: jest.fn(),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { MindStudioPluginInstaller } from '@plugin/class/mind-studio-plugin-installer';

type DetectEnvironmentResult = {
  isWeb: boolean;
  isCodeServer: boolean;
  isCodeArts: boolean;
  isCodespaces: boolean;
  isGitpod: boolean;
};

const PLUGIN_ID = 'ascend.mindstudio-debug-vscode-plugin';
const PLUGIN_VERSION = '1.2.3';
const VSIX_RELATIVE = 'out/mindstudio-debug.vsix';

const ENV_KEYS = [
  'VSCODE_AGENT_FOLDER',
  'CODEARTS_SERVER_VERSION',
  'HOSTNAME',
  'CODE_SERVER_VERSION',
];

const originalExecPathDescriptor = Object.getOwnPropertyDescriptor(process, 'execPath');
const originalArgv = [...process.argv];
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

function setGlobal(name: 'navigator' | 'window', value: unknown): void {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function makeInstaller(root: string): MindStudioPluginInstaller {
  return new MindStudioPluginInstaller(
    {
      extensionPath: root,
      extensionUri: { fsPath: root },
    } as unknown as vscode.ExtensionContext,
    {
      pluginId: PLUGIN_ID,
      vsixRelativePath: VSIX_RELATIVE,
      pluginVersion: PLUGIN_VERSION,
    },
  );
}

describe('MindStudioPluginInstaller', () => {
  let homeDir: string;
  let root: string;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset implementations that individual tests override so a leaky
    // mockReturnValue/mockResolvedValue cannot bleed into later tests.
    (vscode.extensions.getExtension as jest.Mock).mockReset();
    (vscode.commands.executeCommand as jest.Mock).mockReset()
      .mockResolvedValue(undefined);
    (vscode.workspace.fs.stat as jest.Mock).mockReset()
      .mockResolvedValue(undefined);
    (vscode.workspace.fs.readFile as jest.Mock).mockReset()
      .mockRejectedValue(new Error('ENOENT'));
    (vscode.workspace.fs.writeFile as jest.Mock).mockReset()
      .mockResolvedValue(undefined);
    (vscode.workspace.fs.createDirectory as jest.Mock).mockReset()
      .mockResolvedValue(undefined);
    (jest.requireMock('adm-zip').default as jest.Mock).mockReset();

    // Wipe host-sensitivity: no server env vars, plain node execPath/argv,
    // no browser globals. Tests opt into web/server conditions explicitly.
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    process.argv = [...originalArgv];
    Object.defineProperty(process, 'execPath', {
      configurable: true,
      value: 'C:\\Program Files\\nodejs\\node.exe',
    });
    setGlobal('navigator', undefined);
    setGlobal('window', undefined);

    (vscode.env as { uriScheme: string }).uriScheme = 'vscode';
    (vscode.env as { appName: string }).appName = 'Visual Studio Code';
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];

    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-installer-home-'));
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-installer-'));
    (os.homedir as jest.Mock).mockReturnValue(homeDir);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (os.homedir as jest.Mock).mockReset();

    if (originalExecPathDescriptor) {
      Object.defineProperty(process, 'execPath', originalExecPathDescriptor);
    }

    process.argv = originalArgv;

    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
    }
    else {
      delete (globalThis as Record<string, unknown>).navigator;
    }

    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    }
    else {
      delete (globalThis as Record<string, unknown>).window;
    }

    fs.rmSync(homeDir, {
      recursive: true,
      force: true,
    });
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  function createVsix(): void {
    const vsixPath = path.join(root, VSIX_RELATIVE);

    fs.mkdirSync(path.dirname(vsixPath), { recursive: true });
    fs.writeFileSync(vsixPath, 'fake vsix payload');
  }

  const codeServerExtensionsDir = () =>
    path.join(homeDir, '.local', 'share', 'code-server', 'extensions');

  // =====================================================================
  // installIfNeeded dispatch
  // =====================================================================

  describe('installIfNeeded', () => {
    it('returns immediately when the installed version matches the bundled version', async () => {
      (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
        id: PLUGIN_ID,
        packageJSON: { version: PLUGIN_VERSION },
      });

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.commands.executeCommand)
        .not.toHaveBeenCalled();
    });

    it('reinstalls when the installed version differs from the bundled version', async () => {
      createVsix();
      (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
        id: PLUGIN_ID,
        packageJSON: { version: '0.0.1' },
      });

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'workbench.extensions.installExtension',
          expect.objectContaining({ fsPath: path.join(root, VSIX_RELATIVE) }),
        );
    });

    it('installs via the desktop command when the environment is plain VS Code', async () => {
      createVsix();

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'workbench.extensions.installExtension',
          expect.objectContaining({ fsPath: path.join(root, VSIX_RELATIVE) }),
        );
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('mindStudio.debugPluginsInstalled');
      expect(vscode.extensions.getExtension)
        .toHaveBeenCalledWith(PLUGIN_ID);
    });

    it('reports a desktop install failure when the vsix cannot be statted', async () => {
      (vscode.workspace.fs.stat as jest.Mock).mockRejectedValue(new Error('vsix missing'));

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('mindStudio.installFailed: vsix missing');
    });

    it('reports a desktop install failure when the install command rejects', async () => {
      createVsix();
      (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(new Error('command failed'));

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('mindStudio.installFailed: command failed');
    });

    it('skips reinstall when the target dir already exists', async () => {
      process.env.CODE_SERVER_VERSION = '4.20.0';
      const targetDir = path.join(codeServerExtensionsDir(), `${PLUGIN_ID}-${PLUGIN_VERSION}`);

      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'marker'), 'x');

      await makeInstaller(root)
        .installIfNeeded();

      const AdmZip = jest.requireMock('adm-zip').default as jest.Mock;

      expect(AdmZip)
        .not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(codeServerExtensionsDir(), 'extensions.json')))
        .toBe(false);
    });

    it('reports failure when the vsix file is missing in a code-server environment', async () => {
      process.env.CODE_SERVER_VERSION = '4.20.0';

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('mindStudio.installFailed: .vsix file not found at: ' + path.join(root, VSIX_RELATIVE));
      expect(vscode.window.showInformationMessage)
        .not.toHaveBeenCalled();
    });

    it('generates a devcontainer.json for Codespaces and reports success', async () => {
      setGlobal('navigator', {});
      setGlobal('window', { location: { origin: 'https://abc.github.dev' } });

      await makeInstaller(root)
        .installIfNeeded();

      const writeCall = (vscode.workspace.fs.writeFile as jest.Mock).mock.calls[0];
      const uri = writeCall[0] as { fsPath: string };
      const config = JSON.parse(Buffer.from(writeCall[1])
        .toString('utf8')) as {
        name: string;
        customizations: { vscode: { extensions: string[] } };
      };

      expect(uri.fsPath)
        .toBe(path.join('/workspace', '.devcontainer', 'devcontainer.json'));
      expect(config)
        .toEqual(expect.objectContaining({
          name: 'MindStudio Dev',
          customizations: { vscode: { extensions: [PLUGIN_ID] } },
        }));
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('mindStudio.debugPluginsInstalled');
      expect(vscode.window.showWarningMessage)
        .not.toHaveBeenCalled();
    });

    it('skips devcontainer.json generation when the plugin is already listed', async () => {
      setGlobal('navigator', {});
      setGlobal('window', { location: { origin: 'https://abc.github.dev' } });
      (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(Buffer.from(`{ "customizations": { "vscode": { "extensions": ["${PLUGIN_ID}"] } } }`));

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.workspace.fs.writeFile)
        .not.toHaveBeenCalled();
      expect(vscode.window.showInformationMessage)
        .not.toHaveBeenCalled();
    });

    it('reports failure when devcontainer generation throws (no workspace folder)', async () => {
      setGlobal('navigator', {});
      setGlobal('window', { location: { origin: 'https://abc.github.dev' } });
      (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = undefined;

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('mindStudio.configGenerateFailed: No workspace folder.');
    });

    it('reports failure when writing devcontainer.json rejects', async () => {
      setGlobal('navigator', {});
      setGlobal('window', { location: { origin: 'https://abc.github.dev' } });
      (vscode.workspace.fs.writeFile as jest.Mock).mockRejectedValue(new Error('disk full'));

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('mindStudio.configGenerateFailed: disk full');
    });

    it('generates .gitpod.yml for Gitpod', async () => {
      setGlobal('navigator', {});
      setGlobal('window', { location: { origin: 'https://example.gitpod.io' } });

      await makeInstaller(root)
        .installIfNeeded();

      const writeCall = (vscode.workspace.fs.writeFile as jest.Mock).mock.calls[0];
      const uri = writeCall[0] as { fsPath: string };
      const content = Buffer.from(writeCall[1])
        .toString('utf8');

      expect(uri.fsPath)
        .toBe(path.join('/workspace', '.gitpod.yml'));
      expect(content)
        .toContain(`- ${PLUGIN_ID}`);
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('mindStudio.debugPluginsInstalled');
    });

    it('reports failure for Gitpod when no workspace folder is open', async () => {
      setGlobal('navigator', {});
      setGlobal('window', { location: { origin: 'https://example.gitpod.io' } });
      (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = undefined;

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledWith('mindStudio.configGenerateFailed: No workspace folder.');
    });

    it('skips .gitpod.yml when the plugin is already listed', async () => {
      setGlobal('navigator', {});
      setGlobal('window', { location: { origin: 'https://example.gitpod.io' } });
      (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(Buffer.from(`vscode:\n  extensions:\n    - ${PLUGIN_ID}`));

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.workspace.fs.writeFile)
        .not.toHaveBeenCalled();
    });

    it('asks the user to configure manually in an unknown web IDE', async () => {
      setGlobal('navigator', {});
      setGlobal('window', { location: { origin: 'https://somewhere.else' } });

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('mindStudio.webManualConfig', 'common.confirm');
      expect(vscode.window.showInformationMessage)
        .not.toHaveBeenCalled();
    });

    it('does not prompt on Cursor hosts', async () => {
      (vscode.env as { appName: string }).appName = 'Cursor 0.1.0';
      setGlobal('navigator', {});
      setGlobal('window', { location: { origin: 'https://somewhere.else' } });

      await makeInstaller(root)
        .installIfNeeded();

      expect(vscode.window.showWarningMessage)
        .not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  // detectEnvironment
  // =====================================================================

  describe('detectEnvironment', () => {
    function detect(): DetectEnvironmentResult {
      return (makeInstaller(root) as unknown as {
        detectEnvironment(): DetectEnvironmentResult;
      }).detectEnvironment();
    }

    it('flags codespaces when the window origin matches github.dev', () => {
      setGlobal('navigator', {});
      setGlobal('window', { location: { origin: 'https://x.codespaces.io/github.dev' } });

      const env = detect();

      expect(env)
        .toEqual(expect.objectContaining({
          isWeb: true,
          isCodespaces: true,
          isGitpod: false,
        }));
    });

    it('flags gitpod when the window origin mentions gitpod', () => {
      setGlobal('navigator', {});
      setGlobal('window', { location: { origin: 'https://foo.gitpod.io' } });

      expect(detect())
        .toEqual(expect.objectContaining({
          isWeb: true,
          isGitpod: true,
          isCodespaces: false,
        }));
    });

    it('keeps plain web environments free of codespaces/gitpod flags', () => {
      setGlobal('navigator', {});
      setGlobal('window', { location: { origin: 'https://example.com' } });

      expect(detect())
        .toEqual(expect.objectContaining({
          isWeb: true,
          isCodeServer: false,
          isCodespaces: false,
          isGitpod: false,
        }));
    });

    it('classifies as official IDE remote (no code-server) when VSCODE_AGENT_FOLDER is set', () => {
      process.env.VSCODE_AGENT_FOLDER = '/root/.vscode-server';

      expect(detect())
        .toEqual({
          isWeb: false,
          isCodeServer: false,
          isCodeArts: false,
          isCodespaces: false,
          isGitpod: false,
        });
    });

    it('classifies as official IDE remote when execPath contains the server dir', () => {
      Object.defineProperty(process, 'execPath', {
        configurable: true,
        value: '/root/.vscode-server/bin/node',
      });

      expect(detect())
        .toEqual(expect.objectContaining({
          isCodeServer: false,
          isCodeArts: false,
        }));
    });

    it('classifies as official IDE remote when execPath contains .vscode-remote', () => {
      Object.defineProperty(process, 'execPath', {
        configurable: true,
        value: '/root/.vscode-remote/bin/node',
      });

      expect(detect())
        .toEqual(expect.objectContaining({
          isCodeServer: false,
          isCodeArts: false,
        }));
    });

    it('detects CodeArts from CODEARTS_SERVER_VERSION', () => {
      process.env.CODEARTS_SERVER_VERSION = '1.2.3';

      expect(detect())
        .toEqual(expect.objectContaining({
          isCodeServer: true,
          isCodeArts: true,
        }));
    });

    it('detects CodeArts from a codearts hostname', () => {
      process.env.HOSTNAME = 'codearts-build-01';

      expect(detect())
        .toEqual(expect.objectContaining({
          isCodeServer: true,
          isCodeArts: true,
        }));
    });

    it('detects CodeArts from execPath', () => {
      Object.defineProperty(process, 'execPath', {
        configurable: true,
        value: '/opt/codearts-server/bin/node',
      });

      expect(detect())
        .toEqual(expect.objectContaining({
          isCodeServer: true,
          isCodeArts: true,
        }));
    });

    it('detects CodeArts from a codearts argv entry', () => {
      process.argv = [
        ...originalArgv,
        '--host',
        'codearts-ide',
      ];

      expect(detect())
        .toEqual(expect.objectContaining({
          isCodeServer: true,
          isCodeArts: true,
        }));
    });

    it('detects open-source code-server from CODE_SERVER_VERSION', () => {
      process.env.CODE_SERVER_VERSION = '4.20.0';

      expect(detect())
        .toEqual(expect.objectContaining({
          isCodeServer: true,
          isCodeArts: false,
        }));
    });

    it('detects code-server from a code-server argv entry', () => {
      process.argv = [
        ...originalArgv,
        '--enable-code-server',
      ];

      expect(detect())
        .toEqual(expect.objectContaining({
          isCodeServer: true,
          isCodeArts: false,
        }));
    });

    it('detects code-server from execPath', () => {
      Object.defineProperty(process, 'execPath', {
        configurable: true,
        value: '/usr/lib/code-server/bin/code-server',
      });

      expect(detect())
        .toEqual(expect.objectContaining({
          isCodeServer: true,
          isCodeArts: false,
        }));
    });

    it('defaults to desktop VS Code', () => {
      expect(detect())
        .toEqual({
          isWeb: false,
          isCodeServer: false,
          isCodeArts: false,
          isCodespaces: false,
          isGitpod: false,
        });
    });

    it('does not treat .vscode-remote as code-server inside CodeArts IDE', () => {
      (vscode.env as { uriScheme: string }).uriScheme = 'codearts';
      Object.defineProperty(process, 'execPath', {
        configurable: true,
        value: '/root/.vscode-remote/bin/node',
      });
      process.env.CODEARTS_SERVER_VERSION = '1.0';

      expect(detect())
        .toEqual(expect.objectContaining({
          isCodeArts: true,
          isCodeServer: true,
        }));
    });
  });

  // =====================================================================
  // getCodeServerExtensionsDir
  // =====================================================================

  describe('getCodeServerExtensionsDir', () => {
    function extensionsDir(): string {
      return (makeInstaller(root) as unknown as { getCodeServerExtensionsDir(): string })
        .getCodeServerExtensionsDir();
    }

    it('falls back to the standard code-server path', () => {
      expect(extensionsDir())
        .toBe(path.join(homeDir, '.local', 'share', 'code-server', 'extensions'));
    });

    it('uses the vscode-server extensions dir when CODEARTS_SERVER_VERSION is set', () => {
      process.env.CODEARTS_SERVER_VERSION = '1.0';

      expect(extensionsDir())
        .toBe(path.join(homeDir, '.vscode-server', 'extensions'));
    });

    it('uses the .codearts-server extensions dir inside CodeArts IDE', () => {
      (vscode.env as { uriScheme: string }).uriScheme = 'codearts';

      expect(extensionsDir())
        .toBe(path.join(homeDir, '.codearts-server', 'extensions'));
    });
  });

  // =====================================================================
  // isCursorHost
  // =====================================================================

  describe('isCursorHost', () => {
    function isCursor(): boolean {
      return (makeInstaller(root) as unknown as { isCursorHost(): boolean }).isCursorHost();
    }

    it('is true when the app name contains cursor', () => {
      (vscode.env as { appName: string }).appName = 'Cursor 0.42';

      expect(isCursor())
        .toBe(true);
    });

    it('is false for regular VS Code', () => {
      expect(isCursor())
        .toBe(false);
    });
  });

  // =====================================================================
  // updateExtensionsJson
  // =====================================================================

  describe('updateExtensionsJson', () => {
    function update(dir: string): Promise<void> {
      return (makeInstaller(root) as unknown as {
        updateExtensionsJson(dir: string, id: string, version: string): Promise<void>;
      }).updateExtensionsJson(dir, PLUGIN_ID, PLUGIN_VERSION);
    }

    it('merges with existing entries without duplicating', async () => {
      const extensionsDir = codeServerExtensionsDir();

      fs.mkdirSync(extensionsDir, { recursive: true });
      fs.writeFileSync(path.join(extensionsDir, 'extensions.json'), JSON.stringify([
        {
          identifier: { id: 'other.ext' },
          version: '9.9.9',
        },
        {
          identifier: { id: PLUGIN_ID },
          version: PLUGIN_VERSION,
        },
      ]));

      await update(extensionsDir);

      const manifest = JSON.parse(fs.readFileSync(path.join(extensionsDir, 'extensions.json'), 'utf8')) as Array<{
        identifier: { id: string };
      }>;

      expect(manifest)
        .toHaveLength(2);
    });

    it('replaces an outdated version entry instead of leaving duplicates', async () => {
      const extensionsDir = codeServerExtensionsDir();

      fs.mkdirSync(extensionsDir, { recursive: true });
      fs.writeFileSync(path.join(extensionsDir, 'extensions.json'), JSON.stringify([
        {
          identifier: { id: PLUGIN_ID },
          version: '0.1.0',
        },
      ]));

      await update(extensionsDir);

      const manifest = JSON.parse(fs.readFileSync(path.join(extensionsDir, 'extensions.json'), 'utf8')) as Array<{
        identifier: { id: string };
        version: string;
      }>;

      expect(manifest)
        .toHaveLength(1);
      expect(manifest[0].version)
        .toBe(PLUGIN_VERSION);
    });

    it('starts fresh when the existing extensions.json is corrupt', async () => {
      const extensionsDir = codeServerExtensionsDir();
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      fs.mkdirSync(extensionsDir, { recursive: true });
      fs.writeFileSync(path.join(extensionsDir, 'extensions.json'), '{not json');

      await update(extensionsDir);

      expect(warnSpy)
        .toHaveBeenCalledWith('Failed to parse extensions.json, starting fresh.');
      const manifest = JSON.parse(fs.readFileSync(path.join(extensionsDir, 'extensions.json'), 'utf8')) as unknown[];

      expect(manifest)
        .toHaveLength(1);
    });

    it('uses forward slashes in the external url on Windows', async () => {
      const extensionsDir = codeServerExtensionsDir();

      fs.mkdirSync(extensionsDir, { recursive: true });

      await update(extensionsDir);

      const manifest = JSON.parse(fs.readFileSync(path.join(extensionsDir, 'extensions.json'), 'utf8')) as Array<{
        location: { external: string;
          fsPath: string };
      }>;

      expect(manifest[0].location.external)
        .toBe('file://' + path.join(extensionsDir, `${PLUGIN_ID}-${PLUGIN_VERSION}`)
          .replace(/\\/g, '/'));
      expect(manifest[0].location.fsPath)
        .toBe(path.join(extensionsDir, `${PLUGIN_ID}-${PLUGIN_VERSION}`));
    });
  });

  // =====================================================================
  // removeOldPluginVersions
  // =====================================================================

  describe('removeOldPluginVersions', () => {
    function remove(extensionsDir: string, currentVersion: string): void {
      return (makeInstaller(root) as unknown as {
        removeOldPluginVersions(dir: string, pluginId: string, currentVersion: string): void;
      }).removeOldPluginVersions(extensionsDir, PLUGIN_ID, currentVersion);
    }

    it('removes directories of other plugin versions but keeps the current one', () => {
      const extensionsDir = codeServerExtensionsDir();

      fs.mkdirSync(extensionsDir, { recursive: true });
      const oldDir = path.join(extensionsDir, `${PLUGIN_ID}-0.1.0`);
      const anotherOldDir = path.join(extensionsDir, `${PLUGIN_ID}-0.9.9`);
      const currentDir = path.join(extensionsDir, `${PLUGIN_ID}-${PLUGIN_VERSION}`);
      const unrelatedDir = path.join(extensionsDir, 'unrelated.ext-1.0.0');

      fs.mkdirSync(oldDir, { recursive: true });
      fs.mkdirSync(anotherOldDir, { recursive: true });
      fs.mkdirSync(currentDir, { recursive: true });
      fs.mkdirSync(unrelatedDir, { recursive: true });
      fs.writeFileSync(path.join(oldDir, 'marker'), 'x');
      fs.writeFileSync(path.join(anotherOldDir, 'marker'), 'x');

      remove(extensionsDir, PLUGIN_VERSION);

      expect(fs.existsSync(oldDir))
        .toBe(false);
      expect(fs.existsSync(anotherOldDir))
        .toBe(false);
      expect(fs.existsSync(currentDir))
        .toBe(true);
      expect(fs.existsSync(unrelatedDir))
        .toBe(true);
    });

    it('is a no-op when the extensions directory does not exist', () => {
      const extensionsDir = codeServerExtensionsDir();

      expect(() => remove(extensionsDir, PLUGIN_VERSION))
        .not.toThrow();
      expect(fs.existsSync(extensionsDir))
        .toBe(false);
    });
  });
});
