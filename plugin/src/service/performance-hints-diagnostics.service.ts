import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { t } from 'i18next';

import {
  parsePerformanceHints,
  type NpuRepHintParseResult,
  type PerformanceHintItem,
  type SourceLineInfo,
} from '@plugin/core/profiling';
import { appendLog } from '@plugin/helpers/output-channel';

import { performanceHintsDiagnosticCollectionId } from '@shared/flavor';

/** Tree-item id prefix of the performance-results rows (`operate-tree-provider.ts`). */
const PERFORMANCE_FILE_ID_PREFIX = 'performance-file:';

const LOG_SCOPE = 'performanceHints';

/** VS Code clamps the end column to the line length, so any large value works. */
const HINT_RANGE_END_COLUMN = 2000;

/** Localized diagnostic-code label per hint origin, used when a hint has no type name. */
const HINT_ORIGIN_TAG_KEYS: Record<PerformanceHintItem['origin'], string> = {
  instruction: 'performanceHints.origin.instruction',
  sourceLine: 'performanceHints.origin.sourceLine',
  kernel: 'performanceHints.origin.kernel',
};

/** Outcome of one `publishFromFile` call. */
export interface PerformanceHintsPublishResult {
  /** Hints published from the file; `0` means the collection was cleared instead. */
  published: number;
  /** True when the file could not be read or parsed (already warned about). */
  failed: boolean;
  /** True when a newer publish/clear superseded this one mid-flight (result dropped). */
  stale?: boolean;
}

/**
 * Hint tables live in `npu-rep` containers, in either the product `.npu-rep`
 * (160-byte file info) or the interim `.npu.rep` (164-byte) extension.
 */
export function isNpuRepFile(filePath: string): boolean {
  return /\.npu[.-]rep$/i.test(filePath);
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Glob specials that would turn a file name inside `**\<name>` into a pattern. */
const GLOB_SPECIALS = /[*?[\]{}()]/g;

/**
 * Escape glob specials so a `**\<basename>` lookup matches that literal file
 * name (`kernel[0]*.cpp` stays a name, not a character class plus a wildcard).
 */
export function escapeGlobPattern(name: string): string {
  return name.replace(GLOB_SPECIALS, '\\$&');
}

/** Map key of a path: the normalization (and Win32 casing) of `sameFilePath`. */
function scopeKey(filePath: string): string {
  const resolved = path.resolve(filePath);

  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function sameFilePath(left: string, right: string): boolean {
  return scopeKey(left) === scopeKey(right);
}

/** Command argument value: tree-item id `performance-file:<encoded path>`, or a plain path. */
function resolveFilePathValue(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!value.startsWith(PERFORMANCE_FILE_ID_PREFIX)) {
    return value;
  }

  try {
    return decodeURIComponent(value.slice(PERFORMANCE_FILE_ID_PREFIX.length)) || undefined;
  }
  catch {
    return undefined;
  }
}

/**
 * Path behind the `showPerformanceHints` command argument: a `Uri`, a plain
 * path, or a performance-results `TreeItem` (`id` / `command.arguments[0]`),
 * mirroring how `sanitizer.message.aiFix` recovers its row identity.
 */
export function resolvePerformanceHintsFilePath(argument: unknown): string | undefined {
  if (typeof argument === 'string') {
    return resolveFilePathValue(argument);
  }

  if (argument && typeof argument === 'object') {
    const candidate = argument as {
      fsPath?: unknown;
      id?: unknown;
      command?: { arguments?: unknown[] };
    };

    if (typeof candidate.fsPath === 'string') {
      return candidate.fsPath || undefined;
    }

    const firstArgument = candidate.command?.arguments?.[0];

    if (typeof firstArgument === 'string') {
      return resolveFilePathValue(firstArgument);
    }

    if (typeof candidate.id === 'string') {
      return resolveFilePathValue(candidate.id);
    }
  }

  return undefined;
}

/**
 * Publishes the performance hints of `.npu-rep` / `.npu.rep` reports as native
 * VS Code diagnostics (Problems view) — no custom webview.
 */
export class PerformanceHintsDiagnosticsService {
  private collection: vscode.DiagnosticCollection | undefined;

  /**
   * Report whose hints are currently published. Hints may land on workspace
   * source files rather than on the report, so the owning report — not
   * `collection.get(uri)` — decides what `clearIfOwns` may drop.
   */
  private publishedFrom: string | undefined;

  /**
   * Bumped by `clear()`, by `clearIfOwns()` of the report whose own publish is
   * in flight, and by every `publishFromFile` call. Resolving hint targets
   * awaits `workspace.findFiles`, so a publish can be superseded mid-flight;
   * the generation lets it notice and drop its result instead of resurrecting
   * hints of a tab that was hidden in the meantime.
   */
  private publishGeneration = 0;

  /**
   * Report whose publish was started last. `clearIfOwns` consults it so hiding
   * one report cannot invalidate the still-running publish of the report that
   * just became active.
   */
  private lastPublishTarget: string | undefined;

  /**
   * Operator scope each report was last published with. The context-menu
   * `showPerformanceHints` command reuses it instead of stomping the hints of a
   * panel that is open on a specific operator.
   */
  private readonly lastScopes = new Map<string, string | undefined>();

  private readonly clearListeners = new Set<()=> void>();

  activate(context: vscode.ExtensionContext): void {
    this.collection = vscode.languages.createDiagnosticCollection(performanceHintsDiagnosticCollectionId());
    context.subscriptions.push(this.collection);
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.clear();
    }));
  }

  /** Drop every published hint (workspace changed, or hints do not follow the active tab). */
  clear(): void {
    this.publishGeneration += 1;
    this.publishedFrom = undefined;
    this.lastPublishTarget = undefined;
    this.lastScopes.clear();
    this.collection?.clear();

    for (const listener of this.clearListeners) {
      listener();
    }
  }

  /**
   * Subscribe to collection clears (workspace changes, empty or failed
   * publishes). Panels use it to switch their "published in Problems"
   * indicator off when the hints they published are gone without a tab
   * change.
   */
  onDidClear(listener: ()=> void): vscode.Disposable {
    this.clearListeners.add(listener);

    return {
      dispose: () => {
        this.clearListeners.delete(listener);
      },
    };
  }

  /**
   * Drop the hints of `filePath` only when it is the report that published them
   * or the report whose own publish is still in flight. `clearIfOwns` runs for
   * the panel being hidden, which may no longer be the report the hints belong
   * to, so it must never invalidate a newer publish of another report.
   */
  clearIfOwns(filePath: string): void {
    const ownsPublished = this.publishedFrom != null && sameFilePath(this.publishedFrom, filePath);
    const ownsInFlight = this.lastPublishTarget != null && sameFilePath(this.lastPublishTarget, filePath);

    // The panel is hidden or disposed: forget the scope it was showing.
    this.lastScopes.delete(scopeKey(filePath));

    if (!ownsPublished && !ownsInFlight) {
      return;
    }

    if (ownsPublished) {
      this.publishedFrom = undefined;
      this.collection?.clear();
    }

    if (ownsInFlight) {
      this.publishGeneration += 1;
      this.lastPublishTarget = undefined;
    }
  }

  /**
   * Parse `filePath` and republish its hints: the collection is cleared first,
   * then one Information diagnostic is set per hint (grouped by target file).
   * An empty result clears without publishing placeholder diagnostics, and
   * read/parse failures warn instead of throwing so that publishing hints can
   * never break the caller (panel opening, tab switching, operator changes).
   */
  async publishFromFile(
    filePath: string,
    options: { operatorId?: string } = {},
  ): Promise<PerformanceHintsPublishResult> {
    const generation = ++this.publishGeneration;

    this.lastPublishTarget = filePath;

    if (!this.collection) {
      return {
        published: 0,
        failed: false,
      };
    }

    if (!fs.existsSync(filePath)) {
      this.clear();

      return {
        published: 0,
        failed: false,
      };
    }

    let parsed: NpuRepHintParseResult;

    try {
      parsed = parsePerformanceHints(new Uint8Array(fs.readFileSync(filePath)), options);
    }
    catch (error) {
      this.warnPublishFailed(filePath, error);
      // Same as the empty-hints path: Problems must not keep a previous
      // publish while the panel indicator reports failure / zero hints.
      this.clear();

      return {
        published: 0,
        failed: true,
      };
    }

    if (parsed.hints.length === 0) {
      this.clear();

      return {
        published: 0,
        failed: false,
      };
    }

    const fallbackUri = vscode.Uri.file(filePath);
    const diagnosticsByUri = new Map<string, vscode.Diagnostic[]>();
    const sourceFileCache = new Map<string, vscode.Uri | undefined>();

    for (const hint of parsed.hints) {
      const uri = await this.resolveHintUri(hint, parsed.sourceLines, fallbackUri, sourceFileCache);
      const key = uri.toString();
      const diagnostics = diagnosticsByUri.get(key) ?? [];

      diagnostics.push(this.createHintDiagnostic(hint, parsed.sourceLines));
      diagnosticsByUri.set(key, diagnostics);
    }

    // `clear()`/`clearIfOwns()` or a newer publish ran while source files were
    // being resolved: the tab that asked for these hints is gone, so drop the
    // result instead of overwriting what is published (or `publishedFrom`).
    if (generation !== this.publishGeneration) {
      return {
        published: 0,
        failed: false,
        stale: true,
      };
    }

    this.collection.clear();

    for (const [
      key,
      diagnostics,
    ] of diagnosticsByUri) {
      this.collection.set(vscode.Uri.parse(key), diagnostics);
    }

    this.publishedFrom = filePath;
    this.lastScopes.set(scopeKey(filePath), options.operatorId);

    return {
      published: parsed.hints.length,
      failed: false,
    };
  }

  /**
   * Publish the hints of one report and reveal the Problems view. When the
   * report's panel last published a specific operator scope, that scope is
   * reused so the command never stomps the tab-scoped hints with the default.
   */
  async showPerformanceHintsForFile(filePath: string): Promise<void> {
    const key = scopeKey(filePath);
    const options: { operatorId?: string } = this.lastScopes.has(key)
      ? { operatorId: this.lastScopes.get(key) }
      : {};
    const result = await this.publishFromFile(filePath, options);

    await vscode.commands.executeCommand('workbench.actions.view.problems');

    if (!result.failed && result.published === 0 && !result.stale) {
      void vscode.window.showInformationMessage(t('performanceHints.empty', { file: filePath }));
    }
  }

  private createHintDiagnostic(
    hint: PerformanceHintItem,
    sourceLines: Map<string, SourceLineInfo>,
  ): vscode.Diagnostic {
    const pcSuffix = hint.pc ? ` (PC: ${hint.pc})` : '';
    const diagnostic = new vscode.Diagnostic(
      this.createHintRange(hint, sourceLines),
      `${hint.message}${pcSuffix}`,
      vscode.DiagnosticSeverity.Information,
    );

    diagnostic.source = t('performanceHints.source');
    diagnostic.code = this.createHintTag(hint);

    return diagnostic;
  }

  /** Tag shown as the diagnostic code in Problems: the hint type name, or a short localized origin label. */
  private createHintTag(hint: PerformanceHintItem): string {
    const typeName = hint.typeName?.trim();

    if (typeName) {
      return typeName;
    }

    const key = HINT_ORIGIN_TAG_KEYS[hint.origin];

    return t(key);
  }

  /** `SourceLines.SourceLine` is 1-based; hints without a line point at the file start. */
  private createHintRange(hint: PerformanceHintItem, sourceLines: Map<string, SourceLineInfo>): vscode.Range {
    const line = hint.sourceLineId ? sourceLines.get(hint.sourceLineId)?.line : undefined;

    if (line == null || line < 1) {
      return new vscode.Range(0, 0, 0, 0);
    }

    const zeroBasedLine = line - 1;

    return new vscode.Range(zeroBasedLine, 0, zeroBasedLine, HINT_RANGE_END_COLUMN);
  }

  /**
   * Diagnostic target: the source file behind `sourceLineId` when it resolves
   * inside the workspace (exact packed path first, then a `**\/<basename>`
   * lookup with the name's glob specials escaped), the report itself otherwise.
   */
  private async resolveHintUri(
    hint: PerformanceHintItem,
    sourceLines: Map<string, SourceLineInfo>,
    fallbackUri: vscode.Uri,
    cache: Map<string, vscode.Uri | undefined>,
  ): Promise<vscode.Uri> {
    const file = hint.sourceLineId ? sourceLines.get(hint.sourceLineId)?.file : undefined;

    if (!file) {
      return fallbackUri;
    }

    const direct = this.resolveExistingSourcePath(file);

    if (direct) {
      return vscode.Uri.file(direct);
    }

    const basename = path.basename(file);

    if (!basename) {
      return fallbackUri;
    }

    // A file name may itself contain glob specials (`kernel[0]*.cpp`): escape
    // them so the lookup stays a name search, and cache per escaped pattern.
    const pattern = `**/${escapeGlobPattern(basename)}`;
    let found = cache.get(pattern);

    if (!cache.has(pattern)) {
      try {
        const matches = await vscode.workspace.findFiles(pattern);

        found = matches[0];
      }
      catch {
        found = undefined;
      }

      cache.set(pattern, found);
    }

    return found ?? fallbackUri;
  }

  /** Absolute packed path, or a workspace-relative one, when it points at a real file. */
  private resolveExistingSourcePath(file: string): string | undefined {
    const candidates = path.isAbsolute(file)
      ? [file]
      : (vscode.workspace.workspaceFolders ?? []).map((folder) => path.join(folder.uri.fsPath, file));

    return candidates.find((candidate) => fs.existsSync(candidate));
  }

  private warnPublishFailed(filePath: string, error: unknown): void {
    const message = t('performanceHints.publishFailed', {
      file: filePath,
      error: errorDetail(error),
    });

    appendLog(LOG_SCOPE, message);
    void vscode.window.showWarningMessage(message);
  }
}

export const performanceHintsDiagnosticsService = new PerformanceHintsDiagnosticsService();
