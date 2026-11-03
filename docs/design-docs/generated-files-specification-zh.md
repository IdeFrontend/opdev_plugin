# 插件生成文件规范（`plugin/src`）

## 范围

本规范列出由插件创建、更新或删除的文件和目录，并说明：

- 用途，
- 生命周期条件（创建/更新/删除），
- 每个产物如何被插件行为消费。

范围覆盖 `plugin/src` 中的运行时行为，包括工作区本地产物以及环境/工具链路径。

## 存储区域

- **算子工作区**：在已打开的算子项目中创建的文件（位于 IDE 配置目录内——VS Code 为 `.vscode`，CodeArts 为 `.arts`——除非另有说明）。
- **环境/工具链路径**：为插件安装或导出/下载流程创建的文件。

---

## A）工作区产物（算子项目内部）

## `.vscode/devtool_config.json`

- **用途**：标记/配置文件，表示项目已完成算子工具链初始化。
- **创建时机**：`ensureLaunchJsonExists(op_path, ...)` 运行且文件不存在时。
- **更新时机**：创建后插件逻辑不再主动更新（除非被外部修改）。
- **删除时机**：正常插件流程不会删除。
- **使用方**：
  - 启动检查，用于切换 UI 行为（`hasDevtoolConfig` 上下文），
  - 项目发现扫描，查找已初始化的算子子项目，
  - `getProjectByPath` 中的项目识别（算子项目标记之一）。

## `.vscode/cache.json`

- **用途**：每个工作区的运行时状态——已选/已编译算子路径、按文件夹的扫描状态、文件映射列表，以及每个算子的 sanitizer Python 目标。
- **创建时机**：首次 `updateWorkspaceCache` 写入（项目打开 / 注册 / 扫描）。
- **更新时机**：文件夹扫描、文件映射列表、sanitizer Python 目标、已选/已编译算子状态变化时。
- **损坏处理**：损坏或无法解析的 `cache.json` 在读取时被重命名为 `cache.json.bak`，下一个写入者从全新对象开始。读取从不创建该文件；写入者总是会创建（缺失的缓存会被创建，绝不会被跳过）。
- **使用方**：
  - 各分区 DAO 工厂——`getSimulateConfig(projectPath)` / `getOnBoardConfig(projectPath)` / `getSanitizerConfig(projectPath, op)`（仅数据库字段：`fileMapLists[configType]` → `fileMapList`，`sanitizerPythonTarget[op]` → `target_file`），
  - `getProjectByPath` / `WorkspaceDetectorService`（`folders[rootKey]` 下的标准自定义扫描状态），
  - `resolveOpRecord`（合成的算子记录；附带的 `opType` 决定命令策略——标准自定义集合的子算子为 `'cann'`，插件创建的算子为 `'ascend'`；没有 `opType` 的扫描条目对标准自定义集合回退为 `'cann'`）。
- **模式**（`plugin/src/helpers/workspace-cache.ts`，`CACHE_SCHEMA_VERSION = 1`）：

```json
{
  "schemaVersion": 1,
  "project": { "selectedOperatorPaths": [], "compiledOpPaths": {} },
  "folders": {
    "<normalized-root-path>": {
      "opsMeet": [], "opsList": [], "experimentalOpsList": []
    }
  },
  "fileMapLists": { "sanitizer": [], "simulate": [], "on_board": [] },
  "sanitizerPythonTarget": {}
}
```

`isCompiled` 具有粘性（合并时在多次扫描间保留）；当算子类型已知时会附带 `opType`。

## `.vscode/settings.json`（`op-devtools.*`）

- **用途**：权威运行时配置——编译/部署脚本、选项、项目类型、环境脚本（[`workspace-settings.md`](./workspace-settings-zh.md)）。
- **创建时机**：`ensureOpDevtoolsSettingsSeeded` / 首次设置写入。
- **更新时机**：用户在设置 UI 中编辑、选项面板写入（`writeOpDevtoolsDottedSettings`）、项目类型检测。
- **删除时机**：正常插件流程不会删除。
- **使用方**：各分区 DAO 工厂（各自直接读取自己的点分键）；`getProjectByPath` 通过内部 `op-devtools.projectType` 键（未在 `package.json` 中声明）进行项目识别。
- **写语义**：容忍 JSONC 的读取（BOM、注释、尾逗号）；无法解析的文件绝不会被覆盖；原子临时文件+重命名；按路径串行化队列；内容差异守卫（字节完全相同的写入为空操作）；嵌套的 `"op-devtools": { … }` 对象在写入时会被展平为点分键。

## `.vscode/launch.json`

- **用途**：调试启动配置（如 CPU/NPU 调试）。
- **创建时机**：
  - `ensureLaunchJsonExists` 运行，
  - `.vscode/devtool_config.json` 尚**不**存在，
  - 且 `launch.json` 缺失。
- **更新时机**：通常是用户手动/调试配置编辑；插件不会持续重写它。
- **删除时机**：正常插件流程不会删除。
- **使用方**：
  - `taskMethods.runDebug()` / `runCpuDebug()` 通过命名调试配置启动，
  - `debugConfig` 命令打开启动配置。
- **IDE 配置目录**：该文件位于当前 IDE 配置目录——VS Code 为 `.vscode`，CodeArts 为 `.arts`（`getIdeConfigDirName()`）；只创建其中一个，不存在镜像副本。

## `<ideConfig>/.env`

- **用途**：环境变量快照，作为运行时环境读取的回退来源。
- **创建时机**：
  - `exportEnvToFile` 在启动/配置初始化期间执行 `env > ./<ideConfig>/.env`，
  - 且仅在 `.vscode/devtool_config.json` 不存在的分支上（因为已存在的 `devtool_config.json` 会使 `ensureLaunchJsonExists` 提前返回）。
- **更新时机**：重新初始化路径重新运行导出命令时。
- **删除时机**：正常插件流程不会删除。
- **使用方**：
  - 当 `process.env` 未提供所需值时，`EnvironmentVariableReader` 的回退读取，
  - 需要环境上下文的 insight/性能分析辅助逻辑。

## `build/` 目录（项目根）

- **用途**：早期初始化的构建输出/工作目录。
- **创建时机**：
  - `exportEnvToFile` 运行 `mkdir build`，
  - 且仅在 `.vscode/devtool_config.json` 不存在的分支上（与上述提前返回条件相同）。
- **更新时机**：构建命令在其中产生/修改产物时。
- **删除时机**：插件运行时逻辑不会删除。
- **使用方**：
  - 编译/运行流水线以及策略生成的进入构建目录的命令。

## `<workspaceRoot>/<ideConfig>/mindstudio_sanitizer_log/*.log`

（`<ideConfig>` 为 `.vscode` 或 `.arts`——见 `getIdeConfigDirName()`；该目录位于**工作区根**下——每个策略（cann / ascend / triton）都把 `--log-file` 写到这里，读取器也只扫描该目录。）

- **用途**：sanitizer 报告日志——`mssanitizer_<timestamp>.log`（mssanitizer）和 `npu-check_<timestamp>.log`（npu-check）。
- **创建时机**：sanitizer 服务预先创建该目录，sanitizer 运行写入其生成的 `--log-file` 路径（远程运行会把该目录拉回）。
- **更新时机**：每次 sanitizer 执行生成一个新的日志文件。
- **删除时机**：正常流程中插件不自动删除。
- **使用方**：
  - 运行数据列表收集（`RunDataService.getSanitizerRunData`），
  - 原生结果树 `opdevtoolsSanitizerResultsTree` 和 Problems 诊断（`SanitizerDiagnosticsService`）。

---

## B）环境相关的安装程序/生成产物

这些由插件安装流程生成，可能位于算子工作区之外。

## Code-server / CodeArts 扩展安装文件

- **路径**：
  - `~/.codearts-server/extensions/<pluginId>-<version>/...`（首选），
  - 回退 `~/.local/share/code-server/extensions/<pluginId>-<version>/...`，
  - 同一 extensions 目录中的 `extensions.json`。
- **用途**：解包并注册内置的调试扩展 VSIX。
- **创建时机**：
  - 插件未激活且环境被检测为 code-server/CodeArts 时。
- **更新时机**：
  - `extensions.json` 追加扩展元数据条目时。
- **删除时机**：
  - 临时解压目录在解压完成后立即删除；
  - 已安装的扩展目录不会被正常插件流程移除。
- **使用方**：
  - 在基于服务器的 IDE 环境中启用调试扩展的可用性。

## 临时解压目录（`temp-unzip-<timestamp>`）

- **用途**：临时的 VSIX 解压工作区。
- **创建时机**：code-server/CodeArts 安装流程解包 VSIX 时。
- **更新时机**：解压/复制期间。
- **删除时机**：通过 `fs.rmSync(..., { recursive: true, force: true })` 显式移除。
- **使用方**：仅作为中间步骤；安装复制完成后不再使用。

## `.devcontainer/devcontainer.json`（web Codespaces 流程）

- **用途**：在 devcontainer 配置中添加所需的调试扩展。
- **创建时机**：web IDE 被检测为 Codespaces 且文件尚未引用插件 ID 时。
- **更新时机**：需要时生成流程可重写该文件。
- **删除时机**：插件不会删除。
- **使用方**：环境引导，使扩展在 devcontainer 会话中被安装。

## `.gitpod.yml`（web Gitpod 流程）

- **用途**：为 Gitpod 声明所需的 VS Code 扩展。
- **创建时机**：web IDE 被检测为 Gitpod 且文件尚未包含插件 ID 时。
- **更新时机**：生成流程写入插件扩展条目时。
- **删除时机**：插件不会删除。
- **使用方**：Gitpod 工作区的扩展自动安装行为。

---

## C）用户触发的导出/下载临时产物

## `<directory>.zip` 临时归档（桌面保存流程）

- **用途**：通过文件服务导出目录时的临时归档。
- **创建时机**：`FileService.saveFileToLocalDesktop` 压缩所选目录时。
- **更新时机**：每次导出操作生成一次。
- **删除时机**：复制到用户选择的保存路径后删除。
- **使用方**：仅用于本地下载/导出 UX。

## 用户选择的下载输出文件

- **用途**：显式的用户导出目标（性能分析/文件下载）。
- **创建时机**：用户在下载/保存对话框中确认保存位置时。
- **更新时机**：用户允许且目标已存在时覆盖。
- **删除时机**：插件不自动删除。
- **使用方**：在插件运行时之外；由用户消费的输出。

---

## 文件模式

## `.vscode/devtool_config.json`

- **格式**：JSON 对象。
- **模式**：

```json
{
  "type": "string"
}
```

- **当前写入者行为**：写入 `{ "type": create_by || "1" }`。

## `.vscode/launch.json`（CodeArts 中为 `.arts/launch.json`）

- **格式**：JSON 对象（VS Code launch 模式）。
- **模式**（插件层级的预期）：

```json
{
  "version": "string",
  "configurations": [
    {
      "name": "string",
      "type": "string",
      "request": "launch|attach",
      "...": "other debugger-specific fields"
    }
  ]
}
```

- **当前写入者行为**：复制内置的 `debug-launch.json` 内容，然后向 `remote-debug` 配置注入 `host` / `remoteWorkspaceFolder`。

## `<ideConfig>/.env`

- **格式**：由 `env` 生成的类 dotenv 纯文本。
- **模式**：每行一个变量。

```text
KEY=value
ANOTHER_KEY=value
...
```

## `<workspaceRoot>/<ideConfig>/mindstudio_sanitizer_log/*.log`

- **文件名模式**：

```text
mssanitizer_<timestamp>.log
npu-check_<timestamp>.log
```

- **内容模式**：工具原生的 mssanitizer / npu-check 输出（非结构化文本日志）。

## `extensions.json`（Code-server/CodeArts extensions 目录）

- **格式**：JSON 数组。
- **模式**：

```json
[
  {
    "identifier": { "id": "string" },
    "version": "string",
    "location": {
      "$mid": 1,
      "fsPath": "string",
      "external": "file:// URL string",
      "path": "string",
      "scheme": "file"
    },
    "relativeLocation": "string",
    "metadata": {
      "installedTimestamp": "number",
      "pinned": "boolean",
      "source": "vsix"
    }
  }
]
```

## `~/.codearts-server/extensions/<pluginId>-<version>/...` 及回退的 code-server 扩展目录

- **格式**：解压后的 VSIX 扩展目录树。
- **模式**：VS Code 扩展包布局（如 `package.json`、扩展运行时文件、资源）。

## `.devcontainer/devcontainer.json`

- **格式**：JSON 对象。
- **模式**（生成的形态）：

```json
{
  "name": "MindStudio Dev",
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "customizations": {
    "vscode": {
      "extensions": ["ascend.mindstudio-debug-vscode-plugin"]
    }
  }
}
```

## `.gitpod.yml`

- **格式**：YAML 文档。
- **模式**（生成的形态）：

```yaml
image: gitpod/workspace-full
vscode:
  extensions:
    - ascend.mindstudio-debug-vscode-plugin
```

## `<directory>.zip` 临时归档

- **格式**：ZIP 文件。
- **模式**：标准 ZIP 中央目录格式，包含所选目录的递归快照。

## 用户选择的下载输出文件

- **格式/模式**：镜像被导出的来源（文件副本或生成的 zip），因此模式取决于来源。

---

## 生命周期与使用说明

- 大多数生成的状态是**追加/就地更新**，而非删除/重建。
- 正常运行时**不会**自动清理历史 JSON/日志产物。
- 显式删除主要是：
  - 测试重置辅助函数（`_reset*ForTest`），
  - 临时安装/导出中间产物。
- 许多生成文件被有意设计为幂等：已存在时跳过创建。

## 源码索引

- `plugin/src/domain/utils/project-utils.ts` — `ensureLaunchJsonExists`（devtool_config.json、launch.json、`.env`、`build/`）
- `plugin/src/domain/models/project-model.ts` — `getProjectByPath` 项目识别
- `plugin/src/domain/models/op-record.ts` — `resolveOpRecord`（缓存扫描状态 → 算子记录）
- `plugin/src/service/build-service.ts`
- `plugin/src/service/sanitizer-service.ts`
- `plugin/src/service/run-data-service.ts`
- `plugin/src/service/folder-context-menu-service.ts`
- `plugin/src/service/file-service.ts`
- `plugin/src/service/config-service.ts` — 设置写入、运行时合并、各分区 DAO 工厂
- `plugin/src/helpers/workspace-cache.ts` — `.vscode/cache.json` 读取/更新（损坏时重命名为 `.bak`）
- `plugin/src/helpers/ide-config-dir.ts` — `.vscode` 与 `.arts` 的解析
- `plugin/src/helpers/ide-settings-persist.ts` — 受保护的 `settings.json` 写入
- `plugin/src/class/environment-variable-reader.ts` — `<ideConfig>/.env` 回退读取
- `plugin/src/class/mind-studio-plugin-installer.ts`
