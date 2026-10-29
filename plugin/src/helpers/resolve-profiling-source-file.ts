/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as path from 'path';
import * as vscode from 'vscode';

import { appendLog } from '@plugin/helpers/output-channel';

const LOG_SCOPE = 'profilingReport/resolveSource';

/** Glob specials that would turn a file name inside `**\/<name>` into a pattern. */
const GLOB_SPECIALS = /[*?[\]{}()]/g;

/** Escape glob specials so a `**\/<basename>` lookup matches that literal file name. */
export function escapeGlobPattern(name: string): string {
  return name.replace(GLOB_SPECIALS, '\\$&');
}

/** Symbolizer path + basename the profiling-report library asks the host to fill. */
export type ResolveProfilingSourceRequest = {
  /** Symbolizer `FileName` as stored (often an absolute build path). */
  fileName: string;
  /** Basename used for pack matching, e.g. `gather_2d.asc`. */
  basename: string;
};

export type ResolveProfilingSourceOptions = {
  /** Absolute path of the opened `.npu-rep` / `.rep` report. */
  reportPath: string;
};

/**
 * True when `candidate` resolves under `root` (file or the root itself).
 * Absolute `fileName` outside workspace / report dir must miss even if present on disk.
 */
export function isPathUnderRoot(candidate: string, root: string): boolean {
  const resolvedCandidate = normalizeFsPath(candidate);
  const resolvedRoot = normalizeFsPath(root);

  if (resolvedCandidate === resolvedRoot) {
    return true;
  }

  const relative = path.relative(resolvedRoot, resolvedCandidate);

  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalizeFsPath(fsPath: string): string {
  const resolved = path.resolve(fsPath);

  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function allowlistRoots(reportPath: string): string[] {
  const roots: string[] = [];
  const reportDir = path.dirname(reportPath);

  if (reportDir) {
    roots.push(reportDir);
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    roots.push(folder.uri.fsPath);
  }

  return roots;
}

function isUnderAllowlist(candidate: string, roots: string[]): boolean {
  return roots.some((root) => isPathUnderRoot(candidate, root));
}

async function tryReadUtf8(uri: vscode.Uri, tried: string[]): Promise<string | null> {
  const label = uri.fsPath;

  try {
    const stat = await vscode.workspace.fs.stat(uri);

    if ((stat.type & vscode.FileType.File) === 0) {
      tried.push(`miss(not-file):${label}`);

      return null;
    }

    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder('utf-8')
      .decode(bytes);

    tried.push(`hit:${label}`);

    return text;
  }
  catch {
    tried.push(`miss:${label}`);

    return null;
  }
}

/**
 * Search `basename` under `rootUri` (exact child first, then recursive glob).
 * Only returns a path that still sits under the allowlist.
 */
async function findByBasename(
  basename: string,
  rootUri: vscode.Uri,
  roots: string[],
  tried: string[],
): Promise<string | null> {
  if (!basename) {
    return null;
  }

  const direct = vscode.Uri.joinPath(rootUri, basename);
  const directText = await tryReadUtf8(direct, tried);

  if (directText != null && isUnderAllowlist(direct.fsPath, roots)) {
    return directText;
  }

  const pattern = new vscode.RelativePattern(rootUri, `**/${escapeGlobPattern(basename)}`);

  try {
    const matches = await vscode.workspace.findFiles(pattern, undefined, 8);

    for (const match of matches) {
      if (!isUnderAllowlist(match.fsPath, roots)) {
        tried.push(`miss(outside-allowlist):${match.fsPath}`);
        continue;
      }

      const text = await tryReadUtf8(match, tried);

      if (text != null) {
        return text;
      }
    }

    if (matches.length === 0) {
      tried.push(`miss(findFiles):${rootUri.fsPath}/**/${basename}`);
    }
  }
  catch (error) {
    tried.push(`miss(findFiles-error):${rootUri.fsPath}:${error instanceof Error ? error.message : String(error)}`);
  }

  return null;
}

/**
 * Resolve Ascend C (or other) source text for a missing pack embed.
 *
 * Allowlist (v1): workspace folder(s) + directory of the opened report.
 * Absolute `fileName` is read only when it resolves under that allowlist.
 */
export async function resolveProfilingSourceFile(
  request: ResolveProfilingSourceRequest,
  options: ResolveProfilingSourceOptions,
): Promise<string | null> {
  const fileName = typeof request.fileName === 'string' ? request.fileName.trim() : '';
  const basename = (typeof request.basename === 'string' && request.basename.trim())
    ? path.basename(request.basename.trim())
    : (fileName ? path.basename(fileName) : '');
  const roots = allowlistRoots(options.reportPath);
  const tried: string[] = [];

  if (!basename && !fileName) {
    appendLog(LOG_SCOPE, 'empty request', { reportPath: options.reportPath });

    return null;
  }

  if (fileName) {
    const absoluteCandidate = path.isAbsolute(fileName)
      ? fileName
      : undefined;

    if (absoluteCandidate) {
      if (!isUnderAllowlist(absoluteCandidate, roots)) {
        tried.push(`miss(outside-allowlist):${absoluteCandidate}`);
      }
      else {
        const text = await tryReadUtf8(vscode.Uri.file(absoluteCandidate), tried);

        if (text != null) {
          appendLog(LOG_SCOPE, 'resolved', {
            fileName,
            basename,
            reportPath: options.reportPath,
            tried,
          });

          return text;
        }
      }
    }
    else {
      tried.push(`skip(non-absolute):${fileName}`);
    }
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const text = await findByBasename(basename, folder.uri, roots, tried);

    if (text != null) {
      appendLog(LOG_SCOPE, 'resolved', {
        fileName,
        basename,
        reportPath: options.reportPath,
        tried,
      });

      return text;
    }
  }

  const reportDirUri = vscode.Uri.file(path.dirname(options.reportPath));
  const reportText = await findByBasename(basename, reportDirUri, roots, tried);

  if (reportText != null) {
    appendLog(LOG_SCOPE, 'resolved', {
      fileName,
      basename,
      reportPath: options.reportPath,
      tried,
    });

    return reportText;
  }

  appendLog(LOG_SCOPE, 'miss', {
    fileName,
    basename,
    reportPath: options.reportPath,
    roots,
    tried,
  });

  return null;
}
