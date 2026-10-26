# msdebug CLI ↔ MindStudio Debug 插件的连接关系

终端中的 `msdebug python3 test.py` 与 OP DevTools + MindStudio Debug VS Code 扩展的关系（扩展版本 **1.4.6**；webview↔plugin RPC 面共 **37 个端点**——webview 9 / common 10 / ops 17 / performance 1）。

另见：[debug-integration-zh.md](./debug-integration-zh.md)、[msdebug-triton-e2e-zh.md](./msdebug-triton-e2e-zh.md)。

## 两个前端，一个后端

| 前端 | 二进制 | 使用方 |
|-----------|--------|---------|
| **msdebug** | `msdebug.bin`（lldb） | 终端：`msdebug python3 test.py` |
| **msdebug-mi** | `msdebug-mi.bin`（lldb-mi） | MindStudio Debug VS Code（`type: msdebug-mi`） |

OP DevTools **不会**派生 `msdebug`。它修补 `launch.json` 并调用 `vscode.debug.startDebugging`。随附的 **MindStudio Debug** 扩展以相同的 `liblldb` / `MS_DEBUGGER` 后端派生 **`msdebug-mi`**。

## CLI：`msdebug python3 test.py`

1. 包装脚本 `msdebug_script.sh` → `msdebug.bin`
2. 位置参数 → `target create "python3"` + `settings set target.run-args "test.py"`
3. 导出 `LAUNCH_KERNEL_PATH=/path/to/kernel`（编译出的内核 ELF——Triton 3.5+ 为 `*.npubin` 或 `kernel.o`；msdebug 不区分扩展名）
4. 在内核源码上设置断点，`r` 运行
5. 宿主 python 以 `LD_PRELOAD=libruntime_stub.so` 启动；stub 挂钩 `rtKernelLaunch*` → lldb-server → NPU 内核

**msdebug 仓库：** `lldb/tools/driver/Driver.cpp`、`lldb/source/Target/Target.cpp`（`LAUNCH_KERNEL_PATH`）、`lldb/tools/msdebug/runtime_stub.cpp`。

## IDE：launch.json → msdebug-mi

| launch.json | CLI 等效 |
|-------------|----------------|
| `target` | `target create`（python 绝对路径） |
| `targetArgs` | `configurationDone` 时的 `run <args>` |
| `cwd` | 被调试进程工作目录 |
| `environment` | `export`（包含 `LAUNCH_KERNEL_PATH`） |
| `environmentScripts` | 由 CANN `set_env.sh` 生成的 `<ide>/.env` |
| `msdebugMiPath` | 省略 → `$ASCEND_TOOLKIT_HOME/tools/msdebug/bin/msdebug-mi`；`/usr/bin/gdb` → CPU |

MindStudio Debug（`msdebug_session.ts`）：

1. `processEnv()` 合并环境变量 + 脚本
2. `ChildProcess.spawn(msdebug-mi, { env, cwd })`
3. `file-exec-and-symbols <target>`
4. `configurationDone` → `execRun()` → `run <targetArgs>`

## Triton 映射（OP DevTools）

| CLI | OP DevTools |
|-----|-------------|
| `export LAUNCH_KERNEL_PATH=…` | 修补进 `launch.json` 的 `environment`（旁车文件或启发式） |
| `msdebug python3 ./op.py` | `msdebug-triton-npu`，带 `target` + `targetArgs` |
| CANN 环境 | `environmentScripts` → `<ide>/.env` |
| `.cce`/`.asc` 上的内核断点 | `files.associations`：当尚未配置时，在 `<ide>/settings.json` 中将 `*.cce`/`*.asc` -> `cpp` |

配置名：`msdebug-triton-npu`（仅 NPU；无 Triton CPU 调试路径）。

## 关键源文件

| 组件 | 路径 |
|-----------|------|
| OP DevTools 编排 | `plugin/src/controller/task-controller.ts` |
| 启动配置模板 | `plugin/src/domain/utils/debug-launch.json` |
| 内核路径 | `plugin/src/domain/utils/triton-kernel-path.ts` |
