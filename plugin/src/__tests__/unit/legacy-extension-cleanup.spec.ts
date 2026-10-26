/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  detectLegacyCleanupIdeKind,
  LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID,
  removeLegacyServerInstall,
  uninstallLegacyAscendToolkitExtension,
} from '@plugin/helpers/legacy-extension-cleanup';

const ENV_KEYS = [
  'VSCODE_AGENT_FOLDER',
  'CODEARTS_SERVER_VERSION',
  'HOSTNAME',
  'CODE_SERVER_VERSION',
];

// Redirect os.homedir to a per-test temp dir so server-scenario cleanup never
// touches the real user home. (ts-jest wraps `import * as os` in a
// non-configurable namespace proxy, so spyOn fails; mocking the module keeps
// the real tmpdir while stubbing homedir.)
jest.mock('os', () => ({
  ...jest.requireActual<typeof import('os')>('os'),
  homedir: jest.fn(),
}));

const originalExecPathDescriptor = Object.getOwnPropertyDescriptor(process, 'execPath');
const originalArgv = [...process.argv];
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setGlobalNavigator(value: unknown): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value,
  });
}

function legacyExtension(id: string): { id: string;
  packageJSON: { version: string } } {
  return {
    id,
    packageJSON: { version: '1.5.4' },
  };
}

describe('legacy-extension-cleanup', () => {
  let homeDir: string;
  const logDebug = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.extensions.getExtension as jest.Mock).mockReset();
    (vscode.commands.executeCommand as jest.Mock).mockReset()
      .mockResolvedValue(undefined);

    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    process.argv = [...originalArgv];
    Object.defineProperty(process, 'execPath', {
      configurable: true,
      value: path.join('bin', 'node.exe'),
    });
    setGlobalNavigator(undefined);
    (vscode.env as { uriScheme: string }).uriScheme = 'vscode';

    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-legacy-cleanup-'));
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

    fs.rmSync(homeDir, {
      recursive: true,
      force: true,
    });
  });

  describe('detectLegacyCleanupIdeKind', () => {
    it('reports desktop when no server marker exists', () => {
      expect(detectLegacyCleanupIdeKind())
        .toBe('desktop');
    });

    it('reports ide-server for the official remote agent', () => {
      process.env.VSCODE_AGENT_FOLDER = '.vscode-server';

      expect(detectLegacyCleanupIdeKind())
        .toBe('ide-server');
    });

    it('reports ide-server when execPath runs inside .vscode-server', () => {
      Object.defineProperty(process, 'execPath', {
        configurable: true,
        value: path.join(homeDir, '.vscode-server', 'bin', 'node'),
      });

      expect(detectLegacyCleanupIdeKind())
        .toBe('ide-server');
    });

    it('reports ide-server for CodeArts Server', () => {
      process.env.CODEARTS_SERVER_VERSION = '1.0.0';

      expect(detectLegacyCleanupIdeKind())
        .toBe('ide-server');
    });

    it('reports code-server for the open-source server', () => {
      process.env.CODE_SERVER_VERSION = '4.90.0';

      expect(detectLegacyCleanupIdeKind())
        .toBe('code-server');
    });

    it('reports web when the extension host runs in a browser', () => {
      setGlobalNavigator({ userAgent: 'Mozilla' });

      expect(detectLegacyCleanupIdeKind())
        .toBe('web');
    });
  });

  describe('removeLegacyServerInstall', () => {
    it('removes legacy dirs and extensions.json rows, keeps foreign ones', () => {
      const extensionsDir = path.join(homeDir, '.vscode-server', 'extensions');
      const legacyDir = path.join(extensionsDir, 'hicann.ascend-c-toolkit-1.5.4');
      const otherDir = path.join(extensionsDir, 'other.extension-2.0.0');

      fs.mkdirSync(legacyDir, { recursive: true });
      fs.mkdirSync(otherDir, { recursive: true });
      fs.writeFileSync(path.join(legacyDir, 'package.json'), '{}');

      const manifest = [
        {
          identifier: { id: 'hicann.ascend-c-toolkit' },
          version: '1.5.4',
        },
        {
          identifier: { id: 'other.extension' },
          version: '2.0.0',
        },
      ];

      fs.writeFileSync(
        path.join(extensionsDir, 'extensions.json'),
        JSON.stringify(manifest, null, 2),
      );

      const removed = removeLegacyServerInstall(extensionsDir, LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID);

      expect(removed)
        .toBe(2);
      expect(fs.existsSync(legacyDir))
        .toBe(false);
      expect(fs.existsSync(otherDir))
        .toBe(true);

      const rows = JSON.parse(fs.readFileSync(path.join(extensionsDir, 'extensions.json'), 'utf8'));

      expect(rows)
        .toEqual([
          {
            identifier: { id: 'other.extension' },
            version: '2.0.0',
          },
        ]);
    });

    it('is a no-op when the extensions dir does not exist', () => {
      const removed = removeLegacyServerInstall(
        path.join(homeDir, 'missing', 'extensions'),
        LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID,
      );

      expect(removed)
        .toBe(0);
    });
  });

  describe('uninstallLegacyAscendToolkitExtension', () => {
    it('is a no-op when the legacy extension is not installed', async () => {
      (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);

      await uninstallLegacyAscendToolkitExtension(logDebug);

      expect(vscode.extensions.getExtension)
        .toHaveBeenCalledWith(LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID);
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
      expect(fs.readdirSync(homeDir))
        .toEqual([]);
    });

    it('uninstalls via command only on desktop', async () => {
      (vscode.extensions.getExtension as jest.Mock).mockReturnValue(legacyExtension(LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID));

      await uninstallLegacyAscendToolkitExtension(logDebug);

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith('workbench.extensions.uninstallExtension', LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID);
      expect(fs.readdirSync(homeDir))
        .toEqual([]);
    });

    it('runs the command and cleans server dirs in .codearts-server', async () => {
      (vscode.env as { uriScheme: string }).uriScheme = 'codearts';
      (vscode.extensions.getExtension as jest.Mock).mockReturnValue(legacyExtension(LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID));
      process.env.CODEARTS_SERVER_VERSION = '1.0.0';

      const extensionsDir = path.join(homeDir, '.codearts-server', 'extensions');
      const legacyDir = path.join(extensionsDir, 'hicann.ascend-c-toolkit-1.0.0');

      fs.mkdirSync(legacyDir, { recursive: true });
      fs.writeFileSync(
        path.join(extensionsDir, 'extensions.json'),
        JSON.stringify([{ identifier: { id: LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID } }]),
      );

      await uninstallLegacyAscendToolkitExtension(logDebug);

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith('workbench.extensions.uninstallExtension', LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID);
      expect(fs.existsSync(legacyDir))
        .toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(extensionsDir, 'extensions.json'), 'utf8')))
        .toEqual([]);
    });

    it('cleans ~/.local/share/code-server/extensions in code-server', async () => {
      (vscode.extensions.getExtension as jest.Mock).mockReturnValue(legacyExtension(LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID));
      process.env.CODE_SERVER_VERSION = '4.90.0';

      const extensionsDir = path.join(homeDir, '.local', 'share', 'code-server', 'extensions');

      fs.mkdirSync(path.join(extensionsDir, 'hicann.ascend-c-toolkit-1.3.7'), { recursive: true });

      await uninstallLegacyAscendToolkitExtension(logDebug);

      expect(fs.existsSync(extensionsDir))
        .toBe(true);
      expect(fs.readdirSync(extensionsDir))
        .toEqual([]);
    });

    it('still cleans server dirs when the uninstall command fails', async () => {
      (vscode.extensions.getExtension as jest.Mock).mockReturnValue(legacyExtension(LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID));
      process.env.VSCODE_AGENT_FOLDER = '.vscode-server';
      (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(new Error('command not found'));

      const extensionsDir = path.join(homeDir, '.vscode-server', 'extensions');

      fs.mkdirSync(path.join(extensionsDir, 'hicann.ascend-c-toolkit-1.5.4'), { recursive: true });

      await uninstallLegacyAscendToolkitExtension(logDebug);

      expect(logDebug)
        .toHaveBeenCalledWith(
          'legacyExtensionCleanup:commandFailed',
          expect.objectContaining({ legacyId: LEGACY_ASCEND_C_TOOLKIT_EXTENSION_ID }),
        );
      expect(fs.readdirSync(extensionsDir))
        .toEqual([]);
    });
  });
});
