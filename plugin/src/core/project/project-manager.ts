import * as vscode from 'vscode';

import { getIdeConfigDir } from '@plugin/helpers/ide-config-dir';
import * as fs from 'fs';
import { CommandExecutor } from '@plugin/class/command-options';

/**
 * project manager
 * Responsible for managing the project path of the current operation and the task executor status.
 *
 * The project context is path-only. Consumers resolve project records
 * themselves via `getProjectByPath(workspaceRoot)`; this class only caches the
 * active path (`setProjectContext` callers) and owns the task executor.
 */
export class ProjectManager {
  private static instance: ProjectManager;

  /** Project path (full path of the operator project; undefined when no project was set) */
  private _projectPath: string | undefined;
  /** Project name (display name cached alongside the path; no getter — consumers derive it from the path) */
  private _projectName: string | undefined;
  /** current task executor */
  private _currentExecutor: CommandExecutor | null = null;

  private constructor() {}

  /**
   * Get the ProjectManager singleton instance
   * @returns {ProjectManager} singleton instance
   */
  public static getInstance(): ProjectManager {
    if (!ProjectManager.instance) {
      ProjectManager.instance = new ProjectManager();
    }

    return ProjectManager.instance;
  }

  /**
   * Active project path. The cached context (`setProjectContext`) wins; when
   * nothing was cached — a fresh window opened via `vscode.openFolder`
   * (creation), or after `resetCachedProject` on a workspace switch — fall
   * back to the live workspace root (`workspaceFolders[0]`). This restores
   * the base `getProjectInfo()` → `ExplorerRootUtils.getPrimaryRoot()`
   * fallback: without it every fresh-window command (sanitizer
   * "Start now", on-board, dump tensor, task debug) hits the
   * "No sanitizer config"-style guards because nothing populates the cache
   * on activation.
   */
  public get projectPath(): string | undefined {
    return this._projectPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  /**
   * Set the project context (path + name). The context is cached locally; the
   * project record itself is synthesized from settings/cache on demand
   * (`getProjectByPath`).
   */
  public setProjectContext(projectPath: string, projectName?: string): void {
    this._projectPath = projectPath;
    this._projectName = projectName;
  }

  /**
   * Get or create a task executor
   * If there is currently no executor, create a new one
   * @returns {CommandExecutor} task executor
   */
  public getExecutor(): CommandExecutor {
    if (!this._currentExecutor) {
      this._currentExecutor = new CommandExecutor();
    }

    return this._currentExecutor;
  }

  /**
   * Clear current task executor
   * Usually called after the task is completed
   */
  public clearExecutor(): void {
    this._currentExecutor = null;
  }

  /**
   * Reset cached project context (path/name).
   * Called when the workspace folder changes so that subsequent reads fall back
   * to the current workspaceFolders[0] instead of a stale path from a previous workspace.
   */
  public resetCachedProject(): void {
    this._projectName = undefined;
    this._projectPath = undefined;
  }

  /**
   * Check and fix .vscode directory permissions
   * Make sure the .vscode directory permissions are 750
   * @returns {Promise<boolean>} always returns false (retains the original logical return value)
   */
  public async checkVscode(): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return false;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const vscodePath = getIdeConfigDir(workspacePath);

    if (fs.existsSync(vscodePath)) {
      const commandExecutor = new CommandExecutor();

      await commandExecutor.execute(`chmod 750 ${vscodePath}`, [], [], {});
    }

    return false;
  }
}
