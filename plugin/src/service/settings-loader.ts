import * as vscode from 'vscode';

import {
  getFlavorDefault,
  isFlavorGated,
} from '@shared/flavor';
import { getOpDevtoolsWorkspaceConfiguration } from '@plugin/helpers/operator-project-workspace-config';
import {
  readWorkspaceCache,
  updateWorkspaceCache,
  type WorkspaceCache,
} from '@plugin/helpers/workspace-cache';
import {
  ConfigService,
  type OpDevtoolsDottedWrites,
} from '@plugin/service/config-service';

/**
 * Single settings loader for `op-devtools` workspace configuration.
 *
 * Facade over the shared settings/cache primitives: reads go through
 * {@link getOpDevtoolsWorkspaceConfiguration}, writes through the guarded
 * settings.json persist (content-diff guard), the cache through the single
 * cache.json writer (a writer always writes and merges per-field), and the
 * change watch through the single `onDidChangeConfiguration` handler.
 * Feature toggles live here; FLAVOR_DEFAULTS / FLAVOR_GATES remain in
 * @shared/flavor.
 *
 * Import direction is one-way: this loader imports main-config-watch /
 * workspace-cache / config-service; none of them import it back (no cycles).
 */
export class SettingsLoader {
  private static readonly OPERATOR_SUPPORT_KEYS: Record<string, string> = { triton: 'operatorSupport.triton' };

  /**
   * Read one `op-devtools` setting (workspace-scoped configuration API).
   */
  static read<T>(key: string, defaultValue: T): T {
    return getOpDevtoolsWorkspaceConfiguration()
      .get<T>(key, defaultValue);
  }

  /**
   * Read one `op-devtools` setting without a default (undefined when unset).
   */
  static readOptional<T>(key: string): T | undefined {
    return getOpDevtoolsWorkspaceConfiguration()
      .get<T>(key);
  }

  /**
   * Batch-write `op-devtools` settings as dotted keys in one `settings.json`
   * update (guarded persist: a byte-identical write is a no-op).
   * @returns true when settings.json was written, false when no-op
   */
  static async write(updates: OpDevtoolsDottedWrites = {}, workspaceRoot?: string): Promise<boolean> {
    return ConfigService.writeOpDevtoolsDottedSettings(updates, workspaceRoot);
  }

  /**
   * Remove all `op-devtools` keys from workspace settings.json (dotted and nested).
   * @returns true when settings.json was changed or removed, false when no-op
   */
  static async clear(workspaceRoot?: string): Promise<boolean> {
    return ConfigService.clearOpDevtoolsWorkspaceSettings(workspaceRoot);
  }

  /**
   * Tolerant read of the workspace-local `cache.json` — missing/empty resolves
   * to a fresh object; corrupt content is moved aside to `cache.json.bak` and a
   * fresh object is returned. The read never creates new cache state besides
   * that backup.
   */
  static readCache(root: string): WorkspaceCache {
    return readWorkspaceCache(root);
  }

  /**
   * Atomic read-modify-write of the workspace-local `cache.json`. A writer
   * always writes: a missing cache is created and the mutation merges
   * per-field without clobbering existing runtime state.
   * @returns true when the file was written
   */
  static async updateCache(
    root: string,
    mutate: (cache: WorkspaceCache)=> WorkspaceCache | void,
  ): Promise<boolean> {
    return updateWorkspaceCache(root, mutate);
  }

  /**
   * Operator type support toggle. No toggle key → enabled; flavor-gated keys
   * resolve the workspace setting and fall back to the flavor default
   * (FLAVOR_DEFAULTS stays in @shared/flavor).
   */
  static isOperatorSupportEnabled(operatorType: string): boolean {
    const normalized = (operatorType || '').trim()
      .toLowerCase();
    const key = SettingsLoader.OPERATOR_SUPPORT_KEYS[normalized];

    // No explicit toggle exists for this operator type, treat it as enabled.
    if (!key) {
      return true;
    }

    if (!isFlavorGated('operatorSupport.triton')) {
      return false;
    }

    const configured = SettingsLoader.readOptional<boolean>(key);

    if (configured !== undefined) {
      return configured;
    }

    return getFlavorDefault('operatorSupport.triton') ?? true;
  }

  /**
   * Sanitizer msAgent AI fix toggle: enabled only when the workspace setting is
   * explicitly set to true.
   */
  static isMsAgentAiFixEnabled(): boolean {
    return SettingsLoader.readOptional<boolean>('sanitizer.enableMsAgentAiFix') ?? false;
  }
}
