# Huawei OP DevTools – VS Code Extension

VS Code extension for the Huawei operator one-stop development platform. It provides operator development, debugging, and performance analysis in a single workflow.

> **简体中文说明：** See [README.md](./README.md) for the Chinese product overview (used as the Marketplace long description).

**User guide:** https://gitcode.com/org/cann/discussions/54

**Repository:** https://gitcode.com/mlh0101/mstt

---

## Features

- Integrates with mainstream editors to improve operator development and efficiency.
- VS Code–based workflow for straightforward IDE setup and installation.
- Simplified flow: edit, compile, run, debug, and tune in one place.
- Syntax highlighting and code intelligence to reduce development friction.
- Precision comparison, performance analysis, and result visualization for debugging and tuning.
- Local IDE usage with support for varied project and environment setups.
- Multiple operator project types (including standard custom, pyasc, Triton, and others as versions evolve).

---

## Requirements

- **Visual Studio Code** 1.80 or newer (matches the extension `engines.vscode` field).
- Build, debug, and tuning depend on **CANN / Ascend** toolchains and runtime; use official documentation and your team’s images or environment guides for versions and installation.

---

## Getting started

1. Install **Huawei OP DevTools** from the VS Code Extensions view.
2. Follow the [user guide](https://gitcode.com/org/cann/discussions/54) to configure the environment and operator projects.
3. Use the operator development sidebar to create or open a project, then follow in-product guidance for build, debug, or tuning.

---

## Changelog

Release notes are maintained in **[CHANGELOG.md](https://gitcode.com/mlh0101/mstt/blob/vscode_plugin/CHANGELOG.md)**.

---

## Language

- The extension and web UI support **English** and **Simplified Chinese (zh-cn)**.
- Language follows the **VS Code display language** (Command Palette → **Configure Display Language** → **English** or **中文(简体)** → restart). See the [VS Code locale documentation](https://code.visualstudio.com/docs/getstarted/locale).

---

## Contributing

Build, debug, Dev Container, and layout notes for contributors are in **[CONTRIBUTING.md](https://gitcode.com/mlh0101/mstt/blob/vscode_plugin/CONTRIBUTING.md)** (shipped with the Git repository; not included in the published `.vsix` by default).
