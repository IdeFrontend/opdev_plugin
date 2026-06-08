# Changelog

Notable changes to **Huawei OP DevTools** are listed here. For the full project history, see the repository on [GitCode](https://gitcode.com/mlh0101/mstt).

## 1.3.2 — 2026-06-08

Patch release: Ascend env resolution and explicit command-line exports, standard-custom in-collection operator creation, SOC/simulation/debug consistency, settings migration, and reliability fixes.

- When creating a sub-operator inside a standard-custom collection, scaffolding completes at the chosen path without prompting to open in the current window, avoiding misclassification as a standalone project.
- Standard-custom operator creation prefers the project’s own `build.sh --genop`; new **genOpCommand** setting (default `bash build.sh --genop={path}/{operatorname}`) with transparent fallback to plugin templates when genop is missing, fails, or produces no source.
- Standard-custom build, debug, and tuning flows inject operator names via the `--ops={operatorNames}` placeholder in script templates (legacy scripts without the placeholder still supported).
- Centralized Ascend series detection: chip name normalization, A3 `Ascend910_93xx` recognition, and A2 Pro/Premium/901 `dav-1001` handling.
- Atlas A3 represented as CANN SOC `ascend910_93` across detection, warning examples, and docs; `Ascend910A` mapped to the 910B family.
- **SOC settings** from the SOC-not-detected warning and the gear **Project Config** entry open the same **Workspace**-scope settings view (User-scope values were previously ignored by the resolver).
- Simulation profiling passes the CANN SOC slug (e.g. `ascend910_93`) to `msprof op simulator --soc-version` instead of the simulator device directory name (e.g. `Ascend910C`).
- A5/A3 Ascend variables are exported explicitly in command strings (auditable, ordered); standard-custom projects bake `SOC_VERSION`/`NPU_ARCH` placeholders and `SUPPORT_*` defaults into generated CMake instead of polluting spawn env.
- CANN and `add_custom` project template CMake placeholders and A5 build notes updated.
- Before NPU debug launch, `launch.json` debug target auto-adapts to `build/<operatorName>` when still a placeholder or pointing at a missing file; a valid user-set target is preserved.
- One-time legacy settings migration; runtime uses VS Code workspace settings; watches main config changes.
- Fixed profiler server **Error:OTHER** in VS Code caused by default log path permissions (explicit `--logPath`).
- Restored `show_kernel_debug_data` calls in the dump tensor flow.
- Documentation consolidated (`ascend-env-spec`, user-issues index, integration guides; no functional change).

## 1.3.1 — 2026-05-28

Patch release: A5 environment alignment, standard-custom workflow fixes, faster startup, smaller download, output UX, and bug fixes.

- Standard Custom builds use chip-specific environment variables injected from resolved SoC instead of hard-coded A3 defaults in generated CMake.
- CANN project templates support A5 build and simulation; **SoC version** and **NPU arch** can be passed as CMake arguments (`-DSOC_VERSION=`, `-DNPU_ARCH=`) or via environment variables when not set on the command line. Builds from the extension inject chip env vars automatically.
- When SoC is configured or detected as Atlas A5 (`ascend950`), on-board **performance tuning** quick options show **PC sampling** instead of **Cache heatmap**.
- **SoC version** and **simulator type** settings default to unset; SOC is resolved at runtime (workspace settings, global environment variables such as `SOC_VERSION`, or host detection via Ascend tooling). Unset simulator type selects a default matching the resolved SOC for simulation. Updated setting descriptions explain resolution order.
- Warning when SoC version cannot be auto-detected (Ascend tooling such as `asys` / `npu-smi` unavailable).
- **`--force`** appended when installing generated `.run` packages after compile (Ascend Build deploy and standard-custom on-board/simulation profiling pre-steps).
- **`--experimental`** for selected experimental operators in standard-custom projects (Build, Run, UT test, on-board profiling, simulation, dump tensor, and NPU debug pre-build).
- Standard-custom on-board and simulation profiling automatically deploy the built `.run` package before `msprof` (no manual deploy step required for the default plugin flow).
- NPU debug uses the operator selected in the sidebar.
- Faster extension activation by deferring auto-open project, debug extension install, and sidebar refresh until after activation completes.
- Reduced extension package size (slimmer VSIX packaging).
- New projects open in the current window when no workspace is open, without an extra prompt.
- Tool output grouped under labeled channels (e.g. `Op Dev Tools: compile`) with reuse per command type.
- Fixed Insight performance viewer **Detail** and **Cache** tabs showing no content when opening profiling reports.
- Improved workspace `settings.json` handling when syncing Op Devtools settings (dotted-key writes; avoids overwriting concurrent user edits).

## 2026-05-15

- Full VS Code color theme support for sidebars, webview panels, and Insight views (light, dark, high contrast), including when the theme changes while the extension is running.
- Extension UI and messages follow VS Code display language: **English** and **Simplified Chinese (zh-cn)**.
- Initial **Triton** operator project support in the new-project flow.
- Save **Sanitizer** and **Profiling** options as workspace defaults with **Don’t show again** to reduce repeated configuration prompts on launch.
- Sidebar actions align with detected operator project type; workflows previously opened as separate panels are consolidated in the sidebar.
- Build, debug, and similar tasks can run in a queue; **Stop all** ends in-flight tasks; onboarding and quick-options panels remember **Don’t show again** per workspace.
- Sanitizer results use a tree layout for grouping and jumping to source; fixes for incomplete or stale result lists after startup.
- Performance tuning results view reorganized for quicker scanning; fixes for project paths and saved options not applying or matching correctly.
- **Op Devtools** settings use VS Code **User** / **Workspace** scopes like other extensions. Welcome walkthrough demos use MP4 instead of GIF.

## 2026-04-20

- Standard custom operator simulation analysis aligned with chip configuration (A5 environment).
- Project chip type can be generated automatically from the environment in project configuration (A5 environment).

## 2026-03-27

- Disk dump visualization for printf / dumptensor data; dumptensor precision comparison.
- Unit test support for standard custom operators.
- Chip type configuration in project settings.

## 2026-03-13

- User onboarding wizard on the home page.
- Environment variables merged into project configuration.
- **File** menu: create new operator project.
- **Stop** behavior improved for starting new tasks.

## 2026-02-06

- Sanitizer navigation: hover shows error details on code.
- pyasc configuration removed; run uses the active editor’s Python file (run/tune disabled when none).
- Debug actions include misuse guards.
- Editable compile command line before debug, sanitizer, and performance tuning runs.

## 2026-01-22

- Open existing projects.
- pyasc and standard custom operators: create, build, debug, sanitizer, and tuning.

## 2026-01-15

- Create operators for three `<<<>>>` scenarios.
- Sanitizer and performance tuning UX improvements.
- Download and copy path for sanitizer and performance tuning results.

## 2026-01-09

- Bug fixes.

## 2025-12-30

- New project creation (`<<<>>>` scenario).
- `<<<>>>` project build, debug, and tuning.
- Integration with CodeArts IDE.
