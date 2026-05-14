# Contributing to Huawei OP DevTools

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

## Build

| Command | Description |
|--------|-------------|
| `pnpm run compile` | Build extension (web UI + plugin). Output: `out/` |
| `pnpm run compile:web` | Build only the web frontend (`web/` → bundled in the extension) |
| `pnpm run compile:plugin` | Build only the plugin TypeScript (`plugin/src` → `out/`) |
| `pnpm run watch` | Watch plugin sources and rebuild on change (with source maps) |
| `pnpm run compile:debug` | Build with debug/source maps for extension debugging |
| `pnpm run package` | Build and pack a `.vsix` for distribution |
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
| `package.json` | Extension manifest and root scripts. |
| `package.nls.json` / `package.nls.zh-cn.json` | Localized VS Code UI strings (commands, views, settings). |

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
