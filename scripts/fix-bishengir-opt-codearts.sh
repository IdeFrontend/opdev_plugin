#!/bin/bash
# Repair missing bishengir-opt on CodeArts 6430 (incomplete ascendnpu-ir install).
#
# Symptom: triton compile fails with FileNotFoundError: bishengir-opt
# Cause:   ascendnpu-ir metadata/symlinks exist but tools/bishengir/bin/bishengir-opt is absent.
#
# Installs ascendnpu-ir from CANN 9.0.0 package download (internet; no cross-container copy).
set -euo pipefail

PROXY_URL="${PROXY_URL:-http://10.198.126.40:3128}"
export HTTP_PROXY="${HTTP_PROXY:-${PROXY_URL}}"
export HTTPS_PROXY="${HTTPS_PROXY:-${PROXY_URL}}"
export http_proxy="${http_proxy:-${PROXY_URL}}"
export https_proxy="${https_proxy:-${PROXY_URL}}"

ASCEND_HOME="${ASCEND_HOME:-/home/developer/Ascend}"
CANN_ROOT="${CANN_ROOT:-${ASCEND_HOME}/cann-9.0.0}"
BISHENGIR_BIN="${CANN_ROOT}/tools/bishengir/bin"
DOWNLOAD_DIR="${DOWNLOAD_DIR:-/home/developer/cann-downloads}"
CANN_VERSION="${CANN_VERSION:-9.0.0}"
ASCENDNPU_IR_VERSION="${ASCENDNPU_IR_VERSION:-1.1.0}"
ARCH="$(uname -m)"
TOOLKIT_RUN="${DOWNLOAD_DIR}/Ascend-cann-toolkit_${CANN_VERSION}_linux-${ARCH}.run"
IR_RUN="${DOWNLOAD_DIR}/ascendnpu-ir_${ASCENDNPU_IR_VERSION}_linux-${ARCH}.run"
TOOLKIT_URL="${TOOLKIT_URL:-https://ascend-repo.obs.cn-east-2.myhuaweicloud.com/CANN/CANN%20${CANN_VERSION}/Ascend-cann-toolkit_${CANN_VERSION}_linux-${ARCH}.run}"
CURL_OPTS=(-fkSL --retry 3 --connect-timeout 30 --max-time 7200)
ENV_EXPORT="${ENV_EXPORT:-/etc/ascend-env.sh}"
ASCENDNPU_IR_SET_ENV="${CANN_ROOT}/share/info/ascendnpu-ir/bin/set_env.sh"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

bishengir_opt_ready() {
  [ -x "${BISHENGIR_BIN}/bishengir-opt" ] && command -v bishengir-opt >/dev/null 2>&1
}

ensure_ir_run() {
  if [ -f "${IR_RUN}" ]; then
    return 0
  fi

  if [ ! -f "${TOOLKIT_RUN}" ]; then
    echo "Downloading CANN toolkit to locate ascendnpu-ir package..."
    mkdir -p "${DOWNLOAD_DIR}"
    curl "${CURL_OPTS[@]}" \
      -H "Referer: https://www.hiascend.com/" \
      -o "${TOOLKIT_RUN}" \
      "${TOOLKIT_URL}"
    chmod +x "${TOOLKIT_RUN}"
  fi

  toolkit_extract="$(mktemp -d /tmp/cann-toolkit-XXXXXX)"
  "${TOOLKIT_RUN}" --noexec --extract="${toolkit_extract}" >/dev/null
  bundled_ir="$(find "${toolkit_extract}/run_package" -name 'ascendnpu-ir_*_linux-'"${ARCH}"'.run' | head -1)"
  [ -n "${bundled_ir}" ] || die "ascendnpu-ir package not found inside ${TOOLKIT_RUN}"
  mkdir -p "${DOWNLOAD_DIR}"
  cp -f "${bundled_ir}" "${IR_RUN}"
  chmod +x "${IR_RUN}"
  rm -rf "${toolkit_extract}"
}

echo "=== [0] Preflight ==="
echo "CANN_ROOT=${CANN_ROOT}"
echo "BISHENGIR_BIN=${BISHENGIR_BIN}"
echo "IR_RUN=${IR_RUN}"

if bishengir_opt_ready; then
  echo "bishengir-opt already present: $(command -v bishengir-opt)"
  exit 0
fi

if [ -L "${BISHENGIR_BIN}/bishengir-opt" ] || [ -f "${BISHENGIR_BIN}/bishengir-opt" ]; then
  echo "WARNING: bishengir-opt entry exists but is not executable/resolvable"
  ls -la "${BISHENGIR_BIN}/bishengir-opt" 2>&1 || true
fi

echo "=== [1] Ensure ascendnpu-ir installer ==="
ensure_ir_run
ls -lh "${IR_RUN}"

echo "=== [2] Install ascendnpu-ir into ${CANN_ROOT} ==="
if [ -f "${ASCENDNPU_IR_SET_ENV}" ]; then
  "${IR_RUN}" --upgrade --install --install-path="${CANN_ROOT}" 2>&1 | tail -20
else
  "${IR_RUN}" --install --install-path="${CANN_ROOT}" 2>&1 | tail -20
fi

export PATH="${BISHENGIR_BIN}:${PATH}"
if ! bishengir_opt_ready; then
  ls -la "${BISHENGIR_BIN}/" 2>&1 || true
  die "bishengir-opt still missing after ascendnpu-ir install"
fi
echo "bishengir-opt ready: $(command -v bishengir-opt)"

echo "=== [4] Patch ${ENV_EXPORT} to source ascendnpu-ir set_env ==="
if [ -f "${ASCENDNPU_IR_SET_ENV}" ]; then
  marker="# op-devtools-ascendnpu-ir"
  if ! grep -q "${marker}" "${ENV_EXPORT}" 2>/dev/null; then
    sudo tee -a "${ENV_EXPORT}" > /dev/null << EOF
${marker}
if [ -f ${ASCENDNPU_IR_SET_ENV} ]; then
  . ${ASCENDNPU_IR_SET_ENV}
fi
EOF
    echo "appended ascendnpu-ir set_env block to ${ENV_EXPORT}"
  else
    echo "ascendnpu-ir block already present in ${ENV_EXPORT}"
  fi
fi

echo "=== [5] Verify via /etc/profile ==="
bash -lc ". /etc/profile && command -v bishengir-opt && bishengir-opt --help 2>&1 | head -5"

echo "=== [6] Smoke test op_triton compile path ==="
if [ -d /home/developer/op_triton ]; then
  bash -lc ". /etc/profile && cd /home/developer/op_triton && python3 op_triton.py" 2>&1 | tail -20 || true
fi

echo "=== DONE ==="
