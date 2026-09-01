# Changelog

## 1.5.3 — 2026-08-31

Release: on-board and simulation profiling now compile and deploy the built `.run` package in a single `--force`-aware command; adds an NPU_ARCH override setting and a configurable execution timeout; improves built-example selection, auto-opened reports, and settings.json robustness.

- **`--force` deploy in on-board/simulation compile** — For standard-custom projects, on-board and simulation profiling merge compile and `.run` package deployment into a single command that appends `--force` when the installer supports it (matching sanitizer and DumpTensor), so the operator is installed before the example build runs; the sequence is compile+deploy → example build → msprof.
- **NPU_ARCH override setting (GC-29 / GC-37)** — New `op-devtools.environment.npuArch` workspace setting. Resolution chain: workspace setting → OS-level `NPU_ARCH` env → arch derived from the resolved SOC, consumed by a single choke point feeding command env exports, script placeholders, and `cmake -DCMAKE_ASC_ARCHITECTURES`. NPU_ARCH stays set when a project is reopened so a manual `bash build.sh` no longer trips the CMakeLists `NPU_ARCH` FATAL_ERROR; a host-detected SOC is pinned into the project settings.json for the next window, while explicit user settings and simulator-derived values are never persisted.
- **settings.json read/write robustness (GC-29 / GC-37)** — Treat a `null` workspace setting as unset instead of the string `"null"`; share a null-safe settings reader and serialize settings.json writes; tolerate a BOM and write settings.json atomically so concurrent edits do not corrupt the file.
- **Profile the example that was actually built (GC-38)** — On-board and simulation profiling run the example target the current build actually produced instead of falling back to the eager one; dangling symlinks are dropped from build-target candidates.
- **Configurable execution timeout** — New `op-devtools.execution.commandTimeoutSeconds` setting (default 1800 seconds; `0` disables the timeout). Timed-out commands terminate the whole process group (with kill escalation on Windows), and failure messages clearly report the timeout.
- **Runtime CANN include paths and on-demand C/C++ offer** — C/C++ `includePath` / `browse.path` are resolved from the actual CANN installation at runtime; the Microsoft C/C++ extension is offered only when no C/C++ language extension is installed (detected by contributed languages, so Huawei / CodeArts C/C++ count), replacing the unconditional `extensionPack` bundling of `ms-vscode.cpptools` (Remote SSH recommendation kept).
- **Auto-open freshly produced reports** — After a profiling or sanitizer run finishes, the report that run just produced opens automatically, so you no longer hunt for it in the results list; every await boundary of the auto-open is guarded (GC-54).
- **No auto-open on WebIDE refresh ([#75](https://gitcode.com/opdevtools/plugin_release/issues/75))** — Startup no longer auto-focuses the operate tree sidebar, so refreshing the WebIDE does not reopen the plugin panel and users who deliberately closed it are not disturbed.
- **Cache cleared after switching workspaces** — Runtime caches are cleared when switching workspaces to avoid configuration read errors from stale cache.
- **Marketplace identity update** — The Ascend marketplace package moved from publisher `hicann` to `cann-pub`; its identifier and display name were updated accordingly.

## 1.4.5 — 2026-08-10

Release: remote NPU execution for CPU-host operator development, including artifact return, debugging, ST testing, and remote-environment-aware operation entry points.

- **Remote operator execution and artifact return ([#60](https://gitcode.com/opdevtools/plugin_release/issues/60))** — When local NPU hardware is unavailable, use configured `remote_tool.sh` to probe the remote NPU/SOC and run supported operator workflows remotely. Return generated artifacts to the local workspace for follow-up use.
- **Remote sanitizer, on-board profiling, and DumpTensor ([#61](https://gitcode.com/opdevtools/plugin_release/issues/61), [#62](https://gitcode.com/opdevtools/plugin_release/issues/62), [#63](https://gitcode.com/opdevtools/plugin_release/issues/63))** — Run sanitizer, on-board profiling, and DumpTensor flows on the remote NPU; pull diagnostic logs, profiling outputs, and DumpTensor data back so existing local visualization flows remain available.
- **Remote NPU debugging ([#65](https://gitcode.com/opdevtools/plugin_release/issues/65))** — Add `msdebug-mi-remote` launch support, adapt remote debug targets, and start the remote debug adapter through `remote_tool.sh`; bundle MindStudio Debug 1.0.10.
- **Remote ST testing and report history ([#72](https://gitcode.com/opdevtools/plugin_release/issues/72))** — Run standard-custom ST tests remotely, return result files for report viewing, repair historical-report visualization, and log remote connection information during remote execution.
- **Remote-aware operation availability** — The Actions tree and relevant option panels recognize either local NPU hardware or a configured remote tool, guiding CPU-host users to configure `remote_tool.sh` instead of blocking supported flows too early.
- **Standard-custom capability detection and package deployment ([#66](https://gitcode.com/opdevtools/plugin_release/issues/66))** — Detect standard-custom capabilities through the public `build.sh --help` interface. Before deploying a `.run` package, detect whether its installer supports `--force` and pass the option only when supported.

Notable changes to **Huawei OP DevTools** are listed here. For the full project history, see the repository on [GitCode](https://gitcode.com/mlh0101/mstt).

## 1.4.0 — 2026-07-24

Release: standard-custom ST (TTK) testing, Performance Results refresh, debug build flags, workspace-scoped settings, zero-config C++ navigation, and CANN template updates.

- **Standard-custom ST / TTK testing ([#45](https://gitcode.com/opdevtools/plugin_release/issues/45))** — Actions-tree ST entry detects/installs TTK (`ops-test-kit`), runs `python -m ttk` by mode (kernel / aclnn / e2e) with configurable args and command preview, visualizes CSV results, and adds a native ST run-history tree view.
- **Performance Results refresh ([#51](https://gitcode.com/opdevtools/plugin_release/issues/51))** — Manual refresh on Performance Results; safely reconcile result rows deleted from the filesystem.
- **Debug builds with `--build-type=Debug` ([#46](https://gitcode.com/opdevtools/plugin_release/issues/46))** — Append `--build-type=Debug` to CPU/NPU debug `build.sh` invocations (without duplicating an existing build type) so host binaries get debug info; default CPU debug compile inserts `--cpudebug` before `--simulator`; CANN templates keep parsing after `--simulator` / `--cpudebug` so later flags such as `--build-type` still apply.
- **Ignore user-scope op-devtools settings ([#41](https://gitcode.com/opdevtools/plugin_release/issues/41))** — Read runtime project settings (e.g. Deploy/Run Command) only from Workspace / Workspace Folder scope; ignore User / Remote User so behavior matches the resolver and Reset configuration.
- **Zero-config CANN C++ navigation** — Seed `configurationDefaults` for `*.asc`/`*.cce` → `cpp` and C/C++ `includePath` / `browse.path` under `ASCEND_HOME_PATH` for out-of-the-box go-to-definition and IntelliSense.
- **Restore local standard-custom project initialization** — Welcome-page create and workspace detection correctly register standard-custom projects when opening locally.
- **CANN templates for CPU debug and simulation** — Update `hello_world` / `addn_custom` / `torch_library` `build.sh` and CMake templates for CPU debug and simulation workflows.

## 1.3.9 — 2026-07-17

Patch release: improve default new-operator project naming and assorted UX fixes.

- **Default operator project name prefix** — change from `op_` to `op`.
- **Welcome page** — show only once.
- **SOC configuration dialog** — confirm quickly with Enter.
- **genop** — use relative paths.
- **Version** — 1.3.9.

## 1.3.8 — 2026-07-10

Patch release: gray out NPU-only actions on non-NPU extension hosts, and NPU labels on Actions tree rows.

- **Gray out NPU-only actions on non-NPU hosts ([#50](https://gitcode.com/opdevtools/plugin_release/issues/50))** — After activation, probe the extension host for Ascend NPU hardware asynchronously (`asys info -r=status`, then `npu-smi info`). NPU is **available** when either tool returns non-empty output (stdout or stderr), including driver/device errors such as a busy NPU or dcmi init failure; **unavailable** only when both commands are missing or produce no usable output (bash `command not found`, PowerShell cmdlet-not-found, or empty output). UI stays optimistically enabled while the probe is pending; on completion sets `opDevtools.npuHardwareAvailable` and refreshes the Actions tree. Grayed rows: Run, NPU debug, Sanitizer, on-board profiling, UT test, Dump tensor; compile/deploy, CPU debug, simulation, and inline gear/settings remain enabled. Explorer Run/Sanitizer/On-board entries respect command enablement; task entry points and sanitizer/on-board quick-start **Start now** buttons are blocked with `web.operate.npuHardwareRequired` (zh/en).
- **NPU labels on Actions tree** — Show a `「NPU」` description on NPU-bound operation rows (Run, Sanitizer, UT test, Dump tensor, NPU debug, on-board) to distinguish them from CPU-capable actions (compile, CPU debug, simulation).

## 1.3.7 — 2026-07-09

Patch release: Insight auto-installation, debug reliability improvements, sub-operator and configuration UX, operate-panel focus, and bundled extension recommendations.

- **Insight installation support** — Automatic Insight setup on activation (non-blocking background init). Path resolution priority: workspace `op-devtools.environment.insightPath` → `INSIGHT_HOME_PATH` (including `.env`/`.arts`) → bundled default. `InsightService` handles version mapping (`insight-version.json` with history), download (wget/curl/PowerShell with Node.js HTTP fallback), unzip validation (`index.html` check), backup/restore, and actionable manual-download prompts on failure. Performance data viewer uses the resolved Insight path.
- **msdebug library path in generated `.env`** — Splice CANN `tools/msdebug/lib` into `LD_LIBRARY_PATH` in the plugin-generated `<ide>/.env` at project creation and as a best-effort backfill before each NPU/CPU debug launch (sidebar, F5, and Run panel). Resolves msdebug-mi adapter startup failures when the LLDB library folder is missing from the dump env.
- **Abort debug when build fails or binary is missing** — Block debug launch when the resolved msdebug target executable does not exist on disk (failed or preempted debug build). Shows a clear error instead of attaching to a phantom binary.
- **Current window reuse on operator create ([#34](https://gitcode.com/opdevtools/plugin_release/issues/34))** — Fix standalone operator and open-project flows: emit `{ forceReuseWindow: true }` for "Current Window" and `{ forceNewWindow: true }` for "New Window" instead of `{ forceNewWindow: false }`, which defers to VS Code's default and opened a new window unexpectedly.
- **README and packaged help links ([#35](https://gitcode.com/opdevtools/plugin_release/issues/35))** — Refresh README user guidance (zh/en); update help/documentation links in CANN template READMEs and the home sidebar webview.
- **Bundled extension recommendations ([#27](https://gitcode.com/opdevtools/plugin_release/issues/27))** — Add `extensionPack` entries for Remote - SSH and C/C++ (`ms-vscode-remote.remote-ssh`, `ms-vscode.cpptools`) so VS Code prompts to install required companion extensions.
- **Reset configuration for nested workspaces ([#41](https://gitcode.com/opdevtools/plugin_release/issues/41))** — Reset project configuration clears both the effective project root and the VS Code workspace folder root when they differ (e.g. workspace opened on a subfolder). Legacy configs, ops records, `.arts` devtool config, and workspace settings are removed from all relevant roots before reload.
- **Ignore duplicate compile actions ([#42](https://gitcode.com/opdevtools/plugin_release/issues/42))** — `OperatorCompileRunGate` drops duplicate Build/Run requests while the same action is already queued or running, preventing double compile invocations.
- **`.asc` kernel file highlighting ([#25](https://gitcode.com/opdevtools/plugin_release/issues/25))** — Seed `files.associations` for `*.asc` → `cpp` alongside existing `*.cce` mapping in workspace `<ide>/settings.json` so Ascend kernel breakpoints work; preserve user-configured associations when already set.
- **Focus operate panel instead of toggling sidebar ([#33](https://gitcode.com/opdevtools/plugin_release/issues/33))** — Editor-title icon focuses the plugin's operate panel (auxiliary bar) via `workbench.view.extension.*` or `workbench.action.focusAuxiliaryBar`, instead of toggling the primary sidebar and closing Explorer/Debug.
- **Sub-operator creation uses workspace project type ([#13](https://gitcode.com/opdevtools/plugin_release/issues/13))** — Detect sub-operator creation from the current workspace type (both `standard-custom` and legacy stored `ascend`) rather than hard-coded assumptions; resolves parent collection by workspace root so nested standard-custom operators scaffold correctly.

## 1.3.6 — 2026-07-01

Patch release: new-project UI refresh, compile/run queue coordination, sanitizer defaults, SOC warning improvements, CANN template cleanup.

- **New project and welcome UI (GC-40)** — Replace static template PNG previews with dynamic Seti file-tree previews; align welcome and new-project tab layout; fix Create form validation after the tab refactor; rename `pyasc_temple` → `pyasc_template` with generator wiring; remove the unused open-project panel and legacy preview PNG assets.
- **Compile/run queue coordination (GC-24)** — Serialize Build, Run Example, and Run through `OperatorCompileRunGate` so Run waits for an in-flight compile instead of racing the shared executor. Coordinate the operator action queue with compile/run (cross-queue preemption, **Stop all** clears both queues, queue UI shows compile spinner while Run is queued). Debug flows use the same gate; sanitizer cancellation is reliable when compile/run actually starts.
- **Sanitizer detection defaults (GC-36)** — Enable memcheck, racecheck, initcheck, check-unused-memory, and leak-check by default in workspace settings, generated configs, and the sanitizer quick-options panel via shared `DEFAULT_SANITIZER_DETECTION_OPTIONS`.
- **Missing SoC version warning (GC-43 / [plugin_release #43](https://gitcode.com/opdevtools/plugin_release/issues/43))** — Show a short, actionable warning only when operator commands run with unresolved SOC, not during project open or passive env reads. Suppression uses the same explicit workspace check as the resolver so User-scoped settings do not hide the warning; **Open SoC setting…** opens workspace `environment.socVersion`. Warning repeats on every operator run until SOC is configured. Corrected the `socVersion` settings example from `ascend10b` to `ascend910c`.
- **CANN CMake template cleanup** — Drop redundant `target_link_libraries` for tiling_api/register/platform/m from AscendC kernel templates; these libraries are provided by the ASC toolchain.

## 1.3.5 — 2026-06-26

Patch release: Triton simulation profiling and sanitizer support, simulation profiler fixes, NPU debug and sanitizer improvements.

- **Triton profiling and sanitizer** — Triton projects can run **simulation profiling** (`msprof`) and **sanitizer** (`mssanitizer`) from the plugin. Sanitizer quick-options add detection scope, block ID, and logging controls; the active `.py` target is synced from the editor into runtime config; `--log-file` paths are shell-quoted.
- **SOC-gated simulation `--aic-metrics`** — `msprof op simulator` only accepts metrics supported by the platform selected via `--soc-version`. A3 (`ascend910_93`, i.e. `Ascend910C`) does not support `ResourceConflictRatio`, yet the default simulate config passed `--aic-metrics=ResourceConflictRatio,PMSampling`, failing with `Unexpected argument --aic-metrics=ResourceConflictRatio, maybe in wrong soc platform`. Optional metrics are emitted only when the resolved CANN SOC slug is allow-listed in `SIMULATOR_OPTIONAL_METRIC_SOCS` (`shared/msprof-simulator-metrics.ts`); the command builder and simulator-options webview share this single source of truth. A2/A3 still emit only the mandatory `PipeUtilization` base; the `PipeUtilization` / `ResourceConflictRatio` mutual-exclusion rule is unchanged. **A5 (`ascend950`)** is now allow-listed for `ResourceConflictRatio` and `PMSampling` after §8.1 CLI verification — both checkboxes appear on A5 simulation quick-options; the default simulate command changes from `--aic-metrics=PipeUtilization` to `--aic-metrics=ResourceConflictRatio`. See `docs/simulator-options-spec.md`.
- **Fix missing operator/platform in standard-custom “run example”** — `build.sh --run_example` reads the example name and mode from **positional** args (`<op> <mode> <pkg_mode>`), not from `--ops`. Without them the script printed empty `name:` / `mode:` and fell back to usage. `CannCommandStrategy.buildExampleCommand` now appends `<op> <mode> cust` consistently with `AscendCommandStrategy` and ensures `--soc` (via `{soc_version}`) when not already present in `compileOption`.
- **Per-operator run_example mode auto-detection** — example mode (`eager` vs `graph`) is detected by scanning the operator’s `examples/` directory (mirroring build.sh’s layout, skipping `experimental/`). The global `executionMode` setting is a tiebreaker only when both modes exist. Filename matchers default to `^test_aclnn_.*\.cpp$` / `^test_geir_.*\.cpp$` and are overridable via `eagerExamplePattern` / `graphExamplePattern`. Positional args are appended only when the run script uses the `--run_example` interface.
- **NPU debug launch.json auto-adapt** — before debug launch, `launch.json` targets are resolved under the **selected operator’s own** `build/` directory (not workspace-root `build/`), using plugin default names (`test_aclnn_<op>`, then `<op>`, graph binaries, and build_example targets). Multi-operator selection uses the first selected operator; legacy root `build/` placeholders are replaced; a user warning is shown when auto-adapt cannot resolve a target.
- **Sanitizer A5 CMake template fixes** — CANN project templates patch SOC-aware sanitizer compile/link flags at generation time: A5 gets `-g` only; non-A5 keeps `--cce-enable-sanitizer` and link flags. Only SOC-varying suffixes use placeholders so shared options (`-O2`, `--cce-fatobj-link`) stay literal.
- **MindStudio Debug VSIX 1.0.9** — bundled debug extension updated from 1.0.8 to 1.0.9.

## 1.3.3 — 2026-06-15

Patch release: simulation profiler fixes, UX improvements, deploy correction, and documentation.

- **Reset project configuration** — command registered in the sidebar; clearer English/Chinese confirmation before clearing workspace settings; window reloads automatically after reset; duplicate Cancel button removed.
- **Welcome screen** — redesigned welcome panel layout and copy; welcome webview tab icon resolved from extension branding assets.
- **Open Welcome from Actions view** — new sidebar command group and menu entry on the Actions tree to reopen the welcome page.
- **Command palette** — user-facing commands grouped under the product name (`%config.title%`); UI-only sidebar/operate commands hidden from the palette.
- **`.run` deploy** — append `--force` when reinstalling packages on **A2** and **A5** SOCs (`ascend910b`, `ascend950`, …); A3 (`ascend910_93`) unchanged.
- Simulation profiling passes the **simulator directory name** (e.g. `Ascend910B3`, `Ascend910C`, `Ascend950PR_9589`) to `msprof op simulator --soc-version`, not the CANN SOC slug — restores pre-1.3.2 behavior and matches msopprof / CANN `tools/simulator` layout.
- Simulation profiling no longer emits `PipeUtilization` and `ResourceConflictRatio` together; when conflict ratio is enabled, only `ResourceConflictRatio` (+ optional `PMSampling`) is passed, matching msprof mutual-exclusion rules.
- Canonical specification for `--soc-version` vs slug vs spawn env added in `docs/ascend-env-spec.md` §8.1; performance and A3/A5 env docs reconciled.

## 1.3.2 — 2026-06-08

Patch release: Ascend env resolution and explicit command-line exports, standard-custom in-collection operator creation, SOC/simulation/debug consistency, settings migration, and reliability fixes.

- When creating a sub-operator inside a standard-custom collection, scaffolding completes at the chosen path without prompting to open in the current window, avoiding misclassification as a standalone project.
- Standard-custom operator creation prefers the project’s own `build.sh --genop`; new **genOpCommand** setting (default `bash build.sh --genop={path}/{operatorname}`) with transparent fallback to plugin templates when genop is missing, fails, or produces no source.
- Standard-custom build, debug, and tuning flows inject operator names via the `--ops={operatorNames}` placeholder in script templates (legacy scripts without the placeholder still supported).
- Centralized Ascend series detection: chip name normalization, A3 `Ascend910_93xx` recognition, and A2 Pro/Premium/901 `dav-1001` handling.
- Atlas A3 represented as CANN SOC `ascend910_93` across detection, warning examples, and docs; `Ascend910A` mapped to the 910B family.
- **SOC settings** from the SOC-not-detected warning and the gear **Project Config** entry open the same **Workspace**-scope settings view (User-scope values were previously ignored by the resolver).
- Simulation profiling passed the CANN SOC slug (e.g. `ascend910_93`) to `msprof op simulator --soc-version` instead of the simulator device directory name (e.g. `Ascend910C`). **Superseded in 1.3.3** — slug is not accepted by msopprof on A2/A5 field toolkits; see `docs/ascend-env-spec.md` §8.1.
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
