# Synthetic performance tuning results (for manual UI testing)

The extension loads execution records from:

**`<operator_directory>/.vscode/opprof/<run_folder>/`**

- Each **immediate subdirectory** of `opprof` is one run (title = folder name; sort uses folder `ctime`).
- Only files with extensions **`.csv`**, **`.json`**, and **`.bin`** are listed; other extensions are ignored.
- Nested folders are shown when they contain at least one such file (recursively).

`operator_directory` is the operator path from your workspace `devtool_config` / build configuration (see `PerformanceRunData` in `plugin/src/core/performance/performance-run-data.ts`).

## How to use this fixture

1. Open a workspace that already has a valid operator project and `.vscode/devtool_config.json`.
2. Copy **the contents** of this directory into that operator’s `.vscode/opprof/` folder (create `opprof` if missing):

   ```text
   <your-op-root>/.vscode/opprof/run-20260115-simulated-a/
   <your-op-root>/.vscode/opprof/run-20260115-simulated-b/
   ```

3. Reload the window or trigger a performance results refresh; the two runs should appear under **Performance tuning results**.

These files are **fake data** for layout and open/copy/download flows only, not real profiler output.
