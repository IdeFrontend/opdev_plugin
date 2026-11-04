# Contributing to Ascend C Toolkits

This document is for **developers** who build or debug the extension from source. End-user documentation is linked from [README.md](./README.md) and [README.en.md](./README.en.md).

**Repository:** https://gitcode.com/kaocong/mstt

## Prerequisites

- **Node.js** 16+ (LTS recommended)
- **pnpm** 8+
- **VS Code** 1.80+ (for running and debugging the extension)

## Setup

```bash
git clone https://gitcode.com/kaocong/mstt.git
cd mstt

# Install dependencies (monorepo: root + plugin + web + shared)
pnpm install

# Optional: install web UI dependencies if not already linked
pnpm run install:web
```

## Extension flavors (per-branch committed manifest)

Multiple VSIX brands are built from this repo. **Ascend C Toolkits** is the default development flavor.

| Path | Role |
|------|------|
| `package.json` | **Committed canonical manifest** + root scripts. Edit `contributes` here; `apply-flavor` regenerates flavor-specific fields. |
| `package.nls.base*.json` | NLS templates |
| `package.nls*.json` | Committed NLS for the branch's flavor (regenerated) |
| `flavors/{id}/` | Per-flavor identity, branding, feature flags |
| `shared/flavor/generated.ts` | Committed runtime constants for the branch's flavor (regenerated) |

Which flavor is committed depends on the branch: **Huawei** manifest/NLS/generated on Huawei-baseline branches (e.g. `master`), **ascend-c-toolkit** form on ascend-c-toolkit branches. The two directions convert losslessly in both ways — `apply-flavor` normalizes any known flavor form back to the Huawei baseline template and re-injects feature-gated sections (see `manifestRestore` in `flavors/schema.ts`). **`pnpm run apply-flavor` with no argument defaults to `ascend-c-toolkit`.** `pnpm run compile` does not run `apply-flavor` — it builds whatever flavor artifacts are already on disk.

**Important:** Keep the branch's own flavor form committed on git HEAD (Huawei form on baseline branches, ascend form on ascend branches). `pnpm run restore-flavor` re-applies the flavor committed on git HEAD.

Flavor `features` in `flavors/{id}/flavor.json` declare **per-brand differences only**. Today the sole flag is `operatorSupport.triton` (Huawei: optional via Settings, default off; Ascend: hard off via gate). Re-add entries to `FEATURE_CATALOG` in `flavors/schema.ts` when a second flavor needs to disable sanitizer, dump tensor, or other capabilities — including a `manifestRestore` fragment so the section survives flavor round-trips.

### Pack another flavor (e.g. Ascend C Toolkits)

```bash
pnpm run apply-flavor:ascend-c-toolkit
pnpm run compile
pnpm run package
# → ascend-c-toolkit-{version}.vsix (extension id: cann-pub.asc-toolkit)
```

This rewrites manifest/NLS/generated files on disk. Commit only the flavor form that belongs to the current branch (ascend form on ascend-c-toolkit branches; on Huawei-baseline branches do not commit Ascend artifacts).

Also run **`pnpm run restore-flavor`** before F5/debug or `pnpm run compile` if you previously applied another flavor — `restore-flavor` runs `git restore` on generated artifacts and re-applies the flavor committed on git HEAD.

Optional: set `FLAVOR=huawei` instead of passing a CLI argument to `apply-flavor` (the default without either is `ascend-c-toolkit`).

### Restore the committed flavor before commit

```bash
pnpm run restore-flavor
git status   # should be clean for manifest files
```

A **pre-commit hook** (`.husky/pre-commit`) runs on every commit after `pnpm install` (via the `prepare` / husky setup). On Huawei-baseline branches it blocks commits when staged flavor files contain Ascend C Toolkits content (the check is disabled on ascend-c-toolkit branches, where the ascend form is the committed state). Run `restore-flavor` before committing after building another flavor.

If hooks are not running, run `pnpm install` once to activate husky (`git config core.hooksPath` should be `.husky/_`).

Flavor scripts: `apply-flavor`, `apply-flavor:huawei`, `apply-flavor:ascend-c-toolkit`, `restore-flavor`, `check-staged-flavor`. You can also pass a flavor id: `pnpm exec tsx scripts/apply-flavor.ts ascend-c-toolkit`.

## Build

| Command | Description |
|--------|-------------|
| `pnpm run compile` | Build extension (web UI + plugin). Uses flavor artifacts already on disk. Output: `out/` |
| `pnpm run compile:web` | Build only the web frontend (`web/` → bundled in the extension) |
| `pnpm run compile:plugin` | Build only the plugin TypeScript (`plugin/src` → `out/`) |
| `pnpm run watch` | Watch plugin sources and rebuild on change (with source maps). Run `restore-flavor` first if generated constants are out of sync. |
| `pnpm run compile:debug` | Build with debug/source maps for extension debugging |
| `pnpm run package` | Build and pack a `.vsix` for distribution |
| `pnpm run apply-flavor` | Apply the default flavor (`ascend-c-toolkit`) |
| `pnpm run apply-flavor:huawei` | Switch manifest to Huawei OP DevTools (converts from any known flavor form) |
| `pnpm run apply-flavor:ascend-c-toolkit` | Switch manifest to Ascend C Toolkits (see above) |
| `pnpm run restore-flavor` | Restore the flavor committed on git HEAD |
| `pnpm run build:icons-font` | Regenerate icon font from SVG sources (see below) |

First time or after pulling changes:

```bash
pnpm install
pnpm run compile
```

## Icon font regeneration

When SVG sources under `web/src/assets/svg` change (excluding `web/src/assets/svg/animated`), regenerate the font:

```bash
pnpm run build:icons-font
```

- **Script:** `scripts/build-icons-font.mjs`
- **Output:** `web/src/assets/fonts/opdevtools-icons.woff`

## Run the extension in VS Code

1. Open this repo in VS Code.
2. Press **F5** (or **Run > Start Debugging**). This opens an **Extension Development Host** window with the extension loaded.
3. Exercise the extension from the activity bar and panels as a user would.

For debugging:

- Use `pnpm run compile:debug` or `pnpm run watch` so breakpoints in `plugin/src` and `web` resolve.
- Set breakpoints in the Extension Development Host and trigger the relevant flows.

## Project layout (development)

| Path | Purpose |
|------|--------|
| `plugin/src/` | Extension entry and core logic (TypeScript). |
| `web/` | Webview UI (Vue 3 + Vite). Built output is bundled into the extension. |
| `shared/` | Shared code and i18n (e.g. `shared/i18n` for en / zh-cn). |
| `out/` | Compiled extension output (generated). |
| `package.json` | Committed **Huawei** extension manifest + root scripts (edit `contributes` here). |
| `flavors/` | Per-flavor config, branding, and feature flags. |
| `package.nls.json` (Chinese default) / `package.nls.en.json` | Committed **Huawei** localized VS Code UI strings. |

## Lint and type-check

```bash
pnpm run lint        # Run linters
pnpm run lint:fix    # Auto-fix where possible
pnpm run type-check  # TypeScript + Vue type check
```

## Dev Container

The repo includes a **Dev Container** for a consistent environment (e.g. CANN / Python 3.12).

- Configuration: [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json)
- **Image:** `swr.cn-north-4.myhuaweicloud.com/ci_cann/cann-pod-python3.12:1.0.0` (CANN with Python 3.12)
- **Workspace in container:** `/workspace` (repository mount)
- **User:** `developer`
- Optional: parent of the repo is mounted at `/workspace-parent`

### How to use

1. Install the **Dev Containers** extension (`ms-vscode-remote.remote-containers`).
2. Open the **mstt** folder in VS Code or Cursor.
3. Command Palette → **Dev Containers: Reopen in Container** and wait for the container (first pull may take several minutes).
4. In the integrated terminal, run `pnpm install`, `pnpm run compile`, and **F5** as in the sections above.

To add extensions inside the container, use `customizations.vscode.extensions` in `devcontainer.json`, then **Dev Containers: Rebuild Container**.
