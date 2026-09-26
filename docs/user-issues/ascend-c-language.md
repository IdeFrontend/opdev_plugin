# Ascend C language selection for new files

**Priority:** P1  
**Issue:** [#84 — 【Requirement】是否可以在VSCode插件安装后增加asc的语言选择](https://gitcode.com/opdevtools/plugin_release/issues/84)  
**Reporter:** `wk0911`, reported 2026-09-10

---

## Requirement

1. Add a language selection option for **Ascend C** in the VS Code language picker
   shown when creating a new file.
2. Before the change the picker had no Ascend C entry, although `.asc` files were
   recognized (opened as C++) on the remote backend.

## Implemented state (GC-84)

- `contributes.languages` registers `ascend-c` with aliases `Ascend C` /
  `ascend-c` and extension `.asc` — the entry now appears in the language mode
  picker (the picker lists every registered language).
- The language entry carries a fallback icon
  (`out/web/branding/language-ascend-c.svg`, sourced from
  `web/src/assets/branding/` with per-flavor copies): the SVG is the Seti C++
  file glyph (U+E01A) extracted from the theme's own font, with the theme's
  color (#519aba) and cropped the same way the theme crops its font glyph
  (150% font size in a 16px box), so it matches the default C++ icon
  pixel-for-pixel. No custom icon theme is shipped and no user setting is
  touched; the fallback shows when the active icon theme has no icon for the
  language and allows language-mode icons (e.g. Seti and most third-party
  themes; the Minimal and Modern icons themes do not show language-mode
  icons).
- `contributes.grammars` ships a minimal grammar
  (`syntaxes/ascend-c.tmLanguage.json`) whose only pattern includes
  `source.cpp`, so Ascend C files reuse the built-in C++ highlighting. The
  grammar directory is whitelisted in `.vscodeignore` so the VSIX carries it.
- Both flavors (huawei and ascend-c-toolkit) get the contribution via the base
  manifest; covered by `apply-flavor.spec.ts`.

## Design notes

- **Default association stays `cpp`.** `configurationDefaults.files.associations`
  keeps `*.asc` → `cpp`: C/C++ IntelliSense (`ms-vscode.cpptools` and forks)
  activates per language id, and MindStudio Debug expects kernel sources as C++.
  The picker entry is an option, not a replacement for C++ tooling.
- **`.cce` is not listed** as an Ascend C extension: `.cce` files are
  Triton-generated kernel sources in the Triton cache, debugged via MindStudio
  (see `docs/debug-integration.md`), not user-authored files.

## Verification

- `plugin/src/__tests__/unit/ascend-c-language.spec.ts` — manifest entry,
  grammar integrity, packaging whitelist, unchanged `cpp` default.
- `plugin/src/__tests__/unit/apply-flavor.spec.ts` — both flavors keep the
  contribution.
