# Triton vector-add operator

Minimal layout: one Python entry file plus this README.

## Contents

- `triton_vector_add.py` — small `@triton.jit` vector-add example using `torch` tensors on CPU or NPU.

## Run

From the operator project directory:

```bash
python3 ./<your_operator>.py
```

Install Triton (and PyTorch) for your environment before running.

## A4 / A5 and Ascend env templates

NPU execution depends on `torch_npu`, a sourced CANN environment (`project.ascend_env_script`), and hardware/driver support. The extension runs `python3 ./<op>.py` directly.

## Performance tuning (仿真 / 上板)

From the Operate panel, use **仿真分析** or **上板分析** to run `msprof` on your Python entry (requires Triton-Ascend, msprof on `PATH`, and a sourced CANN environment). Open the `.py` file you want to profile before starting analysis — the plugin uses the active file as the msprof target (same pattern as PyAsc).

On-board Triton profiling is validated upstream in msprof; simulator + Triton should be validated on your target SOC before relying on it in production workflows.

## Sanitizer (异常检测)

From the Operate panel, use **异常检测** to run `mssanitizer` on your Python entry (requires Triton-Ascend, msSanitizer on `PATH`, and a sourced CANN environment). Open the `.py` file you want to check before starting detection.

When you start detection, the extension automatically sets the required Triton sanitizer environment variables — `TRITON_ENABLE_SANITIZER=1` (JIT sanitizer instrumentation), `TRITON_ALWAYS_COMPILE=1` (force kernel recompile), and `PYTORCH_NO_NPU_MEMORY_CACHING=1` (disable the PyTorch NPU memory pool) — so you do not need to export them yourself.

## Next steps

Build, run, and debug from your project scripts as usual. Extend scripts or workspace config if you add profiling or deployment wrappers for your CANN release.
