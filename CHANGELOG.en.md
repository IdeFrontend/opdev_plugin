# Changelog

Notable changes to **Huawei OP DevTools** are listed here.

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
