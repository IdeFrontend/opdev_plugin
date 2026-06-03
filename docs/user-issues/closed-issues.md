# Closed issues (reference)

**Issues:** [#3](https://gitcode.com/opdevtools/plugin_release/issues/3), [#5](https://gitcode.com/opdevtools/plugin_release/issues/5)  
**Reporter:** `虎啸山村`

These issues are closed on GitCode. Documented here for context and regression awareness.

---

## Issue #3 — Click whole report name to expand

**State:** Closed (~6 days ago, created ~7 days ago)  
**Link:** https://gitcode.com/opdevtools/plugin_release/issues/3

### Reported symptoms

User wanted to click anywhere on the performance report row (not just the expand chevron) to expand the report in the sidebar.

No description body beyond title.

### Resolution status

Closed without detailed resolution comment on GitCode. Likely addressed in a recent build touching performance results tree UX.

### Relevant code (if regression)

| File | Role |
|------|------|
| `plugin/src/class/operate-tree-provider.ts` | Performance report tree nodes |
| `docs/performance.md` | Performance profiling and results tree |

### Follow-up questions (only if reopened)

1. Which plugin version fixed the behavior?
2. Which tree — Performance results or Operate tree?
3. Steps to reproduce on current version?

---

## Issue #5 — Chinese language should match IDE setting

**State:** Closed (~7 days ago)  
**Link:** https://gitcode.com/opdevtools/plugin_release/issues/5

### Reported symptoms

When VS Code display language is Chinese, plugin Home screen and settings descriptions appear in English.

### Documented root cause (from issue comments)

Known VS Code localization bug (similar to [vscode-cpptools discussion #9192](https://github.com/microsoft/vscode-cpptools/discussions/9192)) — extension locale may not sync with IDE language until user toggles display language.

### Applied workaround

- Default plugin language switched from English to Chinese.
- **Side effect:** English-display VS Code users may see Chinese in Home/settings until they toggle language English → Chinese → English (inverted problem).

### Relevant code

| File | Role |
|------|------|
| `plugin/src/extension.ts` | `initI18n()` — `lng: vscode.env.language` via i18next |
| [`shared/i18n/`](../../shared/i18n/) | Webview/extension strings (`en.ts`, `zh-cn.ts`) |
| `package.nls.json`, `package.nls.zh-cn.json`, `package.nls.en.json` | Manifest / Settings UI labels (VS Code locale) |
| [`README.md`](../../README.md) | User-facing locale setup (Configure Display Language) |

### Open questions (only if reopened)

1. VS Code version and plugin version?
2. Does toggling display language still fix it?
3. Should plugin follow `vscode.env.language` dynamically without manual toggle?

### Implementation plan (if revisited)

1. **Detect `vscode.env.language`** at activation and on `vscode.env.onDidChange` if available.
2. **Avoid hard default to Chinese** — prefer IDE language with fallback chain: IDE → stored preference → `zh-cn`.
3. **Document** workaround in README until VS Code fixes upstream behavior.
4. **Test** activation with `locale: zh-cn` and `locale: en` in VS Code settings.

---

## Regression checklist

When changing performance tree or i18n:

- [ ] Report row click expands/collapses on full row width (#3)
- [ ] Home and settings match VS Code `zh-cn` display language without manual toggle (#5)
- [ ] Home and settings match VS Code `en` display language without manual toggle (#5 side effect)
