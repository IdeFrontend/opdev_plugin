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

NPU execution depends on `torch_npu`, a sourced CANN environment (`project.ascend_env_script`), and hardware/driver support. The extension runs `python3 ./<op>.py` directly; simulate/on-board profiler flows are **not** enabled for Triton project type in the plugin today.

## Next steps

Build, run, and debug from your project scripts as usual. Extend scripts or workspace config if you add profiling or deployment wrappers for your CANN release.
