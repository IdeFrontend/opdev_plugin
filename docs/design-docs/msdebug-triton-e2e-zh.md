# Triton msdebug 端到端验证（NPU 硬件）

确认 `msdebug python3` CLI 与 OP DevTools `msdebug-triton-npu` 一致性的手动检查清单（扩展版本 **1.4.6**）。

前提条件：已 source CANN 工具包、NPU 驱动就绪、`msdebug` + `msdebug-mi` 在 PATH 上、`op-devtools.operatorSupport.triton=true`、`op-devtools.debugMode=true`。

## 1. CLI 基线

在调试编译之后，使用辅助脚本或在算子目录中手动运行：

```bash
# From repository root (adjust paths):
./scripts/triton-msdebug-cli-baseline.sh /path/to/triton/project ./vector_add.py
```

手动等效命令：

```bash
cd /path/to/triton/project
source "$ASCEND_TOOLKIT_HOME/.../set_env.sh"
export TRITON_DISABLE_CACHE=1
export TRITON_DISABLE_LINE_INFO=false
export LLVM_EXTRACT_DI_LOCAL_VARIABLES=1
python3 ./vector_add.py   # compile kernel to ~/.triton/cache

export LAUNCH_KERNEL_PATH="$(find "$HOME/.triton/cache" -type f \( -name '*.npubin' -o -name 'kernel.o' -o -name 'kernel_reloc.o' \) -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)"
msdebug python3 ./vector_add.py
# (msdebug) b <kernel_source>:<line>
# (msdebug) r
```

**通过标准：** 内核断点命中；NPU 调试会话停在生成的内核源码中。

为 IDE 对比记录：

- `LAUNCH_KERNEL_PATH` 取值
- `python3` 绝对路径（`which python3`）
- 算子 `cwd`
- 内核断点文件:行号

## 2. IDE 一致性（OP DevTools）

1. 在装有 OP DevTools 的 VS Code 中打开同一个 Triton 项目。
2. 打开算子 `.py` 文件。
3. Actions → **NPU Debug**。
4. 会话启动后，打开 `<workspace>/.vscode/launch.json`（或 `.arts/launch.json`）。

**核对已修补的 `msdebug-triton-npu` 配置：**

| 字段 | 应与 CLI 基线一致 |
|-------|---------------------------|
| `target` | 相同的 python 绝对路径 |
| `targetArgs` | `["./vector_add.py"]`（当前活动脚本） |
| `cwd` | 算子目录 |
| `environment` → `LAUNCH_KERNEL_PATH` | 与 CLI 相同内核 ELF 路径（`*.npubin` 或 `.o`；或旁车文件 `<ide>/.triton_launch_kernel_path`） |
| `environmentScripts` | 指向带 CANN 变量的 `<ide>/.env` |

可选：加入 launch.json 以进行适配器追踪：

```json
"printMiInput": true,
"printMiOutput": true
```

预期的 MI 序列：`file-exec-and-symbols "<python>"`，然后 `run ./vector_add.py`。

**通过标准：** 与 CLI 基线断点行为一致。

## 3. IDE 失败但 CLI 可用时的差异排查

1. 比对完整 spawn 环境：终端 `env` 与 `<ide>/.env` 内容 + `launch.json` 的 `environment`。
2. 确认 MindStudio Debug 扩展已激活（`ascend.mindstudio-debug-vscode-plugin`）。
3. 确认 `msdebug-mi` 路径：`$ASCEND_TOOLKIT_HOME/tools/msdebug/bin/msdebug-mi`。
4. 检查主机上的 `/dev/drv_debug` 与 CANN HDK 调试通道。

## 4. 多内核工作区

如果启发式 `LAUNCH_KERNEL_PATH` 选错了内核产物：

1. 在 launch.json 中手动设置 `LAUNCH_KERNEL_PATH`，或
2. 确保调试预编译写入了带正确路径的 `<ide>/.triton_launch_kernel_path`。

## 5. CPU 调试

Triton 算子在 OP DevTools 中不支持 CPU 调试（`supportsCpuDebug: false`）。请通过 `LAUNCH_KERNEL_PATH` 使用 NPU 调试（`msdebug-triton-npu`）进行内核调试。
