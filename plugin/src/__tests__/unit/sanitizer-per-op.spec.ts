jest.mock('i18next', () => ({ t: (key: string) => key }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';
import { syncSanitizerPythonTargetFromActiveEditor } from '@plugin/helpers/sync-sanitizer-python-target';
import {
  readWorkspaceCache,
  updateWorkspaceCache,
} from '@plugin/helpers/workspace-cache';

/**
 * The sanitizer Python target is keyed by the OPERATOR NAME (the workspace
 * root basename for the single-operator pyasc/triton project types) — never by
 * an empty/global key. Uses real fs + real workspace cache; only the vscode
 * API is mocked (activeTextEditor / workspaceFolders are settable on the
 * global vscode mock).
 */
describe('syncSanitizerPythonTargetFromActiveEditor keys the cache per op', () => {
  let workspacePath: string;

  const setActiveEditor = (fileName: string | undefined): void => {
    (vscode.window as unknown as {
      activeTextEditor?: { document: { fileName: string;
        uri: { fsPath: string } } };
    }).activeTextEditor = fileName === undefined
      ? undefined
      : {
        document: {
          fileName,
          uri: { fsPath: fileName },
        },
      };
  };

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'op-sanitizer-sync-'));
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: workspacePath } }];
  });

  afterEach(() => {
    (vscode.window as unknown as { activeTextEditor?: unknown }).activeTextEditor = undefined;
    fs.rmSync(workspacePath, {
      recursive: true,
      force: true,
    });
  });

  it('writes cache.sanitizerPythonTarget under the workspace op name, never an empty key', async () => {
    setActiveEditor(path.join(workspacePath, 'op_add.py'));

    const ok = await syncSanitizerPythonTargetFromActiveEditor('.py');

    expect(ok)
      .toBe(true);
    const cache = readWorkspaceCache(workspacePath);
    const opName = path.basename(workspacePath);

    expect(Object.keys(cache.sanitizerPythonTarget ?? {}))
      .toEqual([opName]);
    expect(cache.sanitizerPythonTarget?.[opName])
      .toBe('python3 op_add.py');
    expect(cache.sanitizerPythonTarget?.[''])
      .toBeUndefined();
  });

  it('a second sync on another .py overwrites the same op key (no key growth)', async () => {
    setActiveEditor(path.join(workspacePath, 'op_add.py'));
    await syncSanitizerPythonTargetFromActiveEditor('.py');
    setActiveEditor(path.join(workspacePath, 'op_add_v2.py'));
    await syncSanitizerPythonTargetFromActiveEditor('.py');

    const cache = readWorkspaceCache(workspacePath);
    const opName = path.basename(workspacePath);

    expect(Object.keys(cache.sanitizerPythonTarget ?? {}))
      .toEqual([opName]);
    expect(cache.sanitizerPythonTarget?.[opName])
      .toBe('python3 op_add_v2.py');
  });

  it('keeps the captured target when a non-.py file is focused (use-existing)', async () => {
    await updateWorkspaceCache(workspacePath, (cache) => {
      cache.sanitizerPythonTarget = { [path.basename(workspacePath)]: 'python3 op_add.py' };
    });
    setActiveEditor(path.join(workspacePath, 'README.md'));

    const ok = await syncSanitizerPythonTargetFromActiveEditor('.py');

    expect(ok)
      .toBe(true);
    expect(readWorkspaceCache(workspacePath).sanitizerPythonTarget?.[path.basename(workspacePath)])
      .toBe('python3 op_add.py');
  });

  it('warns and returns false when no target exists and no .py is focused (no-target)', async () => {
    setActiveEditor(undefined);

    const ok = await syncSanitizerPythonTargetFromActiveEditor('.py');

    expect(ok)
      .toBe(false);
    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalled();
    expect(readWorkspaceCache(workspacePath).sanitizerPythonTarget)
      .toBeUndefined();
  });

  it('rejects an active file outside the workspace', async () => {
    setActiveEditor(path.join(os.tmpdir(), 'outside.py'));

    const ok = await syncSanitizerPythonTargetFromActiveEditor('.py');

    expect(ok)
      .toBe(false);
    expect(vscode.window.showWarningMessage)
      .toHaveBeenCalled();
    expect(readWorkspaceCache(workspacePath).sanitizerPythonTarget)
      .toBeUndefined();
  });
});
