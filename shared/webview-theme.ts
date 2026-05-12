export enum WebviewThemeKind {
  Light = 'light',
  Dark = 'dark',
  HighContrast = 'high-contrast',
  HighContrastLight = 'high-contrast-light',
}

export enum WebviewThemeName {
  Light = 'light',
  Dark = 'dark',
}

export interface WebviewThemePayload {
  command: 'updateTheme';
  themeKind: WebviewThemeKind;
  themeName: WebviewThemeName;
  isDark: boolean;
  isHighContrast: boolean;
}

export type WebviewThemeMessage = {
  command?: unknown;
  themeKind?: unknown;
  themeName?: unknown;
  isDark?: unknown;
  isHighContrast?: unknown;
};

export const WEBVIEW_THEME_KINDS: readonly WebviewThemeKind[] = [
  WebviewThemeKind.Light,
  WebviewThemeKind.Dark,
  WebviewThemeKind.HighContrast,
  WebviewThemeKind.HighContrastLight,
];

export type DarkWebviewThemeKind =
  | WebviewThemeKind.Dark
  | WebviewThemeKind.HighContrast;

export type HighContrastWebviewThemeKind =
  | WebviewThemeKind.HighContrast
  | WebviewThemeKind.HighContrastLight;

export const isWebviewThemeKind = (value: unknown): value is WebviewThemeKind =>
  typeof value === 'string'
  && WEBVIEW_THEME_KINDS.includes(value as WebviewThemeKind);

export const normalizeThemeKind = (value: unknown): WebviewThemeKind | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^vscode-/, '');

  return isWebviewThemeKind(normalized)
    ? normalized
    : undefined;
};

export const isDarkThemeKind = (kind: WebviewThemeKind): kind is DarkWebviewThemeKind =>
  kind === WebviewThemeKind.Dark || kind === WebviewThemeKind.HighContrast;

export const isHighContrastThemeKind = (
  kind: WebviewThemeKind,
): kind is HighContrastWebviewThemeKind =>
  kind === WebviewThemeKind.HighContrast || kind === WebviewThemeKind.HighContrastLight;

export const getThemeNameForKind = (kind: WebviewThemeKind): WebviewThemeName =>
  isDarkThemeKind(kind) ? WebviewThemeName.Dark : WebviewThemeName.Light;

export const createWebviewThemePayload = (
  themeKind: WebviewThemeKind,
): WebviewThemePayload => ({
  command: 'updateTheme',
  themeKind,
  themeName: getThemeNameForKind(themeKind),
  isDark: isDarkThemeKind(themeKind),
  isHighContrast: isHighContrastThemeKind(themeKind),
});

export const normalizeThemeMessage = (
  message: WebviewThemeMessage,
  fallbackThemeKind: WebviewThemeKind,
): WebviewThemeKind => {
  const payloadKind = normalizeThemeKind(message.themeKind);

  if (payloadKind) {
    return payloadKind;
  }

  const isHighContrast = message.isHighContrast === true;
  const isDark = message.isDark === true;

  if (isHighContrast) {
    return isDark ? WebviewThemeKind.HighContrast : WebviewThemeKind.HighContrastLight;
  }

  const legacyThemeName = normalizeThemeKind(message.themeName);

  if (legacyThemeName === WebviewThemeKind.Dark || legacyThemeName === WebviewThemeKind.Light) {
    return legacyThemeName;
  }

  return fallbackThemeKind;
};
