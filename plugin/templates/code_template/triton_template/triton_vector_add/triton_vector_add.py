# Copyright (c) 2026 Huawei Technologies Co., Ltd.
# This program is free software, you can redistribute it and/or modify it under the terms and conditions of
# CANN Open Software License Agreement Version 2.0 (the "License").
# Please refer to the License for details. You may not use this file except in compliance with the License.
# THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
# INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
# See LICENSE in the root of the software repository for the full text of the License.

"""Minimal Triton vector-add example: fused add kernel, launch helper, and a small CLI driver."""

import argparse
import logging

import torch
try:
    import torch_npu  # noqa: F401
except ModuleNotFoundError:
    pass
import triton
import triton.language as tl

BLOCK_SIZE = 256
DEFAULT_SIZE = 8 * 2048

logging.basicConfig(level=logging.INFO)


@triton.jit
def add_kernel(x_ptr, y_ptr, out_ptr, n_elements, BLOCK_SIZE: tl.constexpr):
    pid = tl.program_id(axis=0)
    block_start = pid * BLOCK_SIZE
    offsets = block_start + tl.arange(0, BLOCK_SIZE)
    mask = offsets < n_elements
    x = tl.load(x_ptr + offsets, mask=mask, other=0.0)
    y = tl.load(y_ptr + offsets, mask=mask, other=0.0)
    tl.store(out_ptr + offsets, x + y, mask=mask)


def add_launch(x: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
    n = x.numel()
    out = torch.empty_like(x)
    grid = lambda meta: (triton.cdiv(n, meta["BLOCK_SIZE"]),)
    add_kernel[grid](x, y, out, n, BLOCK_SIZE=BLOCK_SIZE)
    if x.device.type == "npu":
        torch.npu.synchronize()
    return out


def __MSTT_OP_NAME__(device: str, size: int) -> None:
    x = torch.rand(size, dtype=torch.float32, device=device)
    y = torch.rand(size, dtype=torch.float32, device=device)
    out = add_launch(x, y)
    ref = x + y
    max_diff = (out - ref).abs().max().item()
    grid_size = triton.cdiv(size, BLOCK_SIZE)
    if not torch.allclose(out, ref, rtol=1e-2, atol=1e-2):
        raise AssertionError(
            f"__MSTT_OP_NAME__: result mismatch | device={device} | size={size} | max_diff={max_diff:.3e}"
        )
    logging.info(
        "__MSTT_OP_NAME__: OK | device=%s | dtype=%s | n=%d | block_size=%d | grid=%d | max_diff=%.3e",
        device,
        x.dtype,
        size,
        BLOCK_SIZE,
        grid_size,
        max_diff,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "-d",
        "--device",
        type=str,
        default=None,
        choices=["cpu", "npu"],
        help="device to run (default: auto-detect npu then cpu)",
    )
    parser.add_argument(
        "-n",
        "--size",
        type=int,
        default=DEFAULT_SIZE,
        help="number of elements to process",
    )
    args = parser.parse_args()

    if args.device is not None:
        device = args.device
    else:
        device = "npu" if hasattr(torch, "npu") and torch.npu.is_available() else "cpu"

    logging.info("[INFO] start process sample add.")
    __MSTT_OP_NAME__(device, args.size)
    logging.info("[INFO] Sample add run success.")
