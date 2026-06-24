# Triton msdebug E2E validation (NPU hardware)

Manual checklist to confirm `msdebug python3` CLI parity with OP DevTools `msdebug-triton-npu`.

Prerequisites: CANN toolkit sourced, NPU driver, `msdebug` + `msdebug-mi` on PATH, `op-devtools.operatorSupport.triton=true`, `op-devtools.debugMode=true`.

## 1. CLI baseline

Use the helper script or run manually from the operator directory after a debug compile:

```bash
# From repository root (adjust paths):
./scripts/triton-msdebug-cli-baseline.sh /path/to/triton/project ./vector_add.py
```

Manual equivalent:

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

**Pass:** Kernel breakpoint hits; NPU debug session stops in generated kernel source.

Record for IDE comparison:

- `LAUNCH_KERNEL_PATH` value
- Absolute `python3` path (`which python3`)
- Operator `cwd`
- Kernel breakpoint file:line

## 2. IDE parity (OP DevTools)

1. Open the same Triton project in VS Code with OP DevTools.
2. Open the operator `.py` file.
3. Actions → **NPU Debug**.
4. After session starts, open `<workspace>/.vscode/launch.json` (or `.arts/launch.json`).

**Verify patched `msdebug-triton-npu` config:**

| Field | Should match CLI baseline |
|-------|---------------------------|
| `target` | Same absolute python |
| `targetArgs` | `["./vector_add.py"]` (active script) |
| `cwd` | Operator directory |
| `environment` → `LAUNCH_KERNEL_PATH` | Same kernel ELF path as CLI (`*.npubin` or `.o`; or sidecar `<ide>/.triton_launch_kernel_path`) |
| `environmentScripts` | Points at `<ide>/.env` with CANN vars |

Optional: add to launch.json for adapter tracing:

```json
"printMiInput": true,
"printMiOutput": true
```

Expect MI sequence: `file-exec-and-symbols "<python>"`, then `run ./vector_add.py`.

**Pass:** Same breakpoint behavior as CLI baseline.

## 3. Diff when IDE fails but CLI works

1. Compare full spawn env: terminal `env` vs contents of `<ide>/.env` + `launch.json` `environment`.
2. Confirm MindStudio Debug extension active (`ascend.mindstudio-debug-vscode-plugin`).
3. Confirm `msdebug-mi` path: `$ASCEND_TOOLKIT_HOME/tools/msdebug/bin/msdebug-mi`.
4. Check `/dev/drv_debug` and CANN HDK debug channel on the host.

## 4. Multi-kernel workspace

If heuristic `LAUNCH_KERNEL_PATH` picks the wrong kernel artifact:

1. Set `LAUNCH_KERNEL_PATH` manually in launch.json, or
2. Ensure debug pre-build wrote `<ide>/.triton_launch_kernel_path` with the correct path.

## 5. CPU debug

Triton operators do not support CPU debug in OP DevTools (`supportsCpuDebug: false`). Use NPU debug (`msdebug-triton-npu`) for kernel debugging via `LAUNCH_KERNEL_PATH`.
