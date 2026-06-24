# msdebug CLI ↔ MindStudio Debug plugin connection

How terminal `msdebug python3 test.py` relates to OP DevTools + MindStudio Debug VS Code extension.

See also: [debug-integration.md](./debug-integration.md), [msdebug-triton-e2e.md](./msdebug-triton-e2e.md).

## Two front-ends, one backend

| Front-end | Binary | Used by |
|-----------|--------|---------|
| **msdebug** | `msdebug.bin` (lldb) | Terminal: `msdebug python3 test.py` |
| **msdebug-mi** | `msdebug-mi.bin` (lldb-mi) | MindStudio Debug VS Code (`type: msdebug-mi`) |

OP DevTools does **not** spawn `msdebug`. It patches `launch.json` and calls `vscode.debug.startDebugging`. The bundled **MindStudio Debug** extension spawns **`msdebug-mi`** with the same `liblldb` / `MS_DEBUGGER` backend.

## CLI: `msdebug python3 test.py`

1. Wrapper `msdebug_script.sh` → `msdebug.bin`
2. Positional args → `target create "python3"` + `settings set target.run-args "test.py"`
3. Export `LAUNCH_KERNEL_PATH=/path/to/kernel` (compiled kernel ELF — Triton 3.5+ `*.npubin` or legacy `kernel.o`; msdebug is extension-agnostic)
4. Set breakpoints on kernel source, `r` to run
5. Host python launches with `LD_PRELOAD=libruntime_stub.so`; stub hooks `rtKernelLaunch*` → lldb-server → NPU kernel

**msdebug repo:** `lldb/tools/driver/Driver.cpp`, `lldb/source/Target/Target.cpp` (`LAUNCH_KERNEL_PATH`), `lldb/tools/msdebug/runtime_stub.cpp`.

## IDE: launch.json → msdebug-mi

| launch.json | CLI equivalent |
|-------------|----------------|
| `target` | `target create` (absolute python path) |
| `targetArgs` | `run <args>` at `configurationDone` |
| `cwd` | inferior working directory |
| `environment` | `export` (include `LAUNCH_KERNEL_PATH`) |
| `environmentScripts` | `<ide>/.env` from CANN `set_env.sh` |
| `msdebugMiPath` | omitted → `$ASCEND_TOOLKIT_HOME/tools/msdebug/bin/msdebug-mi`; `/usr/bin/gdb` → CPU |

MindStudio Debug (`msdebug_session.ts`):

1. `processEnv()` merges env + scripts
2. `ChildProcess.spawn(msdebug-mi, { env, cwd })`
3. `file-exec-and-symbols <target>`
4. `configurationDone` → `execRun()` → `run <targetArgs>`

## Triton mapping (OP DevTools)

| CLI | OP DevTools |
|-----|-------------|
| `export LAUNCH_KERNEL_PATH=…` | Patched into `launch.json` `environment` (sidecar or heuristic) |
| `msdebug python3 ./op.py` | `msdebug-triton-npu` with `target` + `targetArgs` |
| CANN env | `environmentScripts` → `<ide>/.env` |
| Kernel breakpoints on `.cce` | `files.associations`: `*.cce` → `cpp` in `<ide>/settings.json` |

Config name: `msdebug-triton-npu` (NPU only; no Triton CPU debug path).

## Key source files

| Component | Path |
|-----------|------|
| OP DevTools orchestration | `plugin/src/controller/task-controller.ts` |
| Launch templates | `plugin/src/domain/utils/debug-launch.json` |
| Kernel path | `plugin/src/domain/utils/triton-kernel-path.ts` |
