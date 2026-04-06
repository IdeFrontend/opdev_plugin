# VSCode Color Theme Support — Issues and Fix Plan

## Background

The plugin renders its UI through webview panels and sidebar views. To integrate with the active VSCode color theme, the codebase uses the following pipeline:

1. **Plugin side** (`WebviewProvider`, `OpsOperateProvider`, etc.) — subscribes to `vscode.window.onDidChangeActiveColorTheme` and posts `{ command: 'updateTheme', themeName: 'dark' | 'light' }` to the webview on every theme change and on initial load.
2. **Web frontend composable** (`web/src/composables/use-theme.ts`) — listens for those messages via `window.addEventListener('message', ...)` and drives a reactive `actualTheme` ref plus a computed `themeConfig` for Ant Design Vue.
3. **Vue root component** — wraps the app in `<a-config-provider :theme="themeConfig">`, which switches AntD between `darkAlgorithm` and `defaultAlgorithm`.

Four views break this pipeline in different ways, and one view bypasses it entirely.

---

## Issue 1 — `panels/welcome`: Permanently hardcoded dark

### What is broken

`web/src/views/panels/welcome/app.vue` defines `themeConfig` as a plain `const` rather than calling `useTheme()`:

```ts
// app.vue — always dark, never changes
const themeConfig = {
  algorithm: theme.darkAlgorithm,
};
```

`useTheme()` is never imported or called. The `<a-config-provider>` wrapper is present but always receives the dark algorithm regardless of the active VSCode theme. Additionally, every color in the template and scoped CSS is a hardcoded hex literal (`bg-[#1a1a1d]`, `bg-[#27272b]`, `text-[#f0f0f0]`, `border-[#464646]`, `background-color: #38383d`, etc.).

### Steps to reproduce

1. Make sure no workspace folder is open (close any open folder via **File > Close Folder**).
2. The welcome panel opens automatically on first/second launch. Alternatively open the Command Palette (`Ctrl+Shift+P`) and run `huawei-op-devtools.welcome`.
3. Switch to a light VSCode theme: **File > Preferences > Color Theme** → select any light theme (e.g., _Light Modern_).

**Expected:** Panel background becomes light; text, borders, and cards adapt to the light palette.

**Actual:** The panel stays fully dark. Background is `#1a1a1d`, text is `#f0f0f0`, card background is `#27272b`. Switching theme has zero visible effect.

### Fix plan

- Replace the hardcoded `themeConfig` constant with the `useTheme()` composable, exactly as every other panel already does:
  ```ts
  import { useTheme } from '@web/composables/use-theme';
  const { themeConfig, actualTheme } = useTheme();
  ```
- Replace all hardcoded background/text/border hex classes and inline CSS values with either:
  - **VSCode CSS variables** (`var(--vscode-editor-background)`, `var(--vscode-editor-foreground)`, `var(--vscode-panel-border)`, etc.) for structural shell colors, or
  - **AntD design tokens** exposed through `<a-config-provider>` for component-level colors, letting AntD handle them automatically once the algorithm is correct.
- The step-bar, card borders, button colors, and descriptive text should all be driven by these variables rather than hardcoded values.

---

## Issue 2 — `sidebars/home`: `useTheme` called but AntD components never switched

### What is broken

`web/src/views/sidebars/home/app.vue` calls `useTheme()` but only destructures `actualTheme`, discarding `themeConfig`:

```ts
const { actualTheme } = useTheme();
// themeConfig is never used
```

There is no `<a-config-provider>` in the template. `actualTheme` is used only for a simple text-color CSS class switch (`text-dark` / `text-light`). The AntD `<a-button>` and `<a-collapse>` components receive no algorithm change and remain in their default (dark-like) state when the sidebar was constructed.

### Steps to reproduce

1. Open VSCode with the extension installed. The plugin's primary activity bar sidebar loads automatically with the Home view.
2. Switch to a light VSCode theme (**Preferences > Color Theme** → any light theme).
3. Observe the two plain text lines — they do change color (the class switch works).
4. Observe the **"New Operator Project"** and **"Open Operator Project"** primary `<a-button>` elements.

**Expected:** Buttons switch to their AntD light-mode appearance (lighter surface tones, adjusted hover and focus rings).

**Actual:** Buttons retain dark-mode AntD styling because no `<a-config-provider :theme="themeConfig">` wrapper exists to drive the algorithm switch.

### Fix plan

- Destructure `themeConfig` from `useTheme()` in addition to `actualTheme`:
  ```ts
  const { actualTheme, themeConfig } = useTheme();
  ```
- Wrap the template root in `<a-config-provider :theme="themeConfig">`:
  ```html
  <template>
    <a-config-provider :theme="themeConfig">
      <a-collapse ...>
        ...
      </a-collapse>
    </a-config-provider>
  </template>
  ```
- Keep the existing `textContentClass` logic — that part is already correct.

---

## Issue 3 — `sidebars/dump-tensor-data`: Plugin never sends theme messages

### What is broken

The `dump-tensor-data` sidebar is registered exclusively via `ViewServer` (through `plugin/src/routes/index.ts`):

```ts
// routes/index.ts
{
  path: VIEW_DUMP_TENSOR_DATA,
  providerViewType: 'dumpTensorSidebarView',
}
```

`ViewServer.registerViewProviders()` calls `activeWebview()` to render HTML and set query params, but never subscribes to `onDidChangeActiveColorTheme` and never posts an `updateTheme` message:

```ts
// view-server.ts — resolveWebviewView callback
await this.activeWebview(webviewView.webview, routeRaw.path);
// No theme subscription. No postMessage for updateTheme.
```

`use-theme.ts` initialises `actualTheme` to `'dark'` and also proactively sends a `getTheme` request to the host, but `ViewServer` has no handler for that command either. The theme is permanently stuck at `'dark'`.

Additionally, `dumpTensorSidebarView` has no `contributes.views` entry in the root `package.json`, so the view is not currently surfaced in the VSCode UI through normal means.

### Steps to reproduce

1. Temporarily add a view entry to `package.json` under `"views" → "mindstudio-opssuite-vscode-plugin"`:
   ```json
   { "type": "webview", "id": "dumpTensorSidebarView", "name": "Dump Tensor Data" }
   ```
2. Reload the extension. The "Dump Tensor Data" view appears in the activity bar plugin container.
3. Open the view so it renders.
4. Switch between a dark and a light VSCode theme.
5. Open the webview DevTools console — no `updateTheme` message is ever received.

**Expected:** AntD components switch between dark and light algorithms on theme change.

**Actual:** The view stays permanently dark. The `use-theme.ts` composable never receives an `updateTheme` message because `ViewServer` never subscribes to or forwards theme change events.

### Fix plan

There are two complementary changes needed:

**A — Add theme push to `ViewServer`**

In `plugin/src/core/view/view-server.ts`, inside `registerViewProviders()`, after `activeWebview()` resolves, add the same theme subscription pattern used by all dedicated providers:

```ts
resolveWebviewView: async (webviewView) => {
  // ...existing setup...
  await this.activeWebview(webviewView.webview, routeRaw.path);

  // Push initial theme
  const currentKind = vscode.window.activeColorTheme.kind;
  webviewView.webview.postMessage({
    command: 'updateTheme',
    themeName: currentKind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
  });

  // Subscribe to future theme changes
  const themeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
    webviewView.webview.postMessage({
      command: 'updateTheme',
      themeName: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
    });
  });
  this.viewProviders.push(themeDisposable);
},
```

**B — Handle the `getTheme` request in `ViewServer`**

Add a `webview.onDidReceiveMessage` listener inside `resolveWebviewView` that responds to `getTheme` commands, mirroring the behaviour of `WebviewProvider.handleWebviewMessage()`.

**C — Add the `package.json` view contribution** (separate concern, but needed for the view to be accessible at all).

---

## Issue 4 — `panels/ops-config`: No theming wired on the frontend

### What is broken

`web/src/views/panels/ops-config/app.vue` has no `useTheme()` call and no `<a-config-provider>` wrapper. The entire script block is:

```ts
<script setup lang="ts">
import { ref } from 'vue';
// No useTheme import. No themeConfig. No a-config-provider.
```

`WebviewProvider.createPanel()` correctly sends `updateTheme` messages to every panel it opens (including `ops-config`), but the webview front-end has no message listener to receive them and no `<a-config-provider>` to act on them.

There is also no registered command or `package.json` contribution that opens this panel — it is currently unreachable through the normal VSCode UI.

### Steps to reproduce

1. Temporarily register a command to open the panel in `extension.ts`:
   ```ts
   const opsConfigProvider = new WebviewProvider(context, apiServer);
   vscode.commands.registerCommand('huawei-op-devtools.openOpsConfig', () => {
     opsConfigProvider.show('ops-config');
   });
   ```
2. Reload and run `huawei-op-devtools.openOpsConfig` from the Command Palette.
3. The `ops-config` panel opens showing a mock form.
4. Switch between light and dark VSCode themes.
5. Open the DevTools console — `updateTheme` messages from the host arrive correctly but nothing handles them.

**Expected:** Form elements switch between AntD dark and light styling.

**Actual:** Panel appearance never changes.

### Fix plan

- Add `useTheme()` to `app.vue`:
  ```ts
  import { useTheme } from '@web/composables/use-theme';
  const { themeConfig } = useTheme();
  ```
- Wrap the `<a-form>` in `<a-config-provider :theme="themeConfig">`:
  ```html
  <template>
    <a-config-provider :theme="themeConfig">
      <a-form :model="formModel">
        ...
      </a-form>
    </a-config-provider>
  </template>
  ```
- As a follow-up, add a proper `package.json` `contributes.commands` entry and a `vscode.commands.registerCommand` in `extension.ts` so the panel is actually reachable.

---

## Issue 5 — `InsightDataViewerPanel`: No theming at any layer

### What is broken

`plugin/src/class/insight-data-viewer-panel.ts` sets the webview's HTML to either an external file read from `$INSIGHT_HOME_PATH/index.html` or a hardcoded fallback HTML string. Neither path goes through `HtmlTransformer.transformDistHtml()`, uses `--vscode-*` CSS variables, or has any subscription to `onDidChangeActiveColorTheme`. The entire `setupWebview()` method is:

```ts
private setupWebview(): void {
  const htmlPath = path.join(this.insightPluginBasePath, 'index.html');
  let htmlContent: string;
  if (fs.existsSync(htmlPath)) {
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  } else {
    htmlContent = this.getDefaultHtml(); // Plain HTML, no theme awareness
  }
  this.panel.webview.html = htmlContent;
  // No theme subscription. No postMessage. No CSS variables.
}
```

### Steps to reproduce

1. Set the `INSIGHT_HOME_PATH` environment variable to any directory (it can contain a minimal `index.html`), or rely on the built-in fallback HTML.
2. Trigger the panel through the performance analysis webview by calling `viewService.openInsight(filePath)` with any path, or directly via `InsightDataViewerPanel.createOrShow(context, '/some/path.bin')` from a temporary debug command.
3. The panel opens.
4. Switch between dark and light VSCode themes.

**Expected:** The panel background, text, and any UI components adapt to the active VSCode theme.

**Actual:** Nothing changes. The fallback HTML renders with plain browser-default (white background) styling in both themes. External `index.html` files apply their own static styles with no theme awareness.

### Fix plan

The external `index.html` (from the Insight plugin) is not under this codebase's control, so the fix must be applied on the plugin side through CSS injection and message passing:

**A — Inject VSCode CSS variables into the fallback HTML**

Update `getDefaultHtml()` to include `--vscode-*` CSS variable usage in its `<style>` block:

```ts
private getDefaultHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
  </style>
</head>
<body>...</body>
</html>`;
}
```

VSCode automatically injects and updates these variables when the theme changes, so no JavaScript message handling is needed for the fallback case.

**B — Subscribe to theme changes and inject a class or CSS variable override into external HTML**

For the external `index.html` case, add a `vscode.window.onDidChangeActiveColorTheme` subscription in the constructor and post a message to the webview:

```ts
// In constructor, after setupWebview():
const themeDisposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
  this.panel.webview.postMessage({
    command: 'updateTheme',
    themeName: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light',
  });
});
this.context.subscriptions.push(themeDisposable);

// Also send the current theme immediately
this.panel.webview.postMessage({
  command: 'updateTheme',
  themeName: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark
    ? 'dark' : 'light',
});
```

If the external `index.html` is eventually updated to listen for this message and apply a `data-theme` attribute or similar, the theme will propagate. In the meantime, the fallback HTML at minimum can be made fully theme-aware via CSS variables alone.

---

## Common gap across all cases: high-contrast theme

All providers in the codebase map `ColorThemeKind` to only two values:

```ts
theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light'
```

`ColorThemeKind.HighContrast` and `ColorThemeKind.HighContrastLight` both collapse to `'light'`. This means that when a user selects a high-contrast theme, AntD receives the `defaultAlgorithm` (standard light) rather than a high-contrast-aware variant.

### Fix plan

Extend the theme mapping in all providers (`WebviewProvider`, `OpsOperateProvider`, `PerformancePanelViewProvider`, `MsSanitizerPanelViewProvider`) and in `ViewServer` (after the fix above) to emit a third `'high-contrast'` value:

```ts
function getThemeName(kind: vscode.ColorThemeKind): 'dark' | 'light' | 'high-contrast' {
  if (kind === vscode.ColorThemeKind.HighContrast || kind === vscode.ColorThemeKind.HighContrastLight) {
    return 'high-contrast';
  }
  return kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
}
```

Then update `use-theme.ts` to handle the third value and pass the appropriate AntD algorithm or a custom high-contrast token override to `<a-config-provider>`.

---

## Summary table

| View | Issue | Plugin-side fix needed | Frontend fix needed |
|---|---|---|---|
| `panels/welcome` | Hardcoded dark `themeConfig`; hex literal colors | None — `WebviewProvider` already sends theme correctly | Replace `const themeConfig` with `useTheme()`; replace hex colors with `--vscode-*` vars or AntD tokens |
| `sidebars/home` | `themeConfig` unused; no `<a-config-provider>` | None — `WebviewProvider` already sends theme correctly | Destructure `themeConfig` from `useTheme()`; add `<a-config-provider>` wrapper |
| `sidebars/dump-tensor-data` | `ViewServer` never sends `updateTheme` | Add `onDidChangeActiveColorTheme` + `postMessage` inside `ViewServer.registerViewProviders()`; handle `getTheme` command | None — `use-theme.ts` already wired correctly |
| `panels/ops-config` | `useTheme()` never called; no `<a-config-provider>` | None — `WebviewProvider.createPanel()` already sends theme correctly | Add `useTheme()` and `<a-config-provider>` wrapper |
| `InsightDataViewerPanel` | No `onDidChangeActiveColorTheme`; raw HTML with no `--vscode-*` vars | Add theme subscription in constructor; inject `--vscode-*` vars into fallback HTML | N/A — no Vue frontend |
| All views | High-contrast theme collapses to `'light'` | Update `ColorThemeKind` mapping to emit `'high-contrast'` | Handle `'high-contrast'` in `use-theme.ts` |
