#!/usr/bin/env bash
# CLI baseline for Triton msdebug — run on NPU host with CANN/msdebug installed.
# Usage: ./scripts/triton-msdebug-cli-baseline.sh <project_dir> [script.py]
set -euo pipefail

PROJECT_DIR="${1:?project directory required}"
SCRIPT="${2:-}"

cd "$PROJECT_DIR"

if [[ -z "$SCRIPT" ]]; then
  SCRIPT="$(find . -maxdepth 2 -name '*.py' ! -path './.venv/*' | head -1)"
fi

if [[ -z "$SCRIPT" || ! -f "$SCRIPT" ]]; then
  echo "error: no python script found (pass script.py as second argument)" >&2
  exit 1
fi

if [[ -z "${ASCEND_TOOLKIT_HOME:-}" ]]; then
  echo "warning: ASCEND_TOOLKIT_HOME not set — source CANN set_env.sh first" >&2
fi

export TRITON_DISABLE_CACHE=1
export TRITON_DISABLE_LINE_INFO=false
export LLVM_EXTRACT_DI_LOCAL_VARIABLES=1

echo "==> Debug compile: python3 $SCRIPT"
python3 "$SCRIPT"

KERNEL="$(find "$HOME/.triton/cache" -type f \( -name '*.npubin' -o -name 'kernel.o' -o -name 'kernel_reloc.o' \) -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2- || true)"

if [[ -z "$KERNEL" ]]; then
  echo "error: no compiled Triton kernel (*.npubin or kernel.o) under ~/.triton/cache after compile" >&2
  exit 1
fi

export LAUNCH_KERNEL_PATH="$KERNEL"
PYTHON="$(command -v python3)"

echo "==> LAUNCH_KERNEL_PATH=$LAUNCH_KERNEL_PATH"
echo "==> python=$PYTHON"
echo "==> cwd=$(pwd)"
echo "==> Starting msdebug (set kernel breakpoint, then run): msdebug python3 $SCRIPT"
echo "    Record these values for IDE parity check in docs/msdebug-triton-e2e.md"

exec msdebug python3 "$SCRIPT"
