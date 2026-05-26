import * as fs from 'fs';
import * as path from 'path';

import { joinIdeConfigPath } from '@plugin/helpers/ide-config-dir';

/**
 * Newest `mssanitizer_*.log` under `<workspaceRoot>/<ideConfig>/mindstudio_sanitizer_log` by mtime.
 */
export function getLatestSanitizerLogAbsPath(workspaceRoot: string): string | undefined {
  const logDir = joinIdeConfigPath(workspaceRoot, 'mindstudio_sanitizer_log');

  if (!fs.existsSync(logDir) || !fs.statSync(logDir).isDirectory()) {
    return undefined;
  }

  let best: { path: string; mtime: number } | undefined;

  for (const name of fs.readdirSync(logDir)) {
    if (!name.startsWith('mssanitizer_') || !name.endsWith('.log')) {
      continue;
    }

    const full = path.join(logDir, name);
    const st = fs.statSync(full);
    if (!st.isFile()) {
      continue;
    }

    const mtime = st.mtimeMs;
    if (!best || mtime > best.mtime) {
      best = { path: full, mtime };
    }
  }

  return best?.path;
}
