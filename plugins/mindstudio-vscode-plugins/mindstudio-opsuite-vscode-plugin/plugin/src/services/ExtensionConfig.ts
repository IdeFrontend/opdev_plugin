import * as vscode from 'vscode';
import packageJson from '../../../package.json';

/**
 * VS Code 扩展配置
 */
export class ExtensionConfig {
  private static _context: vscode.ExtensionContext;

  public static init(context: vscode.ExtensionContext): void {
    ExtensionConfig._context = context;
  }

  /**
   * @deprecated 避免暴露context自身
   */
  public static get context(): vscode.ExtensionContext {
    return ExtensionConfig._context;
  }

  /** 扩展路径 */
  public static get extensionPath(): string {
    return ExtensionConfig._context.extensionPath;
  }

  /** 扩展名称 */
  public static get extensionName(): string {
    return packageJson.name;
  }

  /** 产物包名 */
  public static get packageName(): string {
    return `${packageJson.publisher}.${packageJson.name}-${packageJson.version}`;
  }

  /** 发布者 */
  public static get publisher(): string {
    return packageJson.publisher;
  }

  /** 版本 */
  public static get version(): string {
    return packageJson.version;
  }
}
