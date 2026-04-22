import * as vscode from 'vscode';
import packageJson from '../../../package.json';

/**
 * VS Code extension configuration
 */
export class ExtensionConfig {
  private static _context: vscode.ExtensionContext;

  public static init(context: vscode.ExtensionContext): void {
    ExtensionConfig._context = context;
  }

  /**
   * @deprecated avoids exposing the context itself
   */
  public static get context(): vscode.ExtensionContext {
    return ExtensionConfig._context;
  }

  /** Expansion path */
  public static get extensionPath(): string {
    return ExtensionConfig._context.extensionPath;
  }

  /** extension name */
  public static get extensionName(): string {
    return packageJson.name;
  }

  /** Product package name */
  public static get packageName(): string {
    return `${packageJson.publisher}.${packageJson.name}-${packageJson.version}`;
  }

  /** Publisher */
  public static get publisher(): string {
    return packageJson.publisher;
  }

  /** Version */
  public static get version(): string {
    return packageJson.version;
  }
}
