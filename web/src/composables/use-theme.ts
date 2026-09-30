/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import {
  ref, computed, onBeforeMount, onUnmounted,
} from 'vue';
import { theme } from 'ant-design-vue';
import { vscode } from '@web/utils/vscode';
import {
  WebviewThemeKind,
  WebviewThemeName,
  isDarkThemeKind,
  isHighContrastThemeKind,
  normalizeThemeKind,
  normalizeThemeMessage,
  type WebviewThemeMessage,
} from '@shared/webview-theme';

export { WebviewThemeKind } from '@shared/webview-theme';

export type ActualTheme = WebviewThemeName;

const readThemeKindFromDom = (): WebviewThemeKind => {
  const html = document.documentElement;
  const body = document.body;
  const datasetCandidates = [
    html.dataset.opDevtoolsTheme,
    body.dataset.opDevtoolsTheme,
    html.dataset.vscodeThemeKind,
    body.dataset.vscodeThemeKind,
  ];

  for (const candidate of datasetCandidates) {
    const themeKind = normalizeThemeKind(candidate);

    if (themeKind) {
      return themeKind;
    }
  }

  const className = `${html.className} ${body.className}`.toLowerCase();

  if (className.includes('vscode-high-contrast-light')) {
    return WebviewThemeKind.HighContrastLight;
  }

  if (className.includes('vscode-high-contrast')) {
    return WebviewThemeKind.HighContrast;
  }

  if (className.includes('vscode-light')) {
    return WebviewThemeKind.Light;
  }

  return WebviewThemeKind.Dark;
};

const setDocumentThemeKind = (kind: WebviewThemeKind): void => {
  const root = document.documentElement;

  root.dataset.opDevtoolsTheme = kind;
  root.classList.toggle('op-devtools-theme-light', kind === WebviewThemeKind.Light);
  root.classList.toggle('op-devtools-theme-dark', kind === WebviewThemeKind.Dark);
  root.classList.toggle(
    'op-devtools-theme-high-contrast',
    kind === WebviewThemeKind.HighContrast,
  );
  root.classList.toggle(
    'op-devtools-theme-high-contrast-light',
    kind === WebviewThemeKind.HighContrastLight,
  );
};

const THEME_REFRESH_DELAYS = [
  0,
  50,
  150,
  300,
];
const THEME_TRANSITION_SUPPRESSION_MS = 160;

const readCssVar = (name: string, fallback: string): string => {
  const rootValue = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  if (rootValue) {
    return rootValue;
  }

  const bodyValue = getComputedStyle(document.body)
    .getPropertyValue(name)
    .trim();

  return bodyValue || fallback;
};

const readReactiveCssVar = (
  version: number,
  name: string,
  fallback: string,
): string => {
  if (version < 0) {
    return fallback;
  }

  return readCssVar(name, fallback);
};

const normalizeObservedThemeClass = (value: string): string =>
  value
    .replace(/\bop-devtools-theme-changing\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function useTheme() {
  const themeKind = ref<WebviewThemeKind>(readThemeKindFromDom());
  const themeVersion = ref(0);
  let themeRefreshGeneration = 0;
  let themeRefreshRaf: number | undefined;
  let themeRefreshTimers: number[] = [];
  let themeTransitionGeneration = 0;
  let themeTransitionTimer: number | undefined;
  let themeObserver: MutationObserver | undefined;

  setDocumentThemeKind(themeKind.value);

  const isDark = computed(() => isDarkThemeKind(themeKind.value));
  const isHighContrast = computed(() => isHighContrastThemeKind(themeKind.value));
  const actualTheme = computed<ActualTheme>(() =>
    isDark.value ? WebviewThemeName.Dark : WebviewThemeName.Light);

  const getPopupContainer = (_triggerNode?: HTMLElement): HTMLElement => document.body;

  const themeConfig = computed(() => {
    const cssVersion = themeVersion.value;
    const readThemeCssVar = (name: string, fallback: string): string =>
      readReactiveCssVar(cssVersion, name, fallback);

    const dark = isDark.value;
    const highContrast = isHighContrast.value;
    const foreground = readThemeCssVar('--vscode-editor-foreground', dark ? '#f0f0f0' : '#1f1f1f');
    const secondaryForeground = readThemeCssVar('--vscode-descriptionForeground', dark ? '#a6a6a6' : '#595959');
    const background = readThemeCssVar('--vscode-editor-background', dark ? '#1e1e1e' : '#ffffff');
    const containerBackground = readThemeCssVar('--vscode-editorWidget-background', background);
    const elevatedBackground = readThemeCssVar('--vscode-dropdown-background', containerBackground);
    const focusBorder = readThemeCssVar('--vscode-focusBorder', dark ? '#007fd4' : '#0090f1');
    const contrastBorder = readThemeCssVar('--vscode-contrastBorder', focusBorder);
    const widgetBorder = readThemeCssVar('--vscode-widget-border', dark ? '#454545' : '#d9d9d9');
    const border = highContrast ? contrastBorder : widgetBorder;
    const link = readThemeCssVar('--vscode-textLink-foreground', dark ? '#4ba5f4' : '#1677ff');
    const hoverBackground = readThemeCssVar('--vscode-list-hoverBackground', dark ? '#2a2d2e' : '#f5f5f5');
    const selectedBackground = readThemeCssVar(
      '--vscode-list-activeSelectionBackground',
      dark ? '#04395e' : '#e6f4ff',
    );

    return {
      algorithm: dark
        ? theme.darkAlgorithm
        : theme.defaultAlgorithm,
      token: {
        colorPrimary: highContrast ? focusBorder : link,
        colorInfo: link,
        colorLink: link,
        colorText: foreground,
        colorTextBase: foreground,
        colorTextSecondary: secondaryForeground,
        colorTextTertiary: secondaryForeground,
        colorTextQuaternary: secondaryForeground,
        colorBgBase: background,
        colorBgContainer: containerBackground,
        colorBgElevated: elevatedBackground,
        colorBgLayout: background,
        colorFill: hoverBackground,
        colorFillSecondary: hoverBackground,
        colorFillTertiary: selectedBackground,
        colorBorder: border,
        colorBorderSecondary: border,
        colorSplit: border,
        colorError: readThemeCssVar('--vscode-errorForeground', '#f14c4c'),
        colorWarning: readThemeCssVar('--vscode-editorWarning-foreground', '#faad14'),
        colorSuccess: readThemeCssVar('--vscode-testing-iconPassed', '#73c991'),
        controlOutline: focusBorder,
        controlItemBgHover: hoverBackground,
        controlItemBgActive: selectedBackground,
        fontFamily: readThemeCssVar('--vscode-font-family', 'Segoe UI, sans-serif'),
        wireframe: highContrast,
      },
    };
  });

  const suppressThemeTransitions = (): void => {
    const root = document.documentElement;
    const generation = ++themeTransitionGeneration;

    root.classList.add('op-devtools-theme-changing');

    if (themeTransitionTimer !== undefined) {
      window.clearTimeout(themeTransitionTimer);
    }

    themeTransitionTimer = window.setTimeout(() => {
      if (generation !== themeTransitionGeneration) {
        return;
      }

      root.classList.remove('op-devtools-theme-changing');
      themeTransitionTimer = undefined;
    }, THEME_TRANSITION_SUPPRESSION_MS);
  };

  const cancelThemeRefresh = (): void => {
    if (themeRefreshRaf !== undefined) {
      window.cancelAnimationFrame(themeRefreshRaf);
      themeRefreshRaf = undefined;
    }

    themeRefreshTimers.forEach((timer) => window.clearTimeout(timer));
    themeRefreshTimers = [];
  };

  const scheduleThemeRefresh = (): void => {
    const generation = ++themeRefreshGeneration;

    cancelThemeRefresh();
    suppressThemeTransitions();

    themeVersion.value++;

    themeRefreshRaf = window.requestAnimationFrame(() => {
      if (generation !== themeRefreshGeneration) {
        return;
      }

      themeRefreshRaf = undefined;
      themeVersion.value++;
    });

    THEME_REFRESH_DELAYS.forEach((delay) => {
      themeRefreshTimers.push(window.setTimeout(() => {
        if (generation !== themeRefreshGeneration) {
          return;
        }

        themeVersion.value++;
      }, delay));
    });
  };

  const applyThemeKind = (kind: WebviewThemeKind): void => {
    themeKind.value = kind;
    setDocumentThemeKind(kind);
    scheduleThemeRefresh();
  };

  const handleVscodeThemeMessage = (event: MessageEvent) => {
    const data = event.data as WebviewThemeMessage;

    if (data && typeof data === 'object' && data.command === 'updateTheme') {
      applyThemeKind(normalizeThemeMessage(data, readThemeKindFromDom()));
    }
  };

  onBeforeMount(() => {
    window.addEventListener('message', handleVscodeThemeMessage);
    themeObserver = new MutationObserver((mutations) => {
      const hasThemeChange = mutations.some((mutation) => {
        if (mutation.type !== 'attributes') {
          return false;
        }

        if (mutation.attributeName !== 'class') {
          return true;
        }

        const target = mutation.target as Element;
        const currentClass = typeof target.className === 'string' ? target.className : '';

        return normalizeObservedThemeClass(mutation.oldValue ?? '')
          !== normalizeObservedThemeClass(currentClass);
      });

      if (hasThemeChange) {
        scheduleThemeRefresh();
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        'class',
        'style',
        'data-vscode-theme-kind',
      ],
      attributeOldValue: true,
    });

    if (document.body) {
      themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: [
          'class',
          'style',
          'data-vscode-theme-kind',
        ],
        attributeOldValue: true,
      });
    }

    vscode.postMessage({ command: 'getTheme' });
  });

  onUnmounted(() => {
    window.removeEventListener('message', handleVscodeThemeMessage);
    themeObserver?.disconnect();
    themeRefreshGeneration++;
    cancelThemeRefresh();

    if (themeTransitionTimer !== undefined) {
      window.clearTimeout(themeTransitionTimer);
      themeTransitionTimer = undefined;
    }

    themeTransitionGeneration++;
  });

  return {
    actualTheme,
    themeKind,
    isDark,
    isHighContrast,
    themeConfig,
    getPopupContainer,
  };
}
