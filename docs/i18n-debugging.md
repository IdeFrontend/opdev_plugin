# Debugging Webview Language (i18n)

When the VS Code UI is in Chinese but webview content still shows English (e.g. "Click to open or open to view the plugin introduction."), use these steps to find the cause.

## 1. Open the Webview Developer Tools

1. Run the extension in **Extension Development Host** (F5 or "Run and Debug" → "Run Extension").
2. In the Development Host window, open the panel that shows the English text (e.g. the **Feature List** sidebar with the home view).
3. **Right‑click the webview’s title bar** (the strip with the view name, e.g. "功能列表") and choose **"Open Webview Developer Tools"** (or use the Command Palette and search for it).
4. In the DevTools window, open the **Console** tab.

## 2. Check the debug logs

The extension logs i18n state to the console. Look for:

- **`[OP DevTools i18n]`** – first log when the webview loads:
  - **`__VSCODE_LANG__`** – value injected by the plugin (from `vscode.env.language`).
  - **`resolved`** – language used for i18next (after normalization).
  - If **`__VSCODE_LANG__`** is `undefined` or the literal string **`"{{lang}}"`**, the plugin did **not** replace the placeholder in the HTML. Then:
    - Rebuild the **plugin** (so that `HtmlTransformer.transformDistHtml` and all call sites use `templateValues: { lang: ... }`).
    - Reload the Extension Development Host (Ctrl+R in the host window) and open the view again.
- **`[OP DevTools i18n] home`** (on the home view):
  - **`requested`** – language passed to `i18next.init`.
  - **`resolved`** – language i18next actually used.
  - If `resolved` is `"en"` while VS Code is in Chinese, the resource for the requested language is missing or the requested value was wrong (see above).

## 3. Inspect in the console

In the Webview DevTools Console you can run:

```js
// What was injected by the plugin
window.__VSCODE_LANG__
```

- **Expected when VS Code is in Chinese:** `"zh-cn"` or `"zh-CN"`.
- **Problem:** `undefined` or `"{{lang}}"` → HTML was served without replacing `{{lang}}` (plugin build or code path issue).
- **Problem:** `"en"` → plugin is reading the wrong locale (e.g. before VS Code display language is applied).

## 4. Rebuild and reload

After any change to plugin or web code:

1. **Build the web UI:** from repo root, e.g. `npm run build` (or whatever builds the `web` workspace into `out/web`).
2. **Build the plugin** if you changed plugin code.
3. In the **Extension Development Host** window, press **Ctrl+R** (or Cmd+R on macOS) to reload the extension.
4. Open the webview again and check the logs and `window.__VSCODE_LANG__` as above.

## 5. Summary

| What you see | Meaning |
|--------------|--------|
| `__VSCODE_LANG__` is `"{{lang}}"` or `undefined` | Plugin is not injecting locale; rebuild plugin, ensure all webview HTML goes through `transformDistHtml(..., { lang: vscode.env.language.toLowerCase() })`, and reload. |
| `__VSCODE_LANG__` is `"zh-cn"` or `"zh-CN"` but UI still English | Web bundle may be old (missing `getWebviewLang` or zh-CN resource). Rebuild web, reload extension, try again. |
| `resolved` is `"en"` in the second log | i18next fell back to English; check that `shared/i18n` has a resource for the requested language (e.g. `zh-cn` or `zh-CN`). |
