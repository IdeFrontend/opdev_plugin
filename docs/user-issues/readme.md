# User-reported plugin issues

Tracked issues from the public feedback board:

**https://gitcode.com/opdevtools/plugin_release/issues**

This folder groups open and closed reports by theme, documents their current state in the `mstt` codebase, lists open questions for reporters, and outlines implementation plans.

## Summary (as of 2026-09-14)

| Status | Count |
|--------|-------|
| Open | 14 |
| Closed (tracked) | 2 |
| Total | 16 |

## Documents

| Document | Issues | Priority |
|----------|--------|----------|
| [standard-custom-workflow.md](./standard-custom-workflow.md) | [#8](https://gitcode.com/opdevtools/plugin_release/issues/8), [#9](https://gitcode.com/opdevtools/plugin_release/issues/9), [#10](https://gitcode.com/opdevtools/plugin_release/issues/10) — design, user guidance, verification | P0 |
| [a5-environment.md](./a5-environment.md) | [#6](https://gitcode.com/opdevtools/plugin_release/issues/6) | P0 |
| [profiling-and-insight.md](./profiling-and-insight.md) | [#1](https://gitcode.com/opdevtools/plugin_release/issues/1), [#2](https://gitcode.com/opdevtools/plugin_release/issues/2) | P1 |
| [config-lifecycle.md](./config-lifecycle.md) | [#11](https://gitcode.com/opdevtools/plugin_release/issues/11) | P1 |
| [startup-performance.md](./startup-performance.md) | [#4](https://gitcode.com/opdevtools/plugin_release/issues/4), [#7](https://gitcode.com/opdevtools/plugin_release/issues/7) | P2 |
| [ascend-c-language.md](./ascend-c-language.md) | [#84](https://gitcode.com/opdevtools/plugin_release/issues/84) — Ascend C entry in the language picker, implemented (GC-84) | P1 |
| [closed-issues.md](./closed-issues.md) | [#3](https://gitcode.com/opdevtools/plugin_release/issues/3), [#5](https://gitcode.com/opdevtools/plugin_release/issues/5) | — |

## Cross-cutting notes

- **#8, #9, #10** share the same reporter (`devin-cwd`) and ops-math / 一站式 platform context (v1.2.9 / v1.3.0). Treat as one reproduction environment where possible.
- **#4 and #7** both describe slow loading; #7 may be marketplace download timeout (infra) vs #4 activation latency (code).
- A5 env work is partially documented in [ascend-a5-support.md](../ascend-a5-support.md) and [ascend-env-spec.md](../ascend-env-spec.md).

## Related internal docs

- [ascend-env-spec.md](../ascend-env-spec.md) — SOC / simulator / NPU arch resolution contract
- [ascend-a5-support.md](../ascend-a5-support.md) — A5-specific behavior and gaps
- [generated-files-specification.md](../generated-files-specification.md) — generated files, `devtool_config.json`, `.vscode/cache.json`
- [performance.md](../performance.md) — Simulation / on-board profiling and results tree
- [operator-treeview.md](../operator-treeview.md) — Sidebar native trees (Home, Actions, Operators, sanitizer/performance results)
- [workspace-settings.md](../workspace-settings.md) — Workspace `op-devtools.*` settings and runtime mapping
