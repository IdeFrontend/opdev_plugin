# Huawei OP DevTools – VS Code Extension

VS Code extension for the Huawei operator one-stop development platform. It provides operator development, debugging, and performance analysis in a single workflow.

**User guide:** https://gitcode.com/org/cann/discussions/54

---

## Features

- Integrates with mainstream editors to improve operator development and efficiency.
- VS Code–based plugin for easy IDE setup and installation.
- Simplified workflow: edit, compile, run, debug, and tune in one place.
- Syntax highlighting and code intelligence for lower development complexity.
- Precision comparison, performance analysis, and result visualization for debugging and tuning.
- Local IDE and cloud resources via VS Code for varied project needs.

---

## Development

### Prerequisites

- **Node.js** 16+ (LTS recommended)
- **pnpm** 8+
- **VS Code** 1.80+ (for running and debugging the extension)

### Setup

```bash
# Clone the repository
git clone <repository-url>
cd mstt

# Install dependencies (monorepo: root + plugin + web + shared)
pnpm install

# Optional: install web UI dependencies if not already linked
pnpm run install:web
```

### Build

| Command | Description |
|--------|-------------|
| `pnpm run compile` | Build extension (web UI + plugin). Output: `out/` |
| `pnpm run compile:web` | Build only the web frontend (`web/` → bundled in extension) |
| `pnpm run compile:plugin` | Build only the plugin TypeScript (`plugin/src` → `out/`) |
| `pnpm run watch` | Watch plugin sources and rebuild on change (with source maps) |
| `pnpm run compile:debug` | Build with debug/source maps for extension debugging |
| `pnpm run package` | Build and pack a `.vsix` for distribution |
| `pnpm run build:icons-font` | Regenerate icon font from `web/src/assets/svg` (excludes `animated/`), output only `web/src/assets/fonts/opdevtools-icons.woff` |

First time or after pulling changes:

```bash
pnpm install
pnpm run compile
```

Regenerate icons manually when SVG sources change:

```bash
pnpm run build:icons-font
```

### Run the extension in VS Code

1. Open this repo in VS Code.
2. Press **F5** (or **Run > Start Debugging**).  
   This launches a new **Extension Development Host** window with the extension loaded.
3. In that window, use the activity bar and panels as a normal user would to test the plugin.

To test with the built-in debugger:

- Use **compile:debug** or **watch** so breakpoints in `plugin/src` and `web` are hit.
- Set breakpoints in the Extension Development Host and trigger the code paths you need.

### Project layout (relevant to development)

| Path | Purpose |
|------|--------|
| `plugin/src/` | Extension entry and core logic (TypeScript). |
| `web/` | Webview UI (Vue 3 + Vite). Built output is consumed by the extension. |
| `shared/` | Shared code and i18n (e.g. `shared/i18n` for en/zh-cn). |
| `out/` | Compiled extension output (generated). |
| `package.json` | Extension manifest and root scripts. |
| `package.nls.json` / `package.nls.zh-cn.json` | VS Code UI strings (commands, views, etc.). |

### Lint and type-check

```bash
pnpm run lint        # Run linters
pnpm run lint:fix    # Auto-fix where possible
pnpm run type-check  # TypeScript + Vue type check
```

---

## Dev Container configuration

The repo includes a **Dev Container** so you can develop in a consistent, preconfigured environment (e.g. CANN/Python 3.12).

### What is the Dev Container?

- A **Dev Container** is a VS Code/Cursor feature that runs the editor (and your tools) inside a Docker container.
- The container is defined in **`.devcontainer/devcontainer.json`**.
- Everything (Node, pnpm, dependencies) can run inside the container so that “works on my machine” matches CI and other developers.

### Configuration in this repo

- **Image:** `swr.cn-north-4.myhuaweicloud.com/ci_cann/cann-pod-python3.12:1.0.0`  
  (CANN environment with Python 3.12.)
- **Workspace folder in container:** `/workspace` (your repo is mounted here).
- **User:** `developer`.
- **Optional extra mount:** parent of the repo is mounted at `/workspace-parent` for convenience.

So when you “Reopen in Container”, VS Code/Cursor starts the container, mounts your repo at `/workspace`, and runs the editor inside the container.

### How to use it

1. **Install the Dev Containers extension** in VS Code or Cursor:  
   - Extension ID: `ms-vscode-remote.remote-containers`
2. Open the **mstt** repo folder in VS Code/Cursor.
3. **Reopen in Container:**  
   - Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → **“Dev Containers: Reopen in Container”**  
   - Wait for the image to pull and the container to start (first time may take a few minutes).
4. After the window reloads, you are inside the container.  
   - Open the integrated terminal: you’ll see a shell inside the container.  
   - Run `pnpm install`, `pnpm run compile`, **F5**, etc. as in the “Development” section above.

### Developing the plugin inside the Dev Container

- Clone/setup, install, and build as usual; the only difference is that commands run inside the container.
- Use **F5** to launch the Extension Development Host; it will run in the same environment.
- If you need more VS Code extensions (e.g. ESLint, Vue) inside the container, add them under `customizations.vscode.extensions` in `.devcontainer/devcontainer.json`.

Example (add more extension IDs as needed):

```json
"customizations": {
  "vscode": {
    "extensions": [
      "dbaeumer.vscode-eslint",
      "vue.volar"
    ]
  }
}
```

Then run “Dev Containers: Rebuild Container” so the new extensions are installed in the container.

---

## Version history (summary)

| Date       | Changes |
|-----------|--------|
| 2026-01-22 | Open existing projects; pyasc and standard custom operator create, build, debug, sanitizer, and tuning. |
| 2026-01-15 | Create operator for three <<<>>> scenarios; sanitizer and performance tuning UX improvements; download and copy path for results. |
| 2026-01-09 | Bug fixes. |
| 2025-12-30 | New project creation (<<<>>> only); <<<>>> build, debug, tuning; integration with CodeArts IDE. |

---

## Language

- The extension and web UI support **English** and **Simplified Chinese (zh-cn)**.
- Language follows the **VS Code display language** (Command Palette → **Configure Display Language** → choose **English** or **中文(简体)** → restart).

For the Chinese README, see [README.md](./README.md).
