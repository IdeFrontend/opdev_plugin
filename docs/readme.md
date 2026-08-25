# Documentation index (`docs/`)

Canonical references for the Huawei OP DevTools VS Code extension. User-reported issues are tracked under [`user-issues/`](./user-issues/readme.md) (excluded from this index).

---

## Canonical (day-to-day)

| Document | Use when |
|----------|----------|
| [`workspace-settings.md`](./workspace-settings.md) | All `op-devtools.*` keys, runtime merge |
| [`ascend-env-spec.md`](./ascend-env-spec.md) | SOC / simulator resolution, spawn env, placeholders |
| [`ascend-a5-support.md`](./ascend-a5-support.md) | Atlas A5 / `ascend950` behavior and profiler matrix |
| [`operator-treeview.md`](./operator-treeview.md) | Sidebar trees, action queue, visibility |
| [`operator-behavior-specification.md`](./operator-behavior-specification.md) | Detection types, actions, templates (overview) |
| [`operator-plugin-registry.md`](./operator-plugin-registry.md) | `OperatorPluginRegistry` — what is wired vs remaining gaps |
| [`generated-files-specification.md`](./generated-files-specification.md) | Files on disk and in extension storage |

---

## Feature integration

| Document | Feature |
|----------|---------|
| [`build-integration.md`](./build-integration.md) | Compile operator / example |
| [`run-integration.md`](./run-integration.md) | Run |
| [`debug-integration.md`](./debug-integration.md) | CPU/NPU debug + MindStudio Debug |
| [`sanitizer.md`](./sanitizer.md) | Sanitizer + results tree |
| [`performance.md`](./performance.md) | Simulation / on-board msprof |
| [`msagent.md`](./msagent.md) | Optional msAgent bridge |
| [`new-project-generation-specification.md`](./new-project-generation-specification.md) | New Project webview + scaffold |

---

## Platform notes

| Document | Notes |
|----------|--------|
| [`review-a3-a5-environment-support.md`](./review-a3-a5-environment-support.md) | A3 vs A5 implementation matrix; shared resolver in `ascend-env-spec` |
