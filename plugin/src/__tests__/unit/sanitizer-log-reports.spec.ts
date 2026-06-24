import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { collectSanitizerLogReports } from '@plugin/helpers/sanitizer-log-reports';

describe('collectSanitizerLogReports', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'san-reports-'));
  });

  afterEach(() => {
    fs.rmSync(dir, {
      recursive: true,
      force: true,
    });
  });

  const write = (name: string, content: string): void => {
    fs.writeFileSync(path.join(dir, name), content);
  };

  it('returns an entry for a non-empty mssanitizer_<ts>.log', () => {
    write('mssanitizer_1700000000000.log', 'report content');

    const reports = collectSanitizerLogReports(dir, new Set());

    expect(reports)
      .toHaveLength(1);
    expect(reports[0])
      .toMatchObject({
        id: 'mssanitizer_1700000000000.log',
        timestamp: 1700000000000,
        path: path.join(dir, 'mssanitizer_1700000000000.log'),
        marked: false,
      });
    expect(reports[0].title)
      .toContain('mssanitizer');
  });

  it('skips a 0-byte (empty) log file left behind by a failed/aborted run', () => {
    write('mssanitizer_1700000000000.log', '');

    expect(collectSanitizerLogReports(dir, new Set()))
      .toEqual([]);
  });

  it('skips files that are not mssanitizer_<numeric>.log', () => {
    write('notes.txt', 'hello');
    write('random.log', 'content');
    write('mssanitizer_notanumber.log', 'content');

    expect(collectSanitizerLogReports(dir, new Set()))
      .toEqual([]);
  });

  it('reflects the marked state from the provided set', () => {
    write('mssanitizer_1700000000000.log', 'content');

    const reports = collectSanitizerLogReports(dir, new Set(['mssanitizer_1700000000000.log']));

    expect(reports[0].marked)
      .toBe(true);
  });

  it('returns an empty array when the directory does not exist', () => {
    expect(collectSanitizerLogReports(path.join(dir, 'nope'), new Set()))
      .toEqual([]);
  });

  it('includes only the valid non-empty logs when the dir is mixed', () => {
    write('mssanitizer_1700000000001.log', 'a');
    write('mssanitizer_1700000000002.log', '');
    write('mssanitizer_1700000000003.log', 'b');
    write('junk.log', 'c');

    const ids = collectSanitizerLogReports(dir, new Set())
      .map((r) => r.id)
      .sort();

    expect(ids)
      .toEqual([
        'mssanitizer_1700000000001.log',
        'mssanitizer_1700000000003.log',
      ]);
  });
});
