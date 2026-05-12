import * as vscode from 'vscode';
import {
  WebviewThemeKind,
  createWebviewThemePayload,
  type WebviewThemePayload,
} from '@shared/webview-theme';

export {
  WebviewThemeKind,
  WebviewThemeName,
} from '@shared/webview-theme';

export type {
  WebviewThemePayload,
} from '@shared/webview-theme';

function toWebviewThemeKind(kind: vscode.ColorThemeKind): WebviewThemeKind {
  switch (kind) {
    case vscode.ColorThemeKind.Light:
      return WebviewThemeKind.Light;
    case vscode.ColorThemeKind.Dark:
      return WebviewThemeKind.Dark;
    case vscode.ColorThemeKind.HighContrast:
      return WebviewThemeKind.HighContrast;
    case vscode.ColorThemeKind.HighContrastLight:
      return WebviewThemeKind.HighContrastLight;
    default:
      return WebviewThemeKind.Dark;
  }
}

export function buildWebviewThemePayload(kind: vscode.ColorThemeKind = vscode.window.activeColorTheme.kind): WebviewThemePayload {
  return createWebviewThemePayload(toWebviewThemeKind(kind));
}

export function postCurrentTheme(webview: vscode.Webview): Thenable<boolean> {
  return webview.postMessage(buildWebviewThemePayload());
}

export function registerWebviewThemeBridge(webview: vscode.Webview): vscode.Disposable {
  void postCurrentTheme(webview);

  return vscode.window.onDidChangeActiveColorTheme((theme) => {
    void webview.postMessage(buildWebviewThemePayload(theme.kind));
  });
}

export function handleThemeRequest(
  webview: vscode.Webview,
  message: unknown,
): boolean {
  if (
    message
    && typeof message === 'object'
    && 'command' in message
    && message.command === 'getTheme'
  ) {
    void postCurrentTheme(webview);

    return true;
  }

  return false;
}
