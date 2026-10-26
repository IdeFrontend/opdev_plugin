# 开发者文档索引（`design-docs/`）

面向 Ascend C Toolkits 维护者的设计与实现规范。面向用户的文档位于 [`docs/`](./docs/README.md)。

---

## 环境与平台

| 文档 | 用途 |
|----------|---------|
| [`ascend-env-spec-zh.md`](./ascend-env-spec-zh.md) | SOC / 仿真器 / NPU_ARCH 解析优先级、spawn 环境、占位符 |
| [`ascend-series-env-spec-zh.md`](./ascend-series-env-spec-zh.md) | 已合并进 `ascend-env-spec.md`——保留为指向单一契约的重定向 |
| [`ascend-a5-support-zh.md`](./ascend-a5-support-zh.md) | Ascend950PR&950DT 系列（`ascend950`）权威字符串、行为与性能分析矩阵 |
| [`review-a3-a5-environment-support-zh.md`](./review-a3-a5-environment-support-zh.md) | Atlas A3 系列与 Ascend950PR&950DT 系列实现矩阵 |
| [`workspace-settings-zh.md`](./workspace-settings-zh.md) | 所有 `op-devtools.*` 工作区配置键与运行时合并 |

## 功能集成

| 文档 | 用途 |
|----------|---------|
| [`build-integration-zh.md`](./build-integration-zh.md) | 编译算子 / example 编排 |
| [`run-integration-zh.md`](./run-integration-zh.md) | 运行算子与共享执行栈 |
| [`debug-integration-zh.md`](./debug-integration-zh.md) | CPU/NPU 调试 + MindStudio Debug 接线 |
| [`sanitizer.md`](./sanitizer.md) | Sanitizer 运行与结果树 |
| [`performance-zh.md`](./performance-zh.md) | 仿真 / 上板 msprof 流程与结果树 |
| [`profiling-report-integration-zh.md`](./profiling-report-integration-zh.md) | `.rep` / `.ncrep` 查看器面板（profiling-report 库） |
| [`simulator-options-spec-zh.md`](./simulator-options-spec-zh.md) | 仿真快捷选项、指标白名单、`msprof op simulator` 命令 |
| [`onboard_simulation_interaction.md`](./onboard_simulation_interaction.md) | 仿真分析 / 上板分析交互说明：npu-compute、npu-emulate、msprof 流程与配置 |
| [`dump-tensor-zh.md`](./dump-tensor-zh.md) | DumpTensor 集成：队列、`.bin` 导入、原生树视图 |
| [`msagent-zh.md`](./msagent-zh.md) | 可选的 msAgent 桥接 |

## 算子项目与生成

| 文档 | 用途 |
|----------|---------|
| [`operator-behavior-specification-zh.md`](./operator-behavior-specification-zh.md) | 检测类型、动作、模板（总览） |
| [`operator-plugin-registry-zh.md`](./operator-plugin-registry-zh.md) | `OperatorPluginRegistry`——已接线部分与剩余缺口 |
| [`operator-treeview-zh.md`](./operator-treeview-zh.md) | 侧边栏原生树视图、动作队列、可见性 |
| [`generated-files-specification-zh.md`](./generated-files-specification-zh.md) | 磁盘上与扩展存储中的文件 |
| [`new-project-generation-specification-zh.md`](./new-project-generation-specification-zh.md) | New Project webview 与脚手架 |

## msdebug

| 文档 | 用途 |
|----------|---------|
| [`msdebug-plugin-connection-zh.md`](./msdebug-plugin-connection-zh.md) | 终端 `msdebug` 与 OP DevTools + MindStudio Debug 扩展的关系 |
| [`msdebug-triton-e2e-zh.md`](./msdebug-triton-e2e-zh.md) | 确认 `msdebug` CLI 与 `msdebug-triton-npu` 一致性的手动检查清单 |
