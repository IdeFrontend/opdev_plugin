#!/usr/bin/env python3
"""Run setup on 6430 via nohup and stream log until done."""
import argparse
import sys
import time

import paramiko
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")

HOST = "7.213.219.27"
PORT = 6430
USER = "developer"
PASSWORD = "developer"
PROXY_URL = "http://10.198.126.40:3128"
PROXY_ENV = " ".join(
    f"{name}={PROXY_URL}" for name in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy")
)
LOG = "/tmp/setup-triton-codearts.log"
PIDFILE = "/tmp/setup-triton-codearts.pid"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--user", default=USER)
    parser.add_argument("--password", default=PASSWORD)
    parser.add_argument("--timeout", type=int, default=3600)
    parser.add_argument(
        "--triton-op-dir",
        default="/home/developer/op_triton",
    )
    parser.add_argument(
        "--settings",
        default="/home/developer/op_triton/.vscode/settings.json",
    )
    args = parser.parse_args()

    script_path = Path(__file__).with_name("setup-triton-codearts-container.sh")
    script_bytes = script_path.read_bytes().replace(b"\r\n", b"\n")
    remote_script = "/tmp/setup-triton-codearts.sh"

    env_parts = [PROXY_ENV, f"TRITON_OP_DIR={args.triton_op_dir}"]
    if args.settings:
        env_parts.append(f"TRITON_PROJECT_SETTINGS={args.settings}")
    env_prefix = " ".join(env_parts)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        args.host,
        port=args.port,
        username=args.user,
        password=args.password,
        timeout=30,
    )

    sftp = client.open_sftp()
    with sftp.file(remote_script, "wb") as handle:
        handle.write(script_bytes)
    sftp.chmod(remote_script, 0o755)
    sftp.close()

    launch = (
        f"rm -f {LOG}; "
        f"nohup env {env_prefix} bash {remote_script} > {LOG} 2>&1 & echo $! > {PIDFILE}; "
        f"cat {PIDFILE}"
    )
    _, stdout, _ = client.exec_command(launch, timeout=30)
    pid = stdout.read().decode().strip()
    print(f"Started setup pid={pid} on {args.host}:{args.port}")
    print(f"Log: {LOG}")

    deadline = time.time() + args.timeout
    last_size = 0
    while time.time() < deadline:
        time.sleep(10)
        _, stdout, _ = client.exec_command(
            f"if [ -f {PIDFILE} ]; then pid=$(cat {PIDFILE}); "
            f"if kill -0 \"$pid\" 2>/dev/null; then echo RUNNING; else echo DONE; fi; "
            f"else echo DONE; fi; wc -c < {LOG} 2>/dev/null || echo 0",
            timeout=30,
        )
        lines = stdout.read().decode().strip().splitlines()
        state = lines[0] if lines else "UNKNOWN"
        size = int(lines[1]) if len(lines) > 1 and lines[1].isdigit() else 0

        if size > last_size:
            _, stdout, _ = client.exec_command(f"tail -c +{last_size + 1} {LOG}", timeout=60)
            chunk = stdout.read().decode("utf-8", errors="replace")
            if chunk:
                print(chunk, end="", flush=True)
            last_size = size

        if state == "DONE":
            _, stdout, _ = client.exec_command(f"tail -n 30 {LOG}", timeout=30)
            tail = stdout.read().decode("utf-8", errors="replace")
            if "=== DONE ===" in tail or "ERROR:" in tail:
                pass
            # get exit code from log heuristic
            _, stdout, _ = client.exec_command(
                f"grep -q '=== DONE ===' {LOG} && echo 0 || echo 1",
                timeout=15,
            )
            code = int(stdout.read().decode().strip() or "1")
            client.close()
            print(f"\nEXIT {code}")
            return code

    print("ERROR: setup timed out", file=sys.stderr)
    client.close()
    return 124


if __name__ == "__main__":
    raise SystemExit(main())
