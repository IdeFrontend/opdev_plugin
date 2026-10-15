# Huawei OP DevTools

**Huawei OP DevTools（华为算子一站式开发工具）** 是面向 Ascend 算子开发的 Visual Studio Code 扩展，支持在编辑器内完成算子工程创建、编译部署、运行验证、CPU/NPU 调试、异常检测、性能调优和结果可视化。

**使用指导：** <https://gitcode.com/opdevtools/plugin_release>

**问题反馈：** <https://gitcode.com/opdevtools/plugin_release/issues>

## 核心特性

- 在 VS Code 中一站式完成算子开发相关操作，贴合主流编辑器使用习惯。
- 支持编译部署、运行验证、CPU/NPU 调试、Sanitizer 异常检测、上板分析、仿真分析、dumptensor、UT等。
- 自动处理常用环境变量、SoC / NPU_ARCH 设置、`.asc` 文件高亮和调试配置。
- 通过原生侧边栏展示算子列表、操作入口、异常检测结果和性能结果。

## 系统要求

- Visual Studio Code 1.80 或更高版本。
- CANN / Ascend 工具链和运行环境。具体版本与镜像以团队或官方环境说明为准。
- 远程开发建议安装 Remote SSH。环境中没有任何 C/C++ 语言扩展时，插件会提示安装 Microsoft C/C++ 扩展（可选择不再提示）；CANN 头文件路径由插件在运行时自动解析。

## 快速开始

1. 在 VS Code 扩展视图中安装 **Huawei OP DevTools**。
2. 打开算子仓库或用于创建工程的工作区。
3. 在 **算子一站式开发平台操作面板** 中选择 **新建算子工程** 或 **打开算子工程**。
4. 新建工程时选择模板、工程目录、工程名称和打开方式。选择 **在本窗口打开** 时会复用当前窗口。
5. 打开已有工程后，在 **算子** 视图选择需要操作的算子，再在 **操作** 视图执行编译、运行、调试、异常检测或性能调优。

## 标准自定义算子仓

对于 `ops-nn` / `ops-math` 这类标准自定义算子仓，建议直接打开仓库根目录，然后在 **算子** 视图中选择目标算子。

- 文档示例统一使用 `ops-nn` 场景；如果你的仓库是 `ops-math`，请按实际目录名称替换，不要混用截图或路径。
- `experimental/` 下的算子会自动携带 `--experimental`。
- 上板分析、仿真分析和异常检测会根据构建出的 example 目标选择运行文件，不再固定为 `test_${算子名}`。
- 如果工作区没有显式设置 `op-devtools.environment.socVersion`，插件会从项目、环境变量或主机检测解析；无法解析时会提示先设置 SoC 并重新执行命令。

## 创建算子与创建工程

右键菜单中的 **在当前目录下新建算子** 会打开同一个新建工程面板，并自动填入当前目录作为目标路径。这是当前统一入口；请在面板中确认模板、工程名称和路径后生成。

旧文档中描述的中间选择页和部分截图已经过期；以当前扩展面板实际展示为准。

## 配置与结果

- 工作区设置集中在 `op-devtools.*`；源码仓中的 `docs/workspace-settings.md` 有补充说明。
- 编译、运行、调试和调优流程可参考源码仓中的 `docs/build-integration.md`、`docs/run-integration.md`、`docs/debug-integration.md` 和 `docs/performance.md`。
- Sanitizer 使用说明可参考源码仓中的 `docs/sanitizer.md`。

## 语言

扩展与 Web 界面支持 **简体中文（zh-cn）** 与 **English**。语言跟随 VS Code 显示语言；可在命令面板中执行 **Configure Display Language** 后重启 VS Code。
