/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import { ExceptionParser } from '@plugin/class/exception-parser';
import { NpuCheckParser } from '@plugin/class/npu-check-parser';
import { resolveSanitizerSourceFsPath } from '@plugin/helpers/sanitizer-source-path';
import { isNpuCheckReport } from '@plugin/helpers/sanitizer-log-reports';
import { msAgentBridgeService } from '@plugin/service/ms-agent-bridge.service';

import { sanitizerDiagnosticCollectionId } from '@shared/flavor';

export type SanitizerPanelData = {
  path?: string;
  title?: string;
  timestamp?: number;
  data: Array<Record<string, unknown>>;
};

/**
 * Publishes sanitizer findings to the Problems view (mstt-owned).
 */
export class SanitizerDiagnosticsService {
  private collection: vscode.DiagnosticCollection | undefined;

  activate(context: vscode.ExtensionContext): void {
    this.collection = vscode.languages.createDiagnosticCollection(sanitizerDiagnosticCollectionId());
    context.subscriptions.push(this.collection);
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.clear();
    }));
  }

  clear(): void {
    this.collection?.clear();
  }

  /**
   * Parse log and set diagnostics; clears previous entries from this collection first.
   */
  publishFromLogFile(absoluteLogPath: string, workspaceRoot: string): void {
    if (!this.collection || !fs.existsSync(absoluteLogPath)) {
      return;
    }

    let content: string;

    try {
      content = fs.readFileSync(absoluteLogPath, 'utf-8');
    }
    catch {
      return;
    }

    const parser = isNpuCheckReport(absoluteLogPath)
      ? new NpuCheckParser({ matchPath: workspaceRoot })
      : new ExceptionParser({ matchPath: workspaceRoot });
    const results = parser.parseAll(content);

    this.collection.clear();

    const byUri = new Map<string, vscode.Diagnostic[]>();

    for (const r of results) {
      const fsPath = resolveSanitizerSourceFsPath(workspaceRoot, r.fileLink);

      if (!fsPath || r.row == null || r.row < 1) {
        continue;
      }

      const line = Math.max(0, r.row - 1);
      const col = Math.max(0, (r.col ?? 1) - 1);
      const severity = r.type === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Error;
      const message = r.question || r.title || r.exceptionName || 'Sanitizer';
      const range = new vscode.Range(line, col, line, 2000);
      const d = new vscode.Diagnostic(range, message, severity);

      d.source = 'sanitizer';

      const uri = vscode.Uri.file(fsPath);
      const key = uri.toString();

      if (!byUri.has(key)) {
        byUri.set(key, []);
      }

      byUri.get(key)!.push(d);
    }

    for (const [
      key,
      diags,
    ] of byUri) {
      this.collection.set(vscode.Uri.parse(key), diags);
    }
  }

  loadSanitizerPanelData(params: Record<string, any>): SanitizerPanelData {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { data: [] };
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const inputContent = fs.readFileSync(params.path, 'utf-8');
    const isNpuCheck = isNpuCheckReport(params.path);
    const parser = isNpuCheck
      ? new NpuCheckParser({ matchPath: workspacePath })
      : new ExceptionParser({ matchPath: workspacePath });
    const data = parser.parseAll(inputContent)
      .map((r, msAgentIndex) => {
        const resolved = resolveSanitizerSourceFsPath(workspacePath, r.fileLink);

        return {
          ...r,
          fileLink: resolved ?? r.fileLink,
          // msAgent only understands mssanitizer logs; npu-check rows must not expose an AI-fix index
          msAgentIndex: isNpuCheck ? undefined : msAgentIndex,
        };
      });

    this.publishFromLogFile(params.path, workspacePath);

    if (!isNpuCheck) {
      void msAgentBridgeService.tryLoadLogWithIntegration(params.path);
    }

    return {
      ...params,
      data,
    };
  }
}

export const sanitizerDiagnosticsService = new SanitizerDiagnosticsService();
