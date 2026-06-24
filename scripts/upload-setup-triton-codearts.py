#!/usr/bin/env python3
"""Upload and run setup-triton-codearts-container.sh on CodeArts container 6430."""
import argparse
import sys
import threading
import time

import paramiko
from pathlib import Path

HOST = "7.213.219.27"
PORT = 6430
USER = "developer"
PASSWORD = "developer"
PROXY_URL = "http://10.198.126.40:3128"
PROXY_ENV = " ".join(
    f"{name}={PROXY_URL}" for name in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy")
)


def stream_command(client: paramiko.SSHClient, cmd: str, timeout: int) -> int:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    done = threading.Event()

    def reader(stream, label: str) -> None:
        while True:
            line = stream.readline()
            if not line:
                break
            print(f"[{label}] {line.rstrip()}")
        done.set()

    threads = [
        threading.Thread(target=reader, args=(stdout, "out"), daemon=True),
        threading.Thread(target=reader, args=(stderr, "err"), daemon=True),
    ]
    for thread in threads:
        thread.start()

    deadline = time.time() + timeout
    while time.time() < deadline:
        if stdout.channel.exit_status_ready():
            break
        time.sleep(0.5)

    if not stdout.channel.exit_status_ready():
        print(f"ERROR: remote command timed out after {timeout}s", file=sys.stderr)
        stdout.channel.close()
        return 124

    for thread in threads:
        thread.join(timeout=5)

    return stdout.channel.recv_exit_status()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--settings",
        default="",
        help="Remote path to .vscode/settings.json to patch (optional)",
    )
    parser.add_argument(
        "--triton-op-dir",
        default="",
        help="Remote triton project dir for smoke test (optional)",
    )
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--user", default=USER)
    parser.add_argument("--password", default=PASSWORD)
    parser.add_argument(
        "--timeout",
        type=int,
        default=1800,
        help="Remote setup timeout in seconds (default 1800)",
    )
    args = parser.parse_args()

    script_path = Path(__file__).with_name("setup-triton-codearts-container.sh")
    script_bytes = script_path.read_bytes().replace(b"\r\n", b"\n")

    env_parts = [PROXY_ENV]
    if args.settings:
        env_parts.append(f"TRITON_PROJECT_SETTINGS={args.settings}")
    if args.triton_op_dir:
        env_parts.append(f"TRITON_OP_DIR={args.triton_op_dir}")
    env_prefix = " ".join(env_parts)
    remote_script = "/tmp/setup-triton-codearts.sh"
    cmd = f"{env_prefix} bash {remote_script}".strip()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            args.host,
            port=args.port,
            username=args.user,
            password=args.password,
            timeout=30,
        )
    except Exception as exc:
        print(f"SSH connect failed: {exc}", file=sys.stderr)
        return 1

    sftp = client.open_sftp()
    with sftp.file(remote_script, "wb") as handle:
        handle.write(script_bytes)
    sftp.chmod(remote_script, 0o755)
    sftp.close()

    print(f"Running on {args.host}:{args.port} as {args.user}")
    print(f"  HTTP_PROXY={PROXY_URL}")

    code = stream_command(client, cmd, args.timeout)
    client.close()

    print("EXIT", code)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
