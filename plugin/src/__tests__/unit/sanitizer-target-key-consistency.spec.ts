import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';
import { sanitizerTargetKeyForOp } from '@plugin/domain/models/op-record';
import { ConfigService } from '@plugin/service/config-service';

/**
 * The creation-side sanitizer seed and the runtime reader share ONE
 * canonical cache key (`sanitizerTargetKeyForOp`):
 *  1. a target written under the key a fresh creation would use (the operator
 *     dir basename) is read back by `getSanitizerRuntimeConfig` with an EMPTY
 *     op — no active-file sync required;
 *  2. an EMPTY op never resolves another operator's target (no cross-op leak).
 */
describe('sanitizerPythonTarget key consistency (write→read, empty op)', () => {
  const getStore: Record<string, unknown> = {};
  let workspacePath: string;
  let cachePath: string;

  function seedCache(content: Record<string, unknown>): void {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, `${JSON.stringify({
      schemaVersion: 1,
      ...content,
    }, null, 2)}\n`, 'utf8');
  }

  function runtimeTarget(op = ''): string | null {
    return ConfigService.getSanitizerConfig(workspacePath, op).targetFile;
  }

  beforeEach(() => {
    Object.keys(getStore)
      .forEach((k) => delete getStore[k]);
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'opdevtools-key-'));
    cachePath = path.join(workspacePath, '.vscode', 'cache.json');
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: <T>(key: string) => getStore[key] as T | undefined,
      inspect: <T>(key: string) => (key in getStore
        ? {
          key,
          workspaceFolderValue: getStore[key] as T,
        }
        : undefined),
    });
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: workspacePath } } as vscode.WorkspaceFolder];
  });

  afterEach(() => {
    fs.rmSync(workspacePath, {
      recursive: true,
      force: true,
    });
  });

  it('resolves the empty op to the operator-dir basename — the key a fresh creation writes', () => {
    expect(sanitizerTargetKeyForOp(workspacePath, ''))
      .toBe(path.basename(workspacePath));
  });

  it('an explicit op is the key verbatim (never rewritten)', () => {
    expect(sanitizerTargetKeyForOp(workspacePath, 'op_add'))
      .toBe('op_add');
  });

  it('a target seeded at creation under the basename key is read back with an empty op', () => {
    seedCache({ sanitizerPythonTarget: { [path.basename(workspacePath)]: 'python3 ./op_add.py' } });

    expect(runtimeTarget(''))
      .toBe('python3 ./op_add.py');
  });

  it('an empty op never reads another operator\'s target', () => {
    seedCache({ sanitizerPythonTarget: { other_op: 'python3 ./other.py' } });

    expect(runtimeTarget(''))
      .toBeNull();
  });

  it('an explicit op still reads its own target (behavior preserved)', () => {
    seedCache({ sanitizerPythonTarget: { other_op: 'python3 ./other.py' } });

    expect(runtimeTarget('other_op'))
      .toBe('python3 ./other.py');
  });
});
