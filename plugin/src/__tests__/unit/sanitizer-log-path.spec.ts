import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getIdeConfigDir } from '@plugin/helpers/ide-config-dir';
import { getLatestSanitizerLogAbsPath } from '@plugin/helpers/sanitizer-log-path';

describe('getLatestSanitizerLogAbsPath', () => {
  let workspaceRoot: string;
  let logDir: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitizer-log-'));
    logDir = path.join(getIdeConfigDir(workspaceRoot), 'mindstudio_sanitizer_log');
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, {
      recursive: true,
      force: true,
    });
  });

  it('returns undefined when the log directory is missing', () => {
    expect(getLatestSanitizerLogAbsPath(workspaceRoot))
      .toBeUndefined();
  });

  it('returns undefined when the log directory path is a file, not a directory', () => {
    fs.mkdirSync(getIdeConfigDir(workspaceRoot), { recursive: true });
    fs.writeFileSync(logDir, 'not a dir', 'utf8');

    expect(getLatestSanitizerLogAbsPath(workspaceRoot))
      .toBeUndefined();
  });

  it('returns undefined when no mssanitizer_*.log files exist', () => {
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'notes.txt'), 'hi', 'utf8');

    expect(getLatestSanitizerLogAbsPath(workspaceRoot))
      .toBeUndefined();
  });

  it('picks the newest mssanitizer_*.log by mtime', () => {
    fs.mkdirSync(logDir, { recursive: true });
    const older = path.join(logDir, 'mssanitizer_1700000000000.log');
    const newer = path.join(logDir, 'mssanitizer_1700001000000.log');

    fs.writeFileSync(older, 'old', 'utf8');
    fs.writeFileSync(newer, 'new', 'utf8');

    const oldMtime = Date.now() - 100000;

    fs.utimesSync(older, new Date(oldMtime), new Date(oldMtime));

    expect(getLatestSanitizerLogAbsPath(workspaceRoot))
      .toBe(newer);
  });

  it('skips non-matching names and directory entries', () => {
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'mssanitizer.txt'), 'no', 'utf8');
    fs.writeFileSync(path.join(logDir, 'other.log'), 'no', 'utf8');
    fs.mkdirSync(path.join(logDir, 'mssanitizer_0000000000000.log'), { recursive: true });
    const real = path.join(logDir, 'mssanitizer_1700002000000.log');

    fs.writeFileSync(real, 'real', 'utf8');

    expect(getLatestSanitizerLogAbsPath(workspaceRoot))
      .toBe(real);
  });
});
