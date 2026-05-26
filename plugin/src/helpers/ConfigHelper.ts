/**
 * VS Code configuration reading help module
 * Used to read the configuration items of the plug-in
 */
import * as vscode from 'vscode';

import { ConfigService } from '@plugin/service/config-service';

/**
 * Configuration helper class
 */
export class ConfigHelper {
  private static readonly CONFIG_SECTION = 'op-devtools';

  /**
   * Get debug mode switch status
   * @returns {boolean} Whether to enable debugging mode (default is true)
   */
  static isDebugModeEnabled(): boolean {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);

    return config.get<boolean>('debugMode', true);
  }

  /**
   * Set the debug mode switch
   * @param enabled Is it enabled?
   * @param target configuration target (global/workspace/workspace folder)
   */
  static async setDebugMode(
    enabled: boolean,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace,
  ): Promise<void> {
    if (target === vscode.ConfigurationTarget.Workspace) {
      await ConfigService.writeOpDevtoolsDottedSettings({ debugMode: enabled });
      return;
    }
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    await config.update('debugMode', enabled, target);
  }

  /**
   * Listen for configuration changes
   * @param callback configuration change callback function
   * @returns destroys the Disposable object of the listener
   */
  static onConfigurationChanged(callback: (debugMode: boolean)=> void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${this.CONFIG_SECTION}.debugMode`)) {
        const newValue = this.isDebugModeEnabled();

        callback(newValue);
      }
    });
  }

  /**
   * Common configuration reading method
   * @param key configuration key
   * @param defaultValue default value
   */
  static get<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);

    return config.get<T>(key, defaultValue);
  }

  /**
   * Common configuration settings method
   * @param key configuration key
   * @param value configuration value
   * @param target configuration target
   */
  static async set<T>(
    key: string,
    value: T,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace,
  ): Promise<void> {
    if (target === vscode.ConfigurationTarget.Workspace) {
      await ConfigService.writeOpDevtoolsDottedSettings({ [key]: value });
      return;
    }
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    await config.update(key, value, target);
  }
}
