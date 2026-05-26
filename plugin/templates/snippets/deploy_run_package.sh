#!/bin/bash
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
