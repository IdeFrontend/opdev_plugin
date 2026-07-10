# Huawei OP DevTools - VS Code Extension

**Huawei OP DevTools** is a Visual Studio Code extension for Ascend operator development. It supports project creation, build and deploy, run validation, CPU/NPU debug, sanitizer checks, performance profiling, and result visualization inside one editor workflow.

**Current user guide:** this packaged README is the installable guide. When viewing the source repository, additional documentation is available under `docs/`. The previous discussion page at <https://gitcode.com/org/cann/discussions/54> is now marked as outdated; use this README and `docs/` as the current guidance.

**User feedback:** <https://gitcode.com/opdevtools/plugin_release/issues>

## Features

- One-stop VS Code workflow for operator development.
- Supports Ascend C, CANN standard-custom operators, PyAsc, Triton, and related project types.
- Build/deploy, run, CPU/NPU debug, sanitizer, on-board profiling, and simulation profiling.
- Handles common environment values, SoC / NPU_ARCH resolution, `.asc` highlighting, and debug configuration.
- Native sidebars for operators, actions, sanitizer reports, and performance reports.

## Requirements

- Visual Studio Code 1.80 or newer.
- CANN / Ascend toolchain and runtime. Use the version and image required by your team or official environment guide.
- Remote SSH is recommended for remote development, and Microsoft C/C++ is recommended for C/C++ language support. The current VSIX does not install these recommended extensions automatically; install them manually as needed.

## Quick Start

1. Install **Huawei OP DevTools** from the VS Code Extensions view.
2. Open an operator repository or a workspace where you want to create a project.
3. In the **Operator One-Stop Development Panel**, choose **New Operator Project** or **Open Operator Project**.
4. When creating a project, select the template, target directory, project name, and open mode. **Open in current window** reuses the current VS Code window.
5. After opening an existing project, select operators in the **Operators** view and run build, run, debug, sanitizer, or profiling actions from the **Actions** view.

## Standard-Custom Operator Repositories

For standard-custom repositories such as `ops-nn` or `ops-math`, open the repository root and select target operators from the **Operators** view.

- Examples in this documentation use `ops-nn` consistently. If your repository is `ops-math`, replace paths with your actual layout.
- Operators under `experimental/` automatically receive `--experimental`.
- On-board profiling, simulation profiling, and sanitizer flows resolve the executable from the built example target instead of assuming `test_${operatorName}`.
- If `op-devtools.environment.socVersion` is not set, the extension resolves it from the project, environment variables, or host detection. If it cannot resolve one, it prompts you to set SoC and rerun the command.

## Creating Operators And Projects

The context-menu command **New Operator in Current Directory** opens the same new-project panel and pre-fills the selected directory as the target path. Confirm the template, project name, and path in that panel before generating.

Older intermediate screens and screenshots from the previous discussion guide are obsolete; follow the current extension UI.

## Configuration And Results

- Workspace settings use `op-devtools.*`; the source repository has additional notes in `docs/workspace-settings.md`.
- Build, run, debug, and profiling flows are documented in the source repository under `docs/build-integration.md`, `docs/run-integration.md`, `docs/debug-integration.md`, and `docs/performance.md`.
- Sanitizer behavior is documented in the source repository under `docs/sanitizer.md`.

## Language

The extension and web UI support **English** and **Simplified Chinese (zh-cn)**. The language follows the VS Code display language; run **Configure Display Language** from the Command Palette and restart VS Code.
