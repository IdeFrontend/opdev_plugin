# Developer documentation index (`design-docs/`)

Design and implementation specs for Ascend C Toolkits maintainers. User-facing
documentation lives under [`docs/`](./docs/readme.md).

---

## Environment & platform

| Document | Purpose |
|----------|---------|
| [`ascend-env-spec.md`](./ascend-env-spec.md) | SOC / simulator / NPU_ARCH resolution precedence, spawn env, placeholders |
| [`ascend-series-env-spec.md`](./ascend-series-env-spec.md) | Merged into `ascend-env-spec.md` — kept as a redirect to the single contract |
| [`ascend-a5-support.md`](./ascend-a5-support.md) | Ascend950PR&950DT series (`ascend950`) canonical strings, behavior, and profiler matrix |
| [`review-a3-a5-environment-support.md`](./review-a3-a5-environment-support.md) | Atlas A3 series vs Ascend950PR&950DT series implementation matrix |
| [`workspace-settings.md`](./workspace-settings.md) | All `op-devtools.*` workspace keys and runtime merge |

## Feature integration

| Document | Purpose |
|----------|---------|
| [`build-integration.md`](./build-integration.md) | Compile operator / example orchestration |
| [`run-integration.md`](./run-integration.md) | Run operator and shared execution stack |
| [`debug-integration.md`](./debug-integration.md) | CPU/NPU debug + MindStudio Debug wiring |
| [`sanitizer.md`](./sanitizer.md) | Sanitizer runs and results tree |
| [`performance.md`](./performance.md) | Simulation / on-board msprof flow and results tree |
| [`profiling-report-integration.md`](./profiling-report-integration.md) | `.rep` / `.ncrep` viewer panel (profiling-report library) |
| [`simulator-options-spec.md`](./simulator-options-spec.md) | Simulation quick-options, metric allow-list, `msprof op simulator` command |
| [`onboard_simulation_interaction.md`](./onboard_simulation_interaction.md) | 仿真分析 / 上板分析交互说明：npu-compute、npu-emulate、msprof 流程与配置 |
| [`dump-tensor.md`](./dump-tensor.md) | DumpTensor integration: queue, `.bin` import, native tree |
| [`msagent.md`](./msagent.md) | Optional msAgent bridge |

## Operator project & generation

| Document | Purpose |
|----------|---------|
| [`operator-behavior-specification.md`](./operator-behavior-specification.md) | Detection types, actions, templates (overview) |
| [`operator-plugin-registry.md`](./operator-plugin-registry.md) | `OperatorPluginRegistry` — what is wired vs remaining gaps |
| [`operator-treeview.md`](./operator-treeview.md) | Sidebar native trees, action queue, visibility |
| [`generated-files-specification.md`](./generated-files-specification.md) | Files on disk and in extension storage |
| [`new-project-generation-specification.md`](./new-project-generation-specification.md) | New Project webview and scaffold |

## msdebug

| Document | Purpose |
|----------|---------|
| [`msdebug-plugin-connection.md`](./msdebug-plugin-connection.md) | How terminal `msdebug` relates to OP DevTools + MindStudio Debug extension |
| [`msdebug-triton-e2e.md`](./msdebug-triton-e2e.md) | Manual checklist confirming `msdebug` CLI parity with `msdebug-triton-npu` |
