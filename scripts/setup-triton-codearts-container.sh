#!/bin/bash
# Configure CodeArts container (6430) for Triton-Ascend + OP DevTools integration.
#
# Downloads and installs the Python/Triton stack from the internet (via proxy).
# Container 6369 is reference-only; use scripts/audit-reference-6369.py to inspect it.
#
# Prerequisites on 6430:
#   - CANN 9.0.0 toolkit already installed (includes msdebug under tools/msdebug/)
#   - msdebug-mi needs tools/msdebug/lib on LD_LIBRARY_PATH (unlike msdebug CLI wrapper)
#   - Outbound internet via HTTP(S)_PROXY (default below)
#   - sudo for /usr/local install and /etc env scripts
#
# Usage:
#   bash setup-triton-codearts-container.sh
#   TRITON_PROJECT_SETTINGS=/path/to/.vscode/settings.json  (optional)
#   TRITON_OP_DIR=/path/to/triton_project  (optional)
set -euo pipefail

PROXY_URL="${PROXY_URL:-http://10.198.126.40:3128}"
export HTTP_PROXY="${HTTP_PROXY:-${PROXY_URL}}"
export HTTPS_PROXY="${HTTPS_PROXY:-${PROXY_URL}}"
export http_proxy="${http_proxy:-${PROXY_URL}}"
export https_proxy="${https_proxy:-${PROXY_URL}}"

# Match reference container 6369 (see audit-reference-6369.py --print-manifest)
PYTHON_VERSION="${PYTHON_VERSION:-3.11.14}"
TORCH_VERSION="${TORCH_VERSION:-2.8.0}"
TORCH_NPU_VERSION="${TORCH_NPU_VERSION:-2.8.0.post2}"
TRITON_ASCEND_VERSION="${TRITON_ASCEND_VERSION:-3.2.1}"
TRITON_ASCEND_INDEX_URL="${TRITON_ASCEND_INDEX_URL:-https://triton-ascend.osinfra.cn/pypi/simple}"
PIP_INDEX_URL="${PIP_INDEX_URL:-https://pypi.org/simple}"
TORCH_INDEX_URL="${TORCH_INDEX_URL:-${PIP_INDEX_URL}}"
PYTHON_TARBALL_URL="${PYTHON_TARBALL_URL:-https://www.python.org/ftp/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tgz}"
PYTHON_INSTALLER_URL="${PYTHON_INSTALLER_URL:-}"

ASCEND_HOME="${ASCEND_HOME:-/home/developer/Ascend}"
CANN_ROOT="${CANN_ROOT:-${ASCEND_HOME}/cann-9.0.0}"
SET_ENV="${SET_ENV:-${ASCEND_HOME}/cann/set_env.sh}"
HCCL_LIB_DIR="${HCCL_LIB_DIR:-${CANN_ROOT}/aarch64-linux/lib64}"
MSDEBUG_LIB_DIR="${MSDEBUG_LIB_DIR:-${CANN_ROOT}/tools/msdebug/lib}"
MSDEBUG_MI="${MSDEBUG_MI:-${CANN_ROOT}/tools/msdebug/bin/msdebug-mi}"
PYTHON_PREFIX="${PYTHON_PREFIX:-/usr/local/python3.11.14}"
PYTHON="${PYTHON_PREFIX}/bin/python3"
PYTHON_BIN="${PYTHON_PREFIX}/bin"
DOWNLOAD_DIR="${DOWNLOAD_DIR:-/home/developer/cann-downloads}"
ENV_EXPORT="${ENV_EXPORT:-/etc/ascend-env.sh}"
ASCENDNPU_IR_SET_ENV="${ASCENDNPU_IR_SET_ENV:-${CANN_ROOT}/share/info/ascendnpu-ir/bin/set_env.sh}"
BISHENGIR_BIN="${BISHENGIR_BIN:-${CANN_ROOT}/tools/bishengir/bin}"
SIMULATOR_DIR="${SIMULATOR_DIR:-${CANN_ROOT}/tools/simulator}"
# 6430 NPU is 910B4; msprof op simulator expects a name under tools/simulator/
SIMULATOR_DEVICE="${SIMULATOR_DEVICE:-Ascend910B4}"
CANN_VERSION="${CANN_VERSION:-9.0.0}"
ARCH="$(uname -m)"
TOOLKIT_RUN="${DOWNLOAD_DIR}/Ascend-cann-toolkit_${CANN_VERSION}_linux-${ARCH}.run"
SIMULATOR_RUN="${DOWNLOAD_DIR}/cann-simulator_${CANN_VERSION}_linux-${ARCH}.run"
TOOLKIT_URL="${TOOLKIT_URL:-https://ascend-repo.obs.cn-east-2.myhuaweicloud.com/CANN/CANN%20${CANN_VERSION}/Ascend-cann-toolkit_${CANN_VERSION}_linux-${ARCH}.run}"
PROFILE_D="${PROFILE_D:-/etc/profile.d/99-ascend-triton.sh}"
TRITON_PROJECT_SETTINGS="${TRITON_PROJECT_SETTINGS:-}"
TRITON_OP_DIR="${TRITON_OP_DIR:-}"
TRITON_PROJECT_DIR="${TRITON_PROJECT_DIR:-}"
CURL_OPTS=(-fkSL --retry 3 --connect-timeout 30 --max-time 900)
CURL_OPTS_LONG=(-fkSL --retry 3 --connect-timeout 30 --max-time 7200)

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || die "missing required file: $1"
}

pip_install() {
  sudo env \
    HTTP_PROXY="${HTTP_PROXY}" \
    HTTPS_PROXY="${HTTPS_PROXY}" \
    http_proxy="${http_proxy}" \
    https_proxy="${https_proxy}" \
    "${PYTHON}" -m pip install --no-cache-dir \
    --trusted-host pypi.org \
    --trusted-host files.pythonhosted.org \
    --trusted-host download.pytorch.org \
    --trusted-host download-r2.pytorch.org \
    --trusted-host triton-ascend.osinfra.cn \
    --trusted-host repo.huaweicloud.com \
    "$@"
}

configure_apt_proxy() {
  if [ -z "${HTTP_PROXY:-}" ]; then
    return 0
  fi
  local apt_proxy_file="/etc/apt/apt.conf.d/99-op-devtools-proxy"
  sudo tee "${apt_proxy_file}" > /dev/null << EOF
Acquire::http::Proxy "${HTTP_PROXY}";
Acquire::https::Proxy "${HTTPS_PROXY:-${HTTP_PROXY}}";
EOF
  echo "configured apt proxy at ${apt_proxy_file}"
}

export_triton_project_env_file() {
  local project_dir="$1"
  local ide_dir

  for ide_dir in .arts .vscode; do
    mkdir -p "${project_dir}/${ide_dir}"
    bash -lc "cd '${project_dir}' && . /etc/profile && env > '${ide_dir}/.env'"
    chmod 750 "${project_dir}/${ide_dir}" "${project_dir}/${ide_dir}/.env" 2>/dev/null || true
    echo "exported ${project_dir}/${ide_dir}/.env (MindStudio Debug environmentScripts)"
  done
}

ensure_toolkit_run() {
  if [ -f "${TOOLKIT_RUN}" ]; then
    return 0
  fi
  echo "Downloading CANN toolkit ${CANN_VERSION} (${ARCH})..."
  curl "${CURL_OPTS_LONG[@]}" \
    -H "Referer: https://www.hiascend.com/" \
    -o "${TOOLKIT_RUN}" \
    "${TOOLKIT_URL}"
  chmod +x "${TOOLKIT_RUN}"
}

extract_bundled_run() {
  local pattern="$1"
  local dest="$2"

  if [ -f "${dest}" ]; then
    return 0
  fi

  ensure_toolkit_run
  local extract_dir
  extract_dir="$(mktemp -d /tmp/cann-toolkit-XXXXXX)"
  "${TOOLKIT_RUN}" --noexec --extract="${extract_dir}" >/dev/null
  local bundled
  bundled="$(find "${extract_dir}/run_package" -name "${pattern}" | head -1)"
  [ -n "${bundled}" ] || die "bundled package not found in toolkit: ${pattern}"
  cp -f "${bundled}" "${dest}"
  chmod +x "${dest}"
  rm -rf "${extract_dir}"
}

cann_simulators_ready() {
  [ -d "${SIMULATOR_DIR}/${SIMULATOR_DEVICE}" ] || \
    ls "${SIMULATOR_DIR}"/Ascend910B* >/dev/null 2>&1
}

install_cann_simulator() {
  extract_bundled_run "cann-simulator_*_linux-${ARCH}.run" "${SIMULATOR_RUN}"
  ls -lh "${SIMULATOR_RUN}"

  # cann-simulator custom install invokes pip3; use Python 3.11 from this setup.
  export PATH="${PYTHON_BIN}:${PATH}"

  if cann_simulators_ready; then
    echo "Upgrading cann-simulator into ${CANN_ROOT}..."
    "${SIMULATOR_RUN}" --upgrade --full --install-path="${CANN_ROOT}" 2>&1 | tail -30 || true
  else
    echo "Installing cann-simulator into ${CANN_ROOT}..."
    "${SIMULATOR_RUN}" --full --install-path="${CANN_ROOT}" 2>&1 | tail -30 || true
  fi

  if ! cann_simulators_ready; then
    ls -la "${SIMULATOR_DIR}" 2>&1 || true
    die "CANN simulators still missing under ${SIMULATOR_DIR} (expected ${SIMULATOR_DEVICE} or Ascend910B*)"
  fi
  echo "CANN simulators ready: $(ls "${SIMULATOR_DIR}" | grep -E 'Ascend910B|Ascend910A' | tr '\n' ' ')"
}

echo "=== [0] Configuration ==="
echo "ASCEND_HOME=${ASCEND_HOME}"
echo "CANN_ROOT=${CANN_ROOT}"
echo "PYTHON_PREFIX=${PYTHON_PREFIX}"
echo "PYTHON_VERSION=${PYTHON_VERSION}"
echo "TORCH_VERSION=${TORCH_VERSION} (index: ${TORCH_INDEX_URL})"
echo "TORCH_NPU_VERSION=${TORCH_NPU_VERSION}"
echo "TRITON_ASCEND_VERSION=${TRITON_ASCEND_VERSION}"
echo "PIP_INDEX_URL=${PIP_INDEX_URL}"
echo "DOWNLOAD_DIR=${DOWNLOAD_DIR}"
echo "MSDEBUG_LIB_DIR=${MSDEBUG_LIB_DIR}"
echo "HTTP_PROXY=${HTTP_PROXY}"

echo "=== [1] Preflight: CANN layout ==="
require_file "${SET_ENV}"
[ -d "${CANN_ROOT}" ] || die "CANN root not found: ${CANN_ROOT}"
require_file "${HCCL_LIB_DIR}/libhccl.so"
require_file "${MSDEBUG_LIB_DIR}/liblldb.so.19.1"
require_file "${MSDEBUG_MI}"
if [ ! -x "${BISHENGIR_BIN}/bishengir-opt" ]; then
  echo "WARNING: ${BISHENGIR_BIN}/bishengir-opt missing (triton kernel compile will fail)."
  echo "Run scripts/upload-fix-bishengir-opt.py to repair ascendnpu-ir from CANN toolkit download."
fi
if ! cann_simulators_ready 2>/dev/null; then
  echo "WARNING: Ascend910B simulators missing under ${SIMULATOR_DIR} (msprof op simulator will fail)."
  echo "Step [3.5] will install cann-simulator from the CANN toolkit bundle."
fi
if ! bash -lc "source \"${SET_ENV}\" && npu-smi info" | head -8; then
  echo "WARNING: npu-smi unavailable (device busy or driver issue)."
  echo "SOC autodetection may fail until NPU is free; set op-devtools.environment.socVersion in workspace settings."
fi

mkdir -p "${DOWNLOAD_DIR}"

echo "=== [2] Install Python ${PYTHON_VERSION} -> ${PYTHON_PREFIX} ==="
if [ ! -x "${PYTHON}" ]; then
  if [ -n "${PYTHON_INSTALLER_URL}" ]; then
    installer="${DOWNLOAD_DIR}/Python_${PYTHON_VERSION}_installer.run"
    echo "Downloading Ascend Python installer..."
    curl "${CURL_OPTS[@]}" -o "${installer}" "${PYTHON_INSTALLER_URL}"
    chmod +x "${installer}"
    sudo bash "${installer}" --install-path="${PYTHON_PREFIX}" --quiet || \
      bash "${installer}" --install-path="${PYTHON_PREFIX}" --quiet
  else
    echo "Downloading Python source tarball..."
    tarball="${DOWNLOAD_DIR}/Python-${PYTHON_VERSION}.tgz"
    curl "${CURL_OPTS[@]}" -o "${tarball}" "${PYTHON_TARBALL_URL}"
    build_dir="$(mktemp -d)"
    tar xzf "${tarball}" -C "${build_dir}"
    src_dir="${build_dir}/Python-${PYTHON_VERSION}"

    echo "Installing build dependencies..."
    configure_apt_proxy
    sudo apt-get update
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      build-essential zlib1g-dev libssl-dev libffi-dev libsqlite3-dev \
      libbz2-dev libreadline-dev libncursesw5-dev xz-utils liblzma-dev

    echo "Compiling Python (this may take several minutes)..."
    pushd "${src_dir}" >/dev/null
    ./configure --prefix="${PYTHON_PREFIX}" --enable-shared --with-ensurepip=install
    make -j"$(nproc)"
    sudo make install
    popd >/dev/null
    echo "${PYTHON_PREFIX}/lib" | sudo tee /etc/ld.so.conf.d/op-devtools-python311.conf > /dev/null
    sudo ldconfig
    sudo rm -rf "${build_dir}"
  fi
fi

if [ -x "${PYTHON}" ] && ! "${PYTHON}" -c 'import sys' >/dev/null 2>&1; then
  echo "${PYTHON_PREFIX}/lib" | sudo tee /etc/ld.so.conf.d/op-devtools-python311.conf > /dev/null
  sudo ldconfig
fi

require_file "${PYTHON}"
"${PYTHON}" --version | grep -q "${PYTHON_VERSION}" || die "unexpected python version: $(${PYTHON} --version)"

if ! "${PYTHON}" -m pip --version >/dev/null 2>&1; then
  echo "Bootstrapping pip..."
  curl "${CURL_OPTS[@]}" -o /tmp/get-pip.py https://bootstrap.pypa.io/get-pip.py
  "${PYTHON}" /tmp/get-pip.py
fi

echo "=== [3] Install torch -> torch_npu -> triton-ascend (from internet) ==="
if ! "${PYTHON}" -m pip show torch >/dev/null 2>&1; then
  pip_install "torch==${TORCH_VERSION}" -i "${TORCH_INDEX_URL}"
fi
if ! "${PYTHON}" -m pip show torch-npu >/dev/null 2>&1; then
  pip_install "torch-npu==${TORCH_NPU_VERSION}" \
    -i "${PIP_INDEX_URL}" \
    --trusted-host pypi.org --trusted-host files.pythonhosted.org
fi
if ! "${PYTHON}" -m pip show triton-ascend >/dev/null 2>&1; then
  pip_install "triton-ascend==${TRITON_ASCEND_VERSION}" \
    -i "${PIP_INDEX_URL}" \
    --extra-index-url "${TRITON_ASCEND_INDEX_URL}" \
    --trusted-host pypi.org --trusted-host files.pythonhosted.org
fi

echo "Installed packages:"
"${PYTHON}" -m pip list | grep -iE '^(torch|torch-npu|triton-ascend) '

echo "=== [3.5] Install missing CANN simulators (msprof op simulator) ==="
if cann_simulators_ready; then
  echo "simulators already present under ${SIMULATOR_DIR}"
  ls "${SIMULATOR_DIR}" | grep -E 'Ascend910B|Ascend910A' | head -10 || true
else
  echo "WARNING: ${SIMULATOR_DIR} lacks Ascend910B simulators (only Kirin stubs may be present)."
  install_cann_simulator
fi

echo "=== [4] Generate sh-safe ascend env exports ==="
TMP_ENV="$(mktemp)"
bash -lc "source \"${SET_ENV}\"; export PATH=\"${PYTHON_BIN}:\${PATH}\"; env" \
  | grep -E '^(PATH|LD_LIBRARY_PATH|ASCEND_|TOOLCHAIN_HOME)=' \
  | sed 's/^/export /' > "${TMP_ENV}"

if grep -q '^export LD_LIBRARY_PATH=' "${TMP_ENV}"; then
  sed -i "s#^export LD_LIBRARY_PATH=#export LD_LIBRARY_PATH=${MSDEBUG_LIB_DIR}:${HCCL_LIB_DIR}:#" "${TMP_ENV}"
else
  echo "export LD_LIBRARY_PATH=${MSDEBUG_LIB_DIR}:${HCCL_LIB_DIR}" >> "${TMP_ENV}"
fi
echo "# op-devtools-msdebug-lib" >> "${TMP_ENV}"

{
  echo "export HTTP_PROXY=${HTTP_PROXY}"
  echo "export HTTPS_PROXY=${HTTPS_PROXY}"
  echo "export http_proxy=${http_proxy}"
  echo "export https_proxy=${https_proxy}"
} >> "${TMP_ENV}"

if [ -f "${ASCENDNPU_IR_SET_ENV}" ]; then
  {
    echo "# op-devtools-ascendnpu-ir"
    echo "if [ -f ${ASCENDNPU_IR_SET_ENV} ]; then"
    echo "  . ${ASCENDNPU_IR_SET_ENV}"
    echo "fi"
  } >> "${TMP_ENV}"
fi

sudo cp "${TMP_ENV}" "${ENV_EXPORT}"
sudo chmod 644 "${ENV_EXPORT}"
rm -f "${TMP_ENV}"

echo "=== [5] Extend /etc/profile for Triton (keep environmentScript=/etc/profile) ==="
PROFILE_MARKER="# op-devtools-triton-python311"
if ! grep -q "${PROFILE_MARKER}" /etc/profile 2>/dev/null; then
  TMP_PROFILE_APPEND="$(mktemp)"
  cat > "${TMP_PROFILE_APPEND}" << EOF
${PROFILE_MARKER}
if [ -f ${ENV_EXPORT} ]; then
  . ${ENV_EXPORT}
fi
export PATH="${PYTHON_BIN}:\${PATH}"
EOF
  sudo tee -a /etc/profile > /dev/null < "${TMP_PROFILE_APPEND}"
  rm -f "${TMP_PROFILE_APPEND}"
  echo "appended Triton block to /etc/profile"
else
  echo "Triton block already present in /etc/profile"
fi

echo "=== [6] Create profile.d wrapper (dash / explicit sourcing) ==="
TMP_PROFILE="$(mktemp)"
cat > "${TMP_PROFILE}" << EOF
# sh-safe Ascend + Triton Python env for OP DevTools (dash-compatible)
if [ -f ${ENV_EXPORT} ]; then
  . ${ENV_EXPORT}
fi
export PATH="${PYTHON_BIN}:\${PATH}"
EOF
sudo cp "${TMP_PROFILE}" "${PROFILE_D}"
sudo chmod 644 "${PROFILE_D}"
rm -f "${TMP_PROFILE}"

echo "=== [7] Patch workspace settings (optional) ==="
patch_triton_workspace_settings() {
  local settings_file="$1"
  if [ ! -f "${settings_file}" ]; then
    echo "skip missing ${settings_file}"
    return 0
  fi
  SETTINGS_FILE="${settings_file}" "${PYTHON}" << PY
import json
import os
from pathlib import Path

p = Path(os.environ["SETTINGS_FILE"])
data = json.loads(p.read_text())
data["python.defaultInterpreterPath"] = "${PYTHON}"
data.pop("op-devtools.environment.environmentScript", None)
data["op-devtools.operatorSupport.triton"] = True
data["op-devtools.debugMode"] = True
data["op-devtools.environment.socVersion"] = "ascend910b"
p.write_text(json.dumps(data, indent=2) + "\n")
print("updated", p)
PY
}

TRITON_SETTINGS_TARGETS=()
if [ -n "${TRITON_PROJECT_SETTINGS}" ] && [ -f "${TRITON_PROJECT_SETTINGS}" ]; then
  TRITON_SETTINGS_TARGETS+=("${TRITON_PROJECT_SETTINGS}")
  TRITON_PROJECT_DIR="$(dirname "$(dirname "${TRITON_PROJECT_SETTINGS}")")"
  TRITON_SETTINGS_TARGETS+=("${TRITON_PROJECT_DIR}/.vscode/settings.json")
  TRITON_SETTINGS_TARGETS+=("${TRITON_PROJECT_DIR}/.arts/settings.json")
elif [ -n "${TRITON_OP_DIR}" ]; then
  TRITON_SETTINGS_TARGETS+=("${TRITON_OP_DIR}/.vscode/settings.json")
  TRITON_SETTINGS_TARGETS+=("${TRITON_OP_DIR}/.arts/settings.json")
fi

if [ "${#TRITON_SETTINGS_TARGETS[@]}" -gt 0 ]; then
  SEEN_SETTINGS=""
  for settings_path in "${TRITON_SETTINGS_TARGETS[@]}"; do
    case "${SEEN_SETTINGS}" in
      *"|${settings_path}|"*) continue ;;
    esac
    SEEN_SETTINGS="${SEEN_SETTINGS}|${settings_path}|"
    patch_triton_workspace_settings "${settings_path}"
  done
  # CodeArts reads .arts/settings.json; seed from .vscode when missing.
  if [ -n "${TRITON_PROJECT_DIR:-}" ]; then
    ARTS_SETTINGS="${TRITON_PROJECT_DIR}/.arts/settings.json"
    VSCODE_SETTINGS="${TRITON_PROJECT_DIR}/.vscode/settings.json"
    if [ ! -f "${ARTS_SETTINGS}" ] && [ -f "${VSCODE_SETTINGS}" ]; then
      mkdir -p "$(dirname "${ARTS_SETTINGS}")"
      cp "${VSCODE_SETTINGS}" "${ARTS_SETTINGS}"
      patch_triton_workspace_settings "${ARTS_SETTINGS}"
    fi
  elif [ -n "${TRITON_OP_DIR}" ]; then
    ARTS_SETTINGS="${TRITON_OP_DIR}/.arts/settings.json"
    VSCODE_SETTINGS="${TRITON_OP_DIR}/.vscode/settings.json"
    if [ ! -f "${ARTS_SETTINGS}" ] && [ -f "${VSCODE_SETTINGS}" ]; then
      mkdir -p "$(dirname "${ARTS_SETTINGS}")"
      cp "${VSCODE_SETTINGS}" "${ARTS_SETTINGS}"
      patch_triton_workspace_settings "${ARTS_SETTINGS}"
    fi
  fi
else
  echo "skip (set TRITON_PROJECT_SETTINGS or TRITON_OP_DIR to patch workspace settings)"
fi

echo "=== [7.5] Export IDE .env for MindStudio Debug (msdebug-mi liblldb) ==="
if [ -n "${TRITON_OP_DIR}" ] && [ -d "${TRITON_OP_DIR}" ]; then
  export_triton_project_env_file "${TRITON_OP_DIR}"
else
  echo "skip (set TRITON_OP_DIR to export .arts/.env and .vscode/.env)"
fi

echo "=== [8] Verify imports via /etc/profile (plugin default env script) ==="
bash -lc ". /etc/profile && python3 -c 'import torch, triton; print(\"torch\", torch.__version__); print(\"triton\", triton.__version__)'"

echo "=== [9] Verify CANN tools on PATH ==="
bash -lc ". /etc/profile && command -v msprof && command -v mssanitizer && command -v msdebug"
bash -lc ". /etc/profile && \"${MSDEBUG_MI}\" --version 2>&1 | head -3" \
  || die "msdebug-mi failed to load liblldb; check ${MSDEBUG_LIB_DIR} in ${ENV_EXPORT}"
bash -lc ". /etc/profile && command -v bishengir-opt" || die "bishengir-opt not on PATH; run upload-fix-bishengir-opt.py"
if ! cann_simulators_ready; then
  die "CANN simulator ${SIMULATOR_DEVICE} missing under ${SIMULATOR_DIR}"
fi
echo "simulator device present: ${SIMULATOR_DIR}/${SIMULATOR_DEVICE}"

if [ -n "${TRITON_OP_DIR}" ] && [ -d "${TRITON_OP_DIR}" ]; then
  echo "=== [10] Smoke test triton operator ==="
  bash -lc ". /etc/profile && cd \"${TRITON_OP_DIR}\" && python3 triton_vector_add.py --help 2>&1 | head -20" || true
fi

echo "=== DONE ==="
