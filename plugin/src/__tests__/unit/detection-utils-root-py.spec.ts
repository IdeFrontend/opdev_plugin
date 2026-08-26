import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockReaddirSync = jest.fn();

jest.mock('fs', () => {
  const realFs = jest.requireActual('fs') as Record<string, unknown>;

  return {
    ...realFs,
    readdirSync: (...args: unknown[]) => mockReaddirSync(...args),
  };
});

const realFs = jest.requireActual('fs') as typeof import('fs');

import {
  hasPyFilesInRoot,
  listRootPythonEntryFiles,
} from '@plugin/domain/plugins/detection-utils';

describe('listRootPythonEntryFiles', () => {
  let tmpRoot: string;

  beforeEach(() => {
    mockReaddirSync.mockImplementation(((...args: unknown[]) =>
      (realFs.readdirSync as (...a: unknown[])=> unknown)(...args)) as never);
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'root-py-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('lists only direct .py children and excludes helpers', () => {
    fs.writeFileSync(path.join(tmpRoot, 'main.py'), '');
    fs.writeFileSync(path.join(tmpRoot, '__init__.py'), '');
    fs.mkdirSync(path.join(tmpRoot, 'src'));
    fs.writeFileSync(path.join(tmpRoot, 'src', 'nested.py'), '');

    expect(listRootPythonEntryFiles(tmpRoot))
      .toEqual([path.join(tmpRoot, 'main.py')]);
    expect(hasPyFilesInRoot(tmpRoot))
      .toBe(true);
  });

  it('returns empty when only excluded helpers exist at root', () => {
    fs.writeFileSync(path.join(tmpRoot, '__init__.py'), '');

    expect(listRootPythonEntryFiles(tmpRoot))
      .toEqual([]);
    expect(hasPyFilesInRoot(tmpRoot))
      .toBe(false);
  });

  it('returns an empty list when the directory cannot be read', () => {
    mockReaddirSync.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });

    expect(listRootPythonEntryFiles(tmpRoot))
      .toEqual([]);
    expect(hasPyFilesInRoot(tmpRoot))
      .toBe(false);
  });
});
