import * as vscode from 'vscode';
import * as fs from 'fs';
import { ExceptionParser } from '@plugin/class/exception-parser';
import { resolveSanitizerSourceFsPath } from '@plugin/helpers/sanitizer-source-path';

const COLLECTION_NAME = 'op-devtools-sanitizer';

/**
 * Publishes sanitizer findings to the Problems view (mstt-owned).
 */
export class SanitizerDiagnosticsService {
  private collection: vscode.DiagnosticCollection | undefined;

  activate(context: vscode.ExtensionContext): void {
    this.collection = vscode.languages.createDiagnosticCollection(COLLECTION_NAME);
    context.subscriptions.push(this.collection);
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.clear();
      }),
    );
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

    const parser = new ExceptionParser({ matchPath: workspaceRoot });
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

    for (const [key, diags] of byUri) {
      this.collection.set(vscode.Uri.parse(key), diags);
    }
  }
}

export const sanitizerDiagnosticsService = new SanitizerDiagnosticsService();
