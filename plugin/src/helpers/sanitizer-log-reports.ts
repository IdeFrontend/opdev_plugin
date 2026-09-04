import * as fs from 'fs';
import * as path from 'path';

export interface SanitizerLogReport {
  title: string;
  timestamp: number;
  id: string;
  path: string;
  marked: boolean;
}

// mssanitizer writes its --log-file as `mssanitizer_<msTimestamp>.log` and
// npu-check as `npu-check_<msTimestamp>.log` (legacy npu-check runs wrote
// `mssanitizer_<msTimestamp>-npu-check.log`). Require the numeric timestamp
// segment so junk files cannot produce a NaN-dated node, and skip the 0-byte
// file the tools truncate open before a run that then fails/aborts.
const SANITIZER_LOG_NAME = /^(mssanitizer|npu-check)_(\d+).*\.log$/;

/**
 * npu-check runs are identified by the report file name: new reports use the
 * `npu-check_` prefix and legacy ones the `-npu-check` segment; reports
 * matching neither were produced by mssanitizer. Only the file name is
 * inspected so a parent directory name cannot flip the detection.
 */
export function isNpuCheckReport(reportPath: string): boolean {
  const basename = path.basename(reportPath);

  return basename.startsWith('npu-check_') || basename.includes('-npu-check');
}

/** Parses the millisecond timestamp from a `<tool>_<ts>...log` report file name. */
export function parseSanitizerLogTimestamp(filename: string): number | undefined {
  const match = SANITIZER_LOG_NAME.exec(path.basename(filename));

  return match ? Number(match[2]) : undefined;
}

/**
 * Lists report nodes for a sanitizer log directory, skipping empty (0-byte)
 * logs left behind by a failed run and any file that is not a real
 * `mssanitizer_<timestamp>.log` / `npu-check_<timestamp>.log`. The node title is the
 * report file name itself. This is what keeps a crashed run from surfacing as
 * an empty results node.
 */
export function collectSanitizerLogReports(
  logPath: string,
  markSet: Set<string>,
): SanitizerLogReport[] {
  if (!fs.existsSync(logPath)) {
    return [];
  }

  const reports: SanitizerLogReport[] = [];

  for (const filename of fs.readdirSync(logPath)) {
    const match = SANITIZER_LOG_NAME.exec(filename);

    if (!match) {
      continue;
    }

    const fullPath = path.join(logPath, filename);

    let stat: fs.Stats;

    try {
      stat = fs.statSync(fullPath);
    }
    catch {
      continue;
    }

    if (!stat.isFile() || stat.size === 0) {
      continue;
    }

    const timestamp = Number(match[2]);

    reports.push({
      title: filename,
      timestamp,
      id: filename,
      path: fullPath,
      marked: markSet.has(filename),
    });
  }

  return reports;
}
