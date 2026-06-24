import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { evaluateSanitizerRunOutcome } from '@plugin/helpers/sanitizer-run-outcome';

describe('evaluateSanitizerRunOutcome', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'san-outcome-'));
  });

  afterEach(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  const writeLog = (name: string, content: string): string => {
    const p = path.join(root, name);

    fs.writeFileSync(p, content);

    return p;
  };

  it('succeeds when the process exited 0 and the log file has content', () => {
    const logPath = writeLog(
      'mssanitizer_1.log',
      '[mssanitizer] Sanitizer finished on kernel add_kernel. No error detected.\n',
    );

    expect(evaluateSanitizerRunOutcome({
      code: 0,
      output: '',
      logPath,
    }))
      .toEqual({ ok: true });
  });

  it('fails when the log file is empty (0 bytes), even though the process exited 0', () => {
    const logPath = writeLog('mssanitizer_1.log', '');

    const outcome = evaluateSanitizerRunOutcome({
      code: 0,
      output: '',
      logPath,
    });

    expect(outcome.ok)
      .toBe(false);
    // No stdout marker present, so the caller falls back to the raw command output.
    expect(outcome.reason)
      .toBeUndefined();
  });

  it('fails when the log file does not exist', () => {
    const logPath = path.join(root, 'missing.log');

    expect(evaluateSanitizerRunOutcome({
      code: 0,
      output: '',
      logPath,
    }).ok)
      .toBe(false);
  });

  it('fails when no log path was resolved', () => {
    expect(evaluateSanitizerRunOutcome({
      code: 0,
      output: '',
      logPath: undefined,
    }).ok)
      .toBe(false);
  });

  it('fails when the process exited non-zero (mssanitizer itself aborted)', () => {
    const logPath = writeLog('mssanitizer_1.log', 'some content');

    expect(evaluateSanitizerRunOutcome({
      code: 134,
      output: '',
      logPath,
    }).ok)
      .toBe(false);
  });

  it('fails with code null (killed by signal)', () => {
    const logPath = writeLog('mssanitizer_1.log', 'some content');

    expect(evaluateSanitizerRunOutcome({
      code: null,
      output: '',
      logPath,
    }).ok)
      .toBe(false);
  });

  it('surfaces a CLI/tool error marker from stdout as the failure reason', () => {
    const logPath = writeLog('mssanitizer_1.log', '');
    const output = 'Logo line\n[mssanitizer] ERROR: --tool param is invalid\n[mssanitizer] Use --help for more information\n';

    const outcome = evaluateSanitizerRunOutcome({
      code: 0,
      output,
      logPath,
    });

    expect(outcome.ok)
      .toBe(false);
    expect(outcome.reason)
      .toContain('[mssanitizer] ERROR: --tool param is invalid');
  });

  it('surfaces an abnormal-exit marker from stdout as the failure reason', () => {
    const logPath = writeLog('mssanitizer_1.log', '');
    const output = '[mssanitizer] user program /home/u/op.py exited abnormally\n';

    const outcome = evaluateSanitizerRunOutcome({
      code: 0,
      output,
      logPath,
    });

    expect(outcome.ok)
      .toBe(false);
    expect(outcome.reason)
      .toContain('exited abnormally');
  });

  it('surfaces an exited-by-signal marker from stdout as the failure reason', () => {
    const logPath = writeLog('mssanitizer_1.log', '');
    const output = '[mssanitizer] user program /home/u/op.py exited by signal(11)\n';

    const outcome = evaluateSanitizerRunOutcome({
      code: 0,
      output,
      logPath,
    });

    expect(outcome.ok)
      .toBe(false);
    expect(outcome.reason)
      .toContain('exited by signal(11)');
  });
});
