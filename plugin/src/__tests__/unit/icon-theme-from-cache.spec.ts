jest.mock('vscode', () => {
  class EventEmitter<T> {
    private listeners: Array<(value: T)=> void> = [];

    event = (listener: (value: T)=> void): { dispose: ()=> void } => {
      this.listeners.push(listener);

      return { dispose: () => undefined };
    };

    fire(value: T): void {
      this.listeners.forEach((listener) => listener(value));
    }
  }

  class ThemeColor {
    constructor(public id: string) {}
  }

  return {
    env: { uriScheme: 'vscode' },
    EventEmitter,
    ThemeColor,
    Uri: { file: (fsPath: string) => ({ fsPath }) },
    window: { registerFileDecorationProvider: jest.fn(() => ({ dispose: jest.fn() })) },
    workspace: { workspaceFolders: [] as Array<{ uri: { fsPath: string } }> },
  };
});

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  statSync: jest.fn(),
}));

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { writeOpDevtoolsDottedSettings: jest.fn() } }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { OperatorProjectIconTheme } from '@plugin/class/operator-project-icon-theme';
import { normalizeProjectPath } from '@plugin/domain/models/project-model';
import {
  CACHE_SCHEMA_VERSION,
  FolderScanState,
  getCacheFilePath,
} from '@plugin/helpers/workspace-cache';

describe('OperatorProjectIconTheme folder decorations from cache', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-icon-theme-'));
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true } as unknown as fs.Stats);
    (vscode.workspace.workspaceFolders as unknown as Array<{ uri: { fsPath: string } }>)
      .splice(0, 0, { uri: { fsPath: tmpRoot } });
  });

  afterEach(() => {
    (vscode.workspace.workspaceFolders as unknown as Array<{ uri: { fsPath: string } }>)
      .splice(0);
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  function createProvider(): OperatorProjectIconTheme {
    return OperatorProjectIconTheme.getInstance({ subscriptions: [] } as unknown as vscode.ExtensionContext);
  }

  function decorate(theme: OperatorProjectIconTheme, folderPath: string): vscode.ProviderResult<vscode.FileDecoration> {
    return theme.provideFileDecoration(vscode.Uri.file(folderPath));
  }

  function writeFolderState(state: FolderScanState): void {
    fs.mkdirSync(path.dirname(getCacheFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(
      getCacheFilePath(tmpRoot),
      JSON.stringify({
        schemaVersion: CACHE_SCHEMA_VERSION,
        folders: { [normalizeProjectPath(tmpRoot)]: state },
      }),
      'utf8',
    );
  }

  it('decorates from cache.folders scan state: purple for opsMeet, blue for opsList/experimentalOpsList', () => {
    writeFolderState({
      opsMeet: [
        {
          name: 'meet',
          path: path.join(tmpRoot, 'meet'),
        },
      ],
      opsList: [
        {
          name: 'add_custom',
          path: path.join(tmpRoot, 'add_custom'),
        },
      ],
      experimentalOpsList: [
        {
          name: 'exp_op',
          path: path.join(tmpRoot, 'exp_op'),
        },
      ],
    });

    const theme = createProvider();

    expect(decorate(theme, path.join(tmpRoot, 'meet')))
      .toEqual({
        tooltip: 'iconTheme.operatorProjectCollection',
        color: new vscode.ThemeColor('charts.purple'),
      });

    expect(decorate(theme, path.join(tmpRoot, 'add_custom')))
      .toEqual({
        tooltip: 'iconTheme.operatorProject',
        color: new vscode.ThemeColor('charts.blue'),
      });

    expect(decorate(theme, path.join(tmpRoot, 'exp_op')))
      .toEqual({
        tooltip: 'iconTheme.operatorProject',
        color: new vscode.ThemeColor('charts.blue'),
      });
  });

  it('decorates paths from any folder state entry keyed under the workspace cache', () => {
    const subRoot = path.join(tmpRoot, 'sub');

    fs.mkdirSync(path.dirname(getCacheFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(
      getCacheFilePath(tmpRoot),
      JSON.stringify({
        schemaVersion: CACHE_SCHEMA_VERSION,
        folders: {
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [],
            opsList: [
              {
                name: 'root_op',
                path: path.join(tmpRoot, 'root_op'),
              },
            ],
            experimentalOpsList: [],
          },
          [normalizeProjectPath(subRoot)]: {
            opsMeet: [],
            opsList: [
              {
                name: 'sub_op',
                path: path.join(subRoot, 'sub_op'),
              },
            ],
            experimentalOpsList: [],
          },
        },
      }),
      'utf8',
    );

    const theme = createProvider();

    expect(decorate(theme, path.join(tmpRoot, 'root_op')))
      .toEqual({
        tooltip: 'iconTheme.operatorProject',
        color: new vscode.ThemeColor('charts.blue'),
      });
    expect(decorate(theme, path.join(subRoot, 'sub_op')))
      .toEqual({
        tooltip: 'iconTheme.operatorProject',
        color: new vscode.ThemeColor('charts.blue'),
      });
  });

  it('returns undefined when no cache folder state exists (no registry fallback)', () => {
    const theme = createProvider();

    expect(decorate(theme, path.join(tmpRoot, 'op')))
      .toBeUndefined();
  });

  it('returns undefined when cache.json exists but has no folder entry for the root', () => {
    fs.mkdirSync(path.dirname(getCacheFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(getCacheFilePath(tmpRoot), JSON.stringify({ schemaVersion: CACHE_SCHEMA_VERSION }), 'utf8');

    const theme = createProvider();

    expect(decorate(theme, path.join(tmpRoot, 'meet')))
      .toBeUndefined();
  });

  it('isCompiled / compiledOpPaths do not influence the decoration color', () => {
    // compiledOpPaths is seeded on top of the folder state (merge path).
    fs.mkdirSync(path.dirname(getCacheFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(
      getCacheFilePath(tmpRoot),
      JSON.stringify({
        schemaVersion: CACHE_SCHEMA_VERSION,
        project: {
          selectedOperatorPaths: [],
          compiledOpPaths: { [path.join(tmpRoot, 'built_op')]: true },
        },
        folders: {
          [normalizeProjectPath(tmpRoot)]: {
            opsMeet: [],
            opsList: [
              {
                name: 'built_op',
                path: path.join(tmpRoot, 'built_op'),
                isCompiled: true,
              },
            ],
            experimentalOpsList: [],
          },
        },
      }),
      'utf8',
    );

    const theme = createProvider();

    expect(decorate(theme, path.join(tmpRoot, 'built_op')))
      .toEqual({
        tooltip: 'iconTheme.operatorProject',
        color: new vscode.ThemeColor('charts.blue'),
      });
  });

  it('returns undefined when the path is not a folder', () => {
    (fs.statSync as jest.Mock)
      .mockReturnValueOnce({ isDirectory: () => false });

    const theme = createProvider();

    expect(decorate(theme, path.join(tmpRoot, 'file.txt')))
      .toBeUndefined();
  });

  it('returns undefined when the folder stat fails', () => {
    (fs.statSync as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('access denied');
      });

    const theme = createProvider();

    expect(decorate(theme, path.join(tmpRoot, 'meet')))
      .toBeUndefined();
  });

  it('returns undefined when no workspace folders are open', () => {
    const folders = vscode.workspace.workspaceFolders as unknown as Array<{ uri: { fsPath: string } }>;

    (vscode.workspace.workspaceFolders as unknown) = undefined;

    try {
      expect(decorate(createProvider(), path.join(tmpRoot, 'meet')))
        .toBeUndefined();
    }
    finally {
      (vscode.workspace.workspaceFolders as unknown) = folders;
    }
  });

  it('returns undefined when the workspace folder list is empty', () => {
    const folders = vscode.workspace.workspaceFolders as unknown as Array<{ uri: { fsPath: string } }>;

    folders.splice(0);

    expect(decorate(createProvider(), path.join(tmpRoot, 'meet')))
      .toBeUndefined();
  });

  it('tolerates null folder states in the cache', () => {
    fs.mkdirSync(path.dirname(getCacheFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(
      getCacheFilePath(tmpRoot),
      JSON.stringify({
        schemaVersion: CACHE_SCHEMA_VERSION,
        folders: { [normalizeProjectPath(tmpRoot)]: null },
      }),
      'utf8',
    );

    const theme = createProvider();

    expect(decorate(theme, path.join(tmpRoot, 'op')))
      .toBeUndefined();
  });

  it('returns the same singleton instance and registers the provider once', () => {
    const first = createProvider();
    const second = OperatorProjectIconTheme.getInstance({ subscriptions: [] } as unknown as vscode.ExtensionContext);

    expect(second)
      .toBe(first);
    expect(vscode.window.registerFileDecorationProvider)
      .toHaveBeenCalledTimes(1);
  });

  it('fires decoration updates without throwing when nothing has subscribed', () => {
    const theme = createProvider();

    expect(() => theme.fireDecorationUpdate())
      .not.toThrow();
  });

  it('lazily creates the event emitter on first subscription and forwards updates', () => {
    const theme = createProvider();
    const listener = jest.fn();
    const uri = vscode.Uri.file(path.join(tmpRoot, 'meet'));

    theme.onDidChangeFileDecorations(listener);
    theme.onDidChangeFileDecorations(listener);

    theme.fireDecorationUpdate(uri);

    expect(listener)
      .toHaveBeenCalledTimes(2);
    expect(listener)
      .toHaveBeenCalledWith(uri);
  });
});
