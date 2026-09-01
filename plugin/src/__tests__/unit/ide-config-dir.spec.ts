import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import {
  getDevtoolConfigPath,
  getIdeConfigDir,
  getIdeConfigDirName,
  getIdeServerDirName,
  getIdeServerHomeDir,
  getIdeSettingsFilePath,
  getLegacyUserDataDir,
  getLegacyWorkspaceConfigsFile,
  getLegacyWorkspaceConfigsFileFromOpDevtoolsDir,
  getWorkspaceFolderFromEnv,
  IDE_CONFIG_DIR_CODEARTS,
  IDE_CONFIG_DIR_VSCODE,
  isCodeArtsIde,
  isIdeSettingsFileEmpty,
  joinIdeConfigPath,
  joinIdeConfigRelative,
  joinIdeServerPath,
  joinIdeServerRelative,
} from '@plugin/helpers/ide-config-dir';

describe('ide-config-dir', () => {
  let tmpRoot: string;
  const originalUriScheme = (vscode.env as { uriScheme: string }).uriScheme;
  const originalWorkspaceFolders = vscode.workspace.workspaceFolders;
  const originalWorkspaceFolderEnv = process.env.WORKSPACE_FOLDER;

  const setUriScheme = (scheme: string): void => {
    (vscode.env as { uriScheme: string }).uriScheme = scheme;
  };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ide-config-dir-'));
  });

  afterEach(() => {
    setUriScheme(originalUriScheme);
    vscode.workspace.workspaceFolders = originalWorkspaceFolders;

    if (originalWorkspaceFolderEnv === undefined) {
      delete process.env.WORKSPACE_FOLDER;
    }
    else {
      process.env.WORKSPACE_FOLDER = originalWorkspaceFolderEnv;
    }

    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  describe('IDE kind detection', () => {
    it('detects CodeArts by the uri scheme (case-insensitive)', () => {
      setUriScheme('vscode');
      expect(isCodeArtsIde())
        .toBe(false);

      setUriScheme('codearts');
      expect(isCodeArtsIde())
        .toBe(true);

      setUriScheme('CodeArts');
      expect(isCodeArtsIde())
        .toBe(true);

      setUriScheme('');
      expect(isCodeArtsIde())
        .toBe(false);
    });

    it('resolves the config dir name per IDE', () => {
      setUriScheme('vscode');
      expect(getIdeConfigDirName())
        .toBe(IDE_CONFIG_DIR_VSCODE);

      setUriScheme('codearts');
      expect(getIdeConfigDirName())
        .toBe(IDE_CONFIG_DIR_CODEARTS);
    });
  });

  describe('workspace config paths', () => {
    it('joins the IDE config dir under the workspace root', () => {
      setUriScheme('vscode');
      expect(getIdeConfigDir(tmpRoot))
        .toBe(path.join(tmpRoot, '.vscode'));

      setUriScheme('codearts');
      expect(getIdeConfigDir(tmpRoot))
        .toBe(path.join(tmpRoot, '.arts'));
    });

    it('joins segments under the IDE config dir', () => {
      setUriScheme('vscode');
      expect(joinIdeConfigPath(tmpRoot, 'a', 'b'))
        .toBe(path.join(tmpRoot, '.vscode', 'a', 'b'));
    });

    it('builds IDE-config-relative paths', () => {
      setUriScheme('vscode');
      expect(joinIdeConfigRelative('a', 'b'))
        .toBe(path.join('.vscode', 'a', 'b'));

      setUriScheme('codearts');
      expect(joinIdeConfigRelative('a'))
        .toBe(path.join('.arts', 'a'));
    });

    it('builds the settings file path', () => {
      expect(getIdeSettingsFilePath(tmpRoot))
        .toBe(path.join(tmpRoot, '.vscode', 'settings.json'));
    });

    it('builds the devtool config path and the legacy configs file paths', () => {
      expect(getDevtoolConfigPath(tmpRoot))
        .toBe(path.join(tmpRoot, '.vscode', 'devtool_config.json'));
      expect(getLegacyWorkspaceConfigsFile(tmpRoot))
        .toBe(path.join(tmpRoot, '.vscode', 'op_devtools', 'data', 'configs.json'));
      expect(getLegacyWorkspaceConfigsFileFromOpDevtoolsDir(path.join(tmpRoot, '.vscode', 'op_devtools')))
        .toBe(path.join(tmpRoot, '.vscode', 'op_devtools', 'data', 'configs.json'));
    });
  });

  describe('isIdeSettingsFileEmpty', () => {
    it('returns true without a workspace root and without workspace folders', () => {
      vscode.workspace.workspaceFolders = undefined;

      expect(isIdeSettingsFileEmpty())
        .toBe(true);
    });

    it('treats a missing settings file as empty', () => {
      expect(isIdeSettingsFileEmpty(tmpRoot))
        .toBe(true);
    });

    it.each([
      [
        '',
        'empty file',
      ],
      [
        '   \n\t ',
        'whitespace-only file',
      ],
      [
        '{ not json',
        'invalid JSON',
      ],
      [
        '{}',
        'empty object',
      ],
      [
        '{ "editor.fontSize": 14 }',
        'non-empty object',
      ],
    ])('returns %s for an %s', (content) => {
      fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
      fs.writeFileSync(getIdeSettingsFilePath(tmpRoot), content, 'utf8');

      expect(isIdeSettingsFileEmpty(tmpRoot))
        .toBe(content === '{ "editor.fontSize": 14 }' ? false : true);
    });

    it('uses the first workspace folder when no root argument is given', () => {
      fs.mkdirSync(getIdeConfigDir(tmpRoot), { recursive: true });
      fs.writeFileSync(getIdeSettingsFilePath(tmpRoot), '{}', 'utf8');
      vscode.workspace.workspaceFolders = [{ uri: { fsPath: tmpRoot } }] as never;

      expect(isIdeSettingsFileEmpty())
        .toBe(true);

      fs.writeFileSync(getIdeSettingsFilePath(tmpRoot), '{ "a": 1 }', 'utf8');

      expect(isIdeSettingsFileEmpty())
        .toBe(false);
    });
  });

  describe('host-global user data paths', () => {
    it('uses WORKSPACE_FOLDER when set, otherwise the ide-server data dir', () => {
      process.env.WORKSPACE_FOLDER = '/env/workspace';
      expect(getLegacyUserDataDir())
        .toBe('/env/workspace');

      delete process.env.WORKSPACE_FOLDER;
      expect(getLegacyUserDataDir())
        .toBe(joinIdeServerPath(os.homedir(), 'data', 'ms-op-suite'));
    });

    it('exposes the WORKSPACE_FOLDER env var without side effects', () => {
      process.env.WORKSPACE_FOLDER = '/env/workspace';
      expect(getWorkspaceFolderFromEnv())
        .toBe('/env/workspace');

      delete process.env.WORKSPACE_FOLDER;
      expect(getWorkspaceFolderFromEnv())
        .toBeUndefined();

      process.env.WORKSPACE_FOLDER = '';
      expect(getWorkspaceFolderFromEnv())
        .toBeUndefined();
    });

    it('derives the ide-server dir name from the uri scheme', () => {
      setUriScheme('vscode');
      expect(getIdeServerDirName())
        .toBe('.vscode-server');

      setUriScheme('codearts');
      expect(getIdeServerDirName())
        .toBe('.codearts-server');

      setUriScheme('VSCODE');
      expect(getIdeServerDirName())
        .toBe('.vscode-server');

      // Empty scheme falls back to the vscode default.
      setUriScheme('');
      expect(getIdeServerDirName())
        .toBe('.vscode-server');
    });

    it('joins ide-server home and relative paths', () => {
      const home = path.join(os.tmpdir(), 'some-home');

      expect(getIdeServerHomeDir(home))
        .toBe(path.join(home, '.vscode-server'));
      expect(joinIdeServerPath(home, 'data', 'ms-op-suite'))
        .toBe(path.join(home, '.vscode-server', 'data', 'ms-op-suite'));
      expect(joinIdeServerRelative('data', 'ms-op-suite'))
        .toBe(path.join('.vscode-server', 'data', 'ms-op-suite'));

      // Default home argument falls back to os.homedir().
      expect(getIdeServerHomeDir())
        .toBe(path.join(os.homedir(), '.vscode-server'));
      expect(joinIdeServerPath())
        .toBe(path.join(os.homedir(), '.vscode-server'));
    });
  });
});
