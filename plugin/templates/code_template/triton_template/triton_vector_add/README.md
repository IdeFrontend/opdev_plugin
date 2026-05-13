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

## Next steps

Build, run, and debug from your project scripts as usual. Sanitizer, simulation, and on-device flows still need a toolchain-specific setup—extend scripts or config when you add profiling or deployment wrappers.
