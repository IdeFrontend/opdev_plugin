class TabInputText {
  constructor(public uri: { fsPath: string }) {}
}

class TabInputTextDiff {
  constructor(
    public original: { fsPath: string },
    public modified: { fsPath: string },
  ) {}
}

function makeTab(fsPath: string): { input: TabInputText } {
  return { input: new TabInputText({ fsPath }) };
}

function makeDiffTab(modifiedPath: string): { input: TabInputTextDiff } {
  return { input: new TabInputTextDiff({ fsPath: '/orig' }, { fsPath: modifiedPath }) };
}

const vscodeMock = {
  TabInputText,
  TabInputTextDiff,
  window: {
    activeTextEditor: undefined as {
      document: { fileName: string;
        uri: { fsPath: string } };
    } | undefined,
    tabGroups: {
      activeTabGroup: { activeTab: undefined as ReturnType<typeof makeTab> | undefined },
      all: [] as Array<{ activeTab?: ReturnType<typeof makeTab> }>,
    },
    showQuickPick: jest.fn(),
  },
  Uri: { file: (fsPath: string) => ({ fsPath }) },
};

jest.mock('vscode', () => vscodeMock, { virtual: true });

jest.mock('@plugin/domain/plugins/detection-utils', () => ({ listRootPythonEntryFiles: jest.fn(() => [] as string[]) }));

import { listRootPythonEntryFiles } from '@plugin/domain/plugins/detection-utils';
import {
  hasAnyPythonOperatorActiveContext,
  isSplitEditorView,
  listDedupedActiveTabUrisForExtension,
  pickPythonOperatorUri,
  resolveOrPickPythonOperatorUri,
  resolvePythonOperatorContextUri,
  resolveUniqueRootPythonUri,
  tabUriFromTab,
} from '@plugin/helpers/python-operator-editor-context';

describe('python-operator-editor-context', () => {
  beforeEach(() => {
    vscodeMock.window.activeTextEditor = undefined;
    vscodeMock.window.tabGroups.activeTabGroup = { activeTab: undefined };
    vscodeMock.window.tabGroups.all = [{ activeTab: undefined }];
    (listRootPythonEntryFiles as jest.Mock).mockReturnValue([]);
  });

  describe('tabUriFromTab', () => {
    it('reads TabInputText and diff modified side', () => {
      expect(tabUriFromTab(makeTab('/ws/a.py') as never)?.fsPath)
        .toBe('/ws/a.py');
      expect(tabUriFromTab(makeDiffTab('/ws/b.py') as never)?.fsPath)
        .toBe('/ws/b.py');
    });

    it('returns undefined for unknown tab inputs', () => {
      expect(tabUriFromTab({ input: {} } as never))
        .toBeUndefined();
    });
  });

  describe('listDedupedActiveTabUrisForExtension', () => {
    it('collects matching active tabs from every group, skipping empties and non-matches', () => {
      vscodeMock.window.tabGroups.all = [
        { activeTab: undefined },
        { activeTab: makeTab('/ws/readme.md') },
        { activeTab: makeTab('/ws/a.py') },
        { activeTab: makeDiffTab('/ws/b.py') },
      ];

      const uris = listDedupedActiveTabUrisForExtension('.py');

      expect(uris.map((uri) => uri.fsPath))
        .toEqual([
          '/ws/a.py',
          '/ws/b.py',
        ]);
    });

    it('dedupes paths case-insensitively', () => {
      vscodeMock.window.tabGroups.all = [
        { activeTab: makeTab('/WS/A.PY') },
        { activeTab: makeTab('/ws/a.py') },
      ];

      const uris = listDedupedActiveTabUrisForExtension('.py');

      expect(uris.map((uri) => uri.fsPath))
        .toEqual(['/WS/A.PY']);
    });
  });

  describe('pickPythonOperatorUri', () => {
    it('shows workspace-relative labels and returns the picked uri', async () => {
      (vscodeMock.window.showQuickPick as jest.Mock)
        .mockResolvedValue({
          label: 'op.py',
          uri: { fsPath: '/ws/op.py' },
        });

      await expect(pickPythonOperatorUri(
        [{ fsPath: '/ws/op.py' }],
        '/ws',
      ))
        .resolves
        .toEqual({ fsPath: '/ws/op.py' });
      expect(vscodeMock.window.showQuickPick)
        .toHaveBeenCalledWith([
          {
            label: 'op.py',
            uri: { fsPath: '/ws/op.py' },
          },
        ], { placeHolder: 'Select which Python file to use' });
    });

    it('falls back to absolute labels without a workspace path', async () => {
      (vscodeMock.window.showQuickPick as jest.Mock)
        .mockResolvedValue(undefined);

      await expect(pickPythonOperatorUri(
        [{ fsPath: '/elsewhere/op.py' }],
        undefined,
      ))
        .resolves
        .toBeUndefined();
      expect(vscodeMock.window.showQuickPick)
        .toHaveBeenCalledWith([
          {
            label: '/elsewhere/op.py',
            uri: { fsPath: '/elsewhere/op.py' },
          },
        ], { placeHolder: 'Select which Python file to use' });
    });
  });

  describe('resolvePythonOperatorContextUri', () => {
    it('uses focused group active tab when it is .py', () => {
      vscodeMock.window.tabGroups.activeTabGroup = { activeTab: makeTab('/ws/foo.py') };

      expect(resolvePythonOperatorContextUri('.py'))
        .toEqual({
          kind: 'uri',
          uri: { fsPath: '/ws/foo.py' },
        });
    });

    it('returns none when split and stale activeTextEditor is .py but active tab is readme', () => {
      vscodeMock.window.tabGroups.all = [
        { activeTab: makeTab('/ws/readme.md') },
        { activeTab: makeTab('/ws/b.py') },
      ];
      vscodeMock.window.tabGroups.activeTabGroup = { activeTab: makeTab('/ws/readme.md') };
      vscodeMock.window.activeTextEditor = {
        document: {
          fileName: '/ws/a.py',
          uri: { fsPath: '/ws/a.py' },
        },
      };

      expect(resolvePythonOperatorContextUri('.py'))
        .toEqual({ kind: 'none' });
      expect(isSplitEditorView())
        .toBe(true);
    });

    it('returns none in split view when other group has .py but focused tab is not .py', () => {
      vscodeMock.window.tabGroups.all = [
        { activeTab: makeTab('/ws/readme.md') },
        { activeTab: makeTab('/ws/b.py') },
      ];
      vscodeMock.window.tabGroups.activeTabGroup = { activeTab: makeTab('/ws/readme.md') };

      expect(resolvePythonOperatorContextUri('.py'))
        .toEqual({ kind: 'none' });
    });

    it('uses activeTextEditor in single group when active tab has no text URI', () => {
      vscodeMock.window.tabGroups.all = [{ activeTab: { input: {} } }];
      vscodeMock.window.tabGroups.activeTabGroup = { activeTab: { input: {} } };
      vscodeMock.window.activeTextEditor = {
        document: {
          fileName: '/ws/foo.py',
          uri: { fsPath: '/ws/foo.py' },
        },
      };

      expect(resolvePythonOperatorContextUri('.py'))
        .toEqual({
          kind: 'uri',
          uri: { fsPath: '/ws/foo.py' },
        });
    });

    it('returns none in single group when active tab is non-.py even if activeTextEditor is stale .py', () => {
      vscodeMock.window.tabGroups.activeTabGroup = { activeTab: makeTab('/ws/readme.md') };
      vscodeMock.window.activeTextEditor = {
        document: {
          fileName: '/ws/a.py',
          uri: { fsPath: '/ws/a.py' },
        },
      };

      expect(resolvePythonOperatorContextUri('.py'))
        .toEqual({ kind: 'none' });
    });

    it('ignores the stale activeTextEditor in split view when the focused group has no tab', () => {
      vscodeMock.window.tabGroups.all = [
        { activeTab: makeTab('/ws/other.py') },
        { activeTab: undefined },
      ];
      vscodeMock.window.tabGroups.activeTabGroup = { activeTab: undefined };
      vscodeMock.window.activeTextEditor = {
        document: {
          fileName: '/ws/stale.py',
          uri: { fsPath: '/ws/stale.py' },
        },
      };

      expect(isSplitEditorView())
        .toBe(true);
      expect(resolvePythonOperatorContextUri('.py'))
        .toEqual({ kind: 'none' });
    });

    it('returns none in single group when neither tab nor editor carries a .py', () => {
      vscodeMock.window.tabGroups.all = [{ activeTab: { input: {} } }];
      vscodeMock.window.tabGroups.activeTabGroup = { activeTab: { input: {} } };
      vscodeMock.window.activeTextEditor = undefined;

      expect(resolvePythonOperatorContextUri('.py'))
        .toEqual({ kind: 'none' });
    });
  });

  describe('resolveUniqueRootPythonUri', () => {
    it('returns URI when exactly one root entry file exists', () => {
      (listRootPythonEntryFiles as jest.Mock).mockReturnValue(['/ws/op.py']);

      expect(resolveUniqueRootPythonUri('/ws')?.fsPath)
        .toBe('/ws/op.py');
    });

    it('returns undefined when multiple root entry files exist', () => {
      (listRootPythonEntryFiles as jest.Mock).mockReturnValue([
        '/ws/a.py',
        '/ws/b.py',
      ]);

      expect(resolveUniqueRootPythonUri('/ws'))
        .toBeUndefined();
    });
  });

  describe('resolveOrPickPythonOperatorUri', () => {
    it('falls back to unique root .py when editor context is empty', async () => {
      (listRootPythonEntryFiles as jest.Mock).mockReturnValue(['/ws/triton_vector_add.py']);

      await expect(resolveOrPickPythonOperatorUri('.py', '/ws')).resolves.toEqual({ fsPath: '/ws/triton_vector_add.py' });
    });

    it('prefers editor context over root fallback', async () => {
      vscodeMock.window.tabGroups.activeTabGroup = { activeTab: makeTab('/ws/open.py') };
      (listRootPythonEntryFiles as jest.Mock).mockReturnValue(['/ws/other.py']);

      await expect(resolveOrPickPythonOperatorUri('.py', '/ws')).resolves.toEqual({ fsPath: '/ws/open.py' });
    });

    it('returns undefined without a workspace path and without editor context', async () => {
      await expect(resolveOrPickPythonOperatorUri('.py', undefined))
        .resolves
        .toBeUndefined();
    });
  });

  describe('hasAnyPythonOperatorActiveContext', () => {
    it('is true when the editor context resolves a .py', () => {
      vscodeMock.window.tabGroups.activeTabGroup = { activeTab: makeTab('/ws/editor.py') };

      expect(hasAnyPythonOperatorActiveContext('.py'))
        .toBe(true);
    });

    it('is true for unique root .py when editor context is empty', () => {
      (listRootPythonEntryFiles as jest.Mock).mockReturnValue(['/ws/op.py']);

      expect(hasAnyPythonOperatorActiveContext('.py', '/ws'))
        .toBe(true);
    });

    it('is false when neither editor nor unique root .py is available', () => {
      expect(hasAnyPythonOperatorActiveContext('.py', '/ws'))
        .toBe(false);
    });
  });
});
