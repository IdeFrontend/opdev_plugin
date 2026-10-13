#!/bin/bash
# ----------------------------------------------------------------------------
#
# Copyright (c) 2025 Huawei Technologies Co., Ltd.
# This program is free software, you can redistribute it and/or modify it under the terms and conditions of
# CANN Open Software License Agreement Version 2.0 (the "License").
# Please refer to the License for details. You may not use this file except in compliance with the License.
# THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
# INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
# See LICENSE in the root of the software repository for the full text of the License.
#
# ----------------------------------------------------------------------------
# Snippet for ops-math / standard-custom repos: install .run package after build.sh --pkg.
# Copy deploy_run_package() into your repository build.sh and call it when --pkg completes.
#
# See docs/user-issues/standard-custom-workflow.md (Option A).

deploy_run_package() {
  local build_out="${BUILD_OUT_DIR:-build_out}"
  local run_file
  run_file=$(find "$build_out" -maxdepth 1 -name '*.run' | head -1)
  if [[ -z "$run_file" ]]; then
    echo "error: no .run package under $build_out" >&2
    return 1
  fi
  chmod +x "$run_file"
  if [[ "${DEPLOY_FORCE:-0}" == "1" ]] || [[ " $* " == *" --force "* ]]; then
    "$run_file" --force
  else
    "$run_file"
  fi
}
