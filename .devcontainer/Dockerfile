FROM swr.cn-north-4.myhuaweicloud.com/ci_cann/cann-pod-python3.12:1.0.0 AS codearts-source

FROM quay.io/ascend/vllm-ascend:v0.13.0

ARG http_proxy
ARG https_proxy
ARG no_proxy
ARG ROOT_PASSWORD

ENV http_proxy=${http_proxy}
ENV https_proxy=${https_proxy}
ENV no_proxy=${no_proxy}
ENV HTTP_PROXY=${http_proxy}
ENV HTTPS_PROXY=${https_proxy}
ENV NO_PROXY=${no_proxy}

ENV PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ENV PIP_PROGRESS_BAR=off

# codearts-server in the CANN image is shipped as a prebuilt bundle under
# /home/developer/codearts. Reuse that exact bundle for plugin test parity.
COPY --from=codearts-source /home/developer/codearts /opt/codearts

# Install common Triton runtime dependencies.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    build-essential \
    git \
    curl \
    wget \
    cmake \
    sudo \
    openssh-server \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /root/.codearts-server/extensions \
    && ln -sf /opt/codearts/bin/codearts-server /usr/local/bin/codearts-server

# Configure OpenSSH server for key-based remote access.
RUN mkdir -p /var/run/sshd /root/.ssh \
    && chmod 700 /root/.ssh \
    && sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin yes/' /etc/ssh/sshd_config \
    && sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication yes/' /etc/ssh/sshd_config \
    && echo "PubkeyAuthentication yes" >> /etc/ssh/sshd_config \
    && if [ -n "${ROOT_PASSWORD:-}" ]; then echo "root:${ROOT_PASSWORD}" | chpasswd; fi

# Preinstall Python extension for VS Code Huawei remote sessions.
# Reuse extension payload already present in cann-pod source image.
COPY --from=codearts-source /home/developer/.codearts-server/extensions/ms-python.python-2025.20.1 /root/.codearts-server/extensions/ms-python.python-2025.20.1
COPY --from=codearts-source /home/developer/.codearts-server/extensions/ms-python.debugpy-2025.18.0 /root/.codearts-server/extensions/ms-python.debugpy-2025.18.0

# /etc/profile in this base image uses bash-only sourcing and bash-only env scripts.
# Make it safe for /bin/sh invocations used by plugin task runners.
RUN sed -i -e 's/^source[[:space:]]\+/. /' -e 's#^\./#\. /#' /etc/profile \
    && awk '{ \
      if ($0 ~ /^\. \/usr\/local\/Ascend\/.*set_env\.sh$/) { \
        print "if [ -n \"$BASH_VERSION\" ]; then " $0 "; fi"; \
      } else { \
        print $0; \
      } \
    }' /etc/profile > /tmp/profile.fixed \
    && mv /tmp/profile.fixed /etc/profile

# Merge key environment behavior from cann-pod profile without overriding
# vllm-ascend defaults. Keep sh-safe and idempotent.
RUN printf '%s\n' \
    '#!/bin/sh' \
    '' \
    '# Keep timezone behavior from cann-pod.' \
    'export TZ="${TZ:-Asia/Shanghai}"' \
    '' \
    '# Prefer vllm/ascend-toolkit env, but allow cann script when present in bash.' \
    'if [ -n "${BASH_VERSION:-}" ] && [ -r /usr/local/Ascend/cann/set_env.sh ]; then' \
    '  . /usr/local/Ascend/cann/set_env.sh' \
    'fi' \
    '' \
    '# Add AscendC cmake path if toolchain is present.' \
    'if [ -n "${ASCEND_TOOLKIT_HOME:-}" ] && [ -d "${ASCEND_TOOLKIT_HOME}/compiler/tikcpp/ascendc_kernel_cmake" ]; then' \
    '  export CMAKE_PREFIX_PATH="${ASCEND_TOOLKIT_HOME}/compiler/tikcpp/ascendc_kernel_cmake${CMAKE_PREFIX_PATH:+:${CMAKE_PREFIX_PATH}}"' \
    'fi' \
    '' \
    '_append_path_if_exists() {' \
    '  _dir="$1"' \
    '  _var="$2"' \
    '  [ -d "$_dir" ] || return 0' \
    '  eval "_current=\${$_var}"' \
    '  case ":$_current:" in' \
    '    *:"$_dir":*) return 0 ;;' \
    '    "") eval "export $_var=\"$_dir\"" ;;' \
    '    *) eval "export $_var=\"$_dir:\${$_var}\"" ;;' \
    '  esac' \
    '}' \
    '' \
    '_append_path_if_exists /usr/local/python3.11.14/bin PATH' \
    '_append_path_if_exists /opt/buildtools/python-3.12.9/bin PATH' \
    '_append_path_if_exists /opt/buildtools/python-3.12.9/lib LD_LIBRARY_PATH' \
    '_append_path_if_exists /usr/local/Ascend/driver/lib64/common LD_LIBRARY_PATH' \
    '_append_path_if_exists /usr/local/Ascend/driver/lib64/driver LD_LIBRARY_PATH' \
    '_append_path_if_exists /usr/local/Ascend/driver/lib64 LD_LIBRARY_PATH' \
    '_append_path_if_exists "${ASCEND_HOME_PATH:-}/tools/simulator/Ascend910B1/lib" LD_LIBRARY_PATH' \
    '' \
    'export INSIGHT_HOME_PATH="${INSIGHT_HOME_PATH:-/root/opensource/insight}"' \
    'export PROMPT_DIRTRIM="${PROMPT_DIRTRIM:-3}"' \
    > /etc/profile.d/zz-mstt-ascend.sh \
    && chmod +x /etc/profile.d/zz-mstt-ascend.sh

RUN printf '%s\n' \
    '#!/bin/bash' \
    'set -euo pipefail' \
    '' \
    ': "${CODEARTS_HOST:=0.0.0.0}"' \
    ': "${CODEARTS_PORT:=8888}"' \
    '' \
    'mkdir -p /var/run/sshd' \
    'ssh-keygen -A >/dev/null 2>&1 || true' \
    '/usr/sbin/sshd -D -e &' \
    '' \
    '# Start CodeArts server in foreground so container lifecycle follows it.' \
    'exec codearts-server --host "${CODEARTS_HOST}" --port "${CODEARTS_PORT}" --without-connection-token' \
    > /usr/local/bin/start-services.sh \
    && chmod +x /usr/local/bin/start-services.sh

RUN printf '%s\n' \
    '#!/usr/bin/env bash' \
    'set -eo pipefail' \
    '' \
    '# Usage: npu-smoke-test [device_id]' \
    'DEVICE_ID="${1:-0}"' \
    'export DEVICE_ID' \
    '' \
    'if [ -f /etc/profile ]; then' \
    '  set +u' \
    '  . /etc/profile' \
    '  set -u' \
    'fi' \
    '' \
    'echo "[smoke] user=$(id -un) uid=$(id -u) gid=$(id -g) device_id=${DEVICE_ID}"' \
    'echo "[smoke] python=$(command -v python3)"' \
    'python3 - <<'"'"'PYEOF'"'"'' \
    'import os' \
    'import sys' \
    '' \
    'device_id = int(os.environ.get("DEVICE_ID", "0"))' \
    '' \
    'print("[smoke] Importing torch...")' \
    'import torch' \
    'print(f"[smoke] torch={getattr(torch, "__version__", "unknown")}")' \
    '' \
    'print("[smoke] Importing torch_npu...")' \
    'import torch_npu' \
    'print(f"[smoke] torch_npu={getattr(torch_npu, "__version__", "unknown")}")' \
    '' \
    'print("[smoke] Importing triton...")' \
    'import triton' \
    'print(f"[smoke] triton={getattr(triton, "__version__", "unknown")}")' \
    '' \
    'avail = torch.npu.is_available()' \
    'count = torch.npu.device_count()' \
    'print(f"[smoke] npu_available={avail} device_count={count}")' \
    'if not avail or count <= 0:' \
    '    print("[smoke] FAIL: NPU is not available for this user/session.")' \
    '    sys.exit(2)' \
    '' \
    'if device_id < 0 or device_id >= count:' \
    '    print(f"[smoke] FAIL: requested device {device_id} is out of range [0, {count-1}].")' \
    '    sys.exit(3)' \
    '' \
    'print(f"[smoke] Running compute test on npu:{device_id}...")' \
    'torch.npu.set_device(device_id)' \
    'x = torch.randn(1024, device=f"npu:{device_id}")' \
    'y = torch.randn(1024, device=f"npu:{device_id}")' \
    'z = x + y' \
    'torch.npu.synchronize()' \
    'max_diff = (z.cpu() - (x.cpu() + y.cpu())).abs().max().item()' \
    'print(f"[smoke] PASS: npu:{device_id} compute ok, max_diff={max_diff:.6e}")' \
    'PYEOF' \
    > /usr/local/bin/npu-smoke-test \
    && chmod +x /usr/local/bin/npu-smoke-test

ENV PATH="/opt/codearts/bin:${PATH}"
WORKDIR /workspace
EXPOSE 22
EXPOSE 8888
CMD ["/usr/local/bin/start-services.sh"]