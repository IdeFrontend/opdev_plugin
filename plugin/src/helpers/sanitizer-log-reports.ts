import * as fs from 'fs';
import * as path from 'path';

export interface SanitizerLogReport {
  title: string;
  timestamp: number;
  id: string;
  path: string;
  marked: boolean;
}

// mssanitizer writes its --log-file as `mssanitizer_<msTimestamp>.log`. Require the
// numeric timestamp segment so junk files cannot produce a NaN-dated node, and skip
// the 0-byte file mssanitizer truncates open before a run that then fails/aborts.
const SANITIZER_LOG_NAME = /^mssanitizer_(\d+).*\.log$/;

function formatTimestampToYYYYMMDD(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString()
    .padStart(2, '0');
  const day = date.getDate()
    .toString()
    .padStart(2, '0');

  return `${year}${month}${day}`;
}

/**
 * npu-check runs are identified by the `-npu-check` segment in the report file
 * name; reports without it were produced by mssanitizer. Only the file name is
 * inspected so a parent directory name cannot flip the detection.
 */
export function isNpuCheckReport(reportPath: string): boolean {
  return path.basename(reportPath)
    .includes('-npu-check');
}

/** Parses the millisecond timestamp from a `mssanitizer_<ts>...log` file name. */
export function parseSanitizerLogTimestamp(filename: string): number | undefined {
  const match = SANITIZER_LOG_NAME.exec(path.basename(filename));

  return match ? Number(match[1]) : undefined;
}

/**
 * Display title shared by log-directory and manually imported reports:
 * `npu-check-YYYYMMDD` or `mssanitizer-YYYYMMDD` derived from the run
 * timestamp embedded in the file name.
 */
export function buildSanitizerReportTitle(filename: string, timestamp: number): string {
  return `${isNpuCheckReport(filename) ? 'npu-check' : 'mssanitizer'}-${formatTimestampToYYYYMMDD(timestamp)}`;
}

/**
 * Lists report nodes for the sanitizer log directory, skipping empty (0-byte)
 * logs left behind by a failed run and any file that is not a real
 * `mssanitizer_<timestamp>.log`. This is what keeps a crashed run from
 * surfacing as an empty results node.
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

    const timestamp = Number(match[1]);

    reports.push({
      title: buildSanitizerReportTitle(filename, timestamp),
      timestamp,
      id: filename,
      path: fullPath,
      marked: markSet.has(filename),
    });
  }

  return reports;
}
