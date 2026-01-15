/**
 * VS Code 配置读取帮助模块
 * 用于读取插件的配置项
 */
import * as vscode from 'vscode';

/**
 * 配置帮助类
 */
export class ConfigHelper {
  private static readonly CONFIG_SECTION = 'op-devtools';

  /**
   * 获取调试模式开关状态
   * @returns {boolean} 是否启用调试模式（默认为 true）
   */
  static isDebugModeEnabled(): boolean {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    return config.get<boolean>('debugMode', true);
  }

  /**
   * 设置调试模式开关
   * @param enabled 是否启用
   * @param target 配置目标（全局/工作区/工作区文件夹）
   */
  static async setDebugMode(
    enabled: boolean,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    await config.update('debugMode', enabled, target);
  }

  /**
   * 监听配置变化
   * @param callback 配置变化回调函数
   * @returns 销毁监听器的 Disposable 对象
   */
  static onConfigurationChanged(
    callback: (debugMode: boolean) => void
  ): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${this.CONFIG_SECTION}.debugMode`)) {
        const newValue = this.isDebugModeEnabled();
        callback(newValue);
      }
    });
  }

  /**
   * 通用配置读取方法
   * @param key 配置键
   * @param defaultValue 默认值
   */
  static get<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    return config.get<T>(key, defaultValue);
  }

  /**
   * 通用配置设置方法
   * @param key 配置键
   * @param value 配置值
   * @param target 配置目标
   */
  static async set<T>(
    key: string,
    value: T,
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.CONFIG_SECTION);
    await config.update(key, value, target);
  }
}
