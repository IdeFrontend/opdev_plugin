# Changelog

Notable changes to **Huawei OP DevTools** are listed here. For the full project history, see the repository on [GitCode](https://gitcode.com/mlh0101/mstt).

## Unreleased

- **Fix missing operator/platform in standard-custom "run example"** (plugin_release #171): the command was emitted as `bash build.sh --vendor_name=custom --run_example`. build.sh's `--run_example` reads the example name + mode from **positional** args (`<op> <mode> <pkg_mode>`), not from `--ops` (a field run with `--ops=abs` still showed an empty `name:`); without them it printed `Start to run examples, name:  mode:` (both empty) and fell back to its usage text — the example was neither compiled nor run. `CannCommandStrategy.buildExampleCommand` now appends the positional `<op> <mode> cust` consistently with `AscendCommandStrategy` (operator from the selection, else the build_example config's own `op`) and ensures `--soc` (which sets COMPUTE_UNIT, via the `{soc_version}` placeholder resolved at execution); it does not duplicate `--soc` when `compileOption` already supplies it (the simulate-example flow).
- **Per-operator run_example mode auto-detection** (plugin_release #171 follow-up): the example mode (`eager` → `test_aclnn_<op>.cpp`, `graph` → `test_geir_<op>.cpp`) is a property of the operator, not a plugin-wide preference — but the only control was the single `op-devtools.compileAndDeploy.exampleBuildConfig.executionMode` setting. With it hard-defaulting to `eager`, an operator that ships only a graph example (e.g. `pows`) failed with `ERROR: pows does not have eager examples`. The plugin now inspects the operator's `examples/` directory (bounded walk mirroring build.sh's `find */<op>/examples/*`, skipping `experimental/`) and picks the mode that actually ships; the `executionMode` setting is used only as a tiebreaker when both modes exist. When the operator ships neither example, a warning is shown up front instead of failing deep in build.sh. The example-filename matchers default to the build.sh contract (`^test_aclnn_.*\.cpp$` / `^test_geir_.*\.cpp$`, which the plugin's own operator templates also follow) and are overridable as **regular expressions** via `op-devtools.compileAndDeploy.exampleBuildConfig.eagerExamplePattern` / `graphExamplePattern` — the `test_aclnn_`/`test_geir_` naming is specific to the ops-math family of CANN operator repos, not a CANN-wide standard (e.g. cann-ops-adv names aclnn examples `test_<op>.cpp`). The positional `<op> <mode> cust` is now appended only when the run script actually uses the `--run_example` interface, so pointing the plugin at a project with a different example interface (e.g. cann-ops `-e|--example`) no longer corrupts the command. (Note: `abs` not building on `ascend910b` is unrelated — `abs` registers only `ascend950` in its `*_def.cpp`, so it is A5-only.)
- **SOC-gate simulation `--aic-metrics`** (GC-22 / plugin_release #32): `msprof op simulator` only accepts metrics supported by the platform selected via `--soc-version`. A3 (`ascend910_93`, i.e. `Ascend910C`) does not support `ResourceConflictRatio`, yet the default simulate config passed `--aic-metrics=ResourceConflictRatio,PMSampling`, failing with `Unexpected argument --aic-metrics=ResourceConflictRatio, maybe in wrong soc platform`. Optional metrics are now emitted only when the resolved CANN SOC slug is allow-listed in `SIMULATOR_OPTIONAL_METRIC_SOCS`; the allow-list ships empty, so every platform emits only the mandatory `PipeUtilization` base (slugs to be added per metric once verified on the real CANN simulator). The `PipeUtilization` / `ResourceConflictRatio` mutual-exclusion rule is unchanged. The allow-list now lives in `shared/msprof-simulator-metrics.ts` as the single source of truth shared by the command builder and the simulator-options webview, which shows an optional-metric checkbox only when that metric is actually collected on the current SOC (no more silently-dropped toggles).

## 1.3.3 — 2026-06-15

Patch release: simulation profiler fixes, UX improvements, deploy correction, and documentation.

- **Reset project configuration** — command registered in the sidebar; clearer English/Chinese confirmation before clearing workspace settings; window reloads automatically after reset; duplicate Cancel button removed.
- **Welcome screen** — redesigned welcome panel layout and copy; welcome webview tab icon resolved from extension branding assets.
- **Open Welcome from Actions view** — new sidebar command group and menu entry on the Actions tree to reopen the welcome page.
- **Command palette** — user-facing commands grouped under the product name (`%config.title%`); UI-only sidebar/operate commands hidden from the palette.
- **Triton / PyAsc context** — improved active `.py` file detection from editor and workspace context so sanitizer, simulation, and on-board flows no longer prompt to open a `.py` when one is already active.
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
