/**
 * VS Code configuration reading help module
 * Used to read the configuration items of the plug-in
 */
import { getOpDevtoolsWorkspaceConfiguration } from '@plugin/helpers/operator-project-workspace-config';

/**
 * Configuration helper class.
 * Reads always go through {@link getOpDevtoolsWorkspaceConfiguration} / {@link ConfigHelper.get}.
 * Workspace writes use direct `settings.json` I/O; other targets use the VS Code update API on the same configuration handle.
 */
export class ConfigHelper {
  /**
   * Get debug mode switch status
   * @returns {boolean} Whether to enable debugging mode (default is true)
   */
  static isDebugModeEnabled(): boolean {
    return ConfigHelper.get<boolean>('debugMode', true);
  }

  /**
   * Read one `op-devtools` setting (workspace-scoped configuration API).
   */
  static get<T>(key: string, defaultValue: T): T {
    return getOpDevtoolsWorkspaceConfiguration().get<T>(key, defaultValue);
  }

  /**
   * Read one `op-devtools` setting without a default (undefined when unset).
   */
  static getOptional<T>(key: string): T | undefined {
    return getOpDevtoolsWorkspaceConfiguration().get<T>(key);
  }
}
