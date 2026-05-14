# Huawei OP DevTools

**Huawei OP DevTools（华为算子一站式开发工具）** 是面向昇腾算子开发的 Visual Studio Code 扩展：在编辑器内完成算子工程的编辑、编译、运行、调试、异常检测与性能调优等流程。

**使用指导：** <https://gitcode.com/org/cann/discussions/54>

**源码仓库：** <https://gitcode.com/mlh0101/mstt>

## 核心特性

- 在 VS Code 中一站式完成算子开发相关操作，贴合主流编辑器使用习惯。
- 简化工作流：编辑、编译、执行、调试与调优集中在一套界面中。
- 语法高亮与代码智能提示，降低开发与排错成本。
- 调试与调优支持精度对比、性能泳道及结果可视化。
- 支持本地开发环境；可与云端资源等多样化工程场景配合使用。
- 支持多种算子工程类型（含标准自定义、pyasc、Triton 等，随版本演进）。

## 系统要求

- **Visual Studio Code** 1.80 或更高版本（与扩展 `engines.vscode` 一致）。
- 算子编译、调试与调优依赖 **CANN / 昇腾** 等运行与工具链环境；具体版本与安装步骤请参考官方文档及团队提供的镜像或环境说明。

## 快速开始

1. 在 VS Code 扩展视图中安装 **Huawei OP DevTools**。
2. 按[使用指导](https://gitcode.com/org/cann/discussions/54)配置环境与算子工程。
3. 通过侧栏 **算子开发** 相关入口创建或打开工程，并按引导完成编译、调试或调优。

## 界面语言

扩展与 Web 界面支持 **简体中文（zh-cn）** 与 **英语**。文案随 VS Code 的显示语言切换：命令面板中执行 **Configure Display Language**，选择 **中文(简体)** 或 **English** 后重启 VS Code。详见 [Visual Studio Code 区域设置文档](https://code.visualstudio.com/docs/getstarted/locale)。

## 更新记录

各版本变更说明见 **[CHANGELOG.md](https://gitcode.com/mlh0101/mstt/blob/vscode_plugin/CHANGELOG.md)**。

## 参与扩展开发

从源码构建、调试与 Dev Container 说明见 **[CONTRIBUTING.md](https://gitcode.com/mlh0101/mstt/blob/vscode_plugin/CONTRIBUTING.md)**（该文件随 Git 仓库提供，一般不打包进 `.vsix`）。
