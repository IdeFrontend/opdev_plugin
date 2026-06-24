#!/usr/bin/env python3
"""Upload and run fix-bishengir-opt-codearts.sh on CodeArts container 6430."""
import argparse
import sys
import threading
import time
from pathlib import Path

import paramiko

HOST = "7.213.219.27"
PORT = 6430
USER = "developer"
PASSWORD = "developer"
PROXY_ENV = " ".join(
    f"{name}=http://10.198.126.40:3128"
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy")
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
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--user", default=USER)
    parser.add_argument("--password", default=PASSWORD)
    parser.add_argument("--timeout", type=int, default=3600)
    args = parser.parse_args()

    script_path = Path(__file__).resolve().parent / "fix-bishengir-opt-codearts.sh"
    remote_script = "/tmp/fix-bishengir-opt-codearts.sh"
    script_bytes = script_path.read_bytes().replace(b"\r\n", b"\n")

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
    with sftp.open(remote_script, "wb") as remote_file:
        remote_file.write(script_bytes)
    sftp.chmod(remote_script, 0o755)
    sftp.close()

    cmd = f"{PROXY_ENV} bash {remote_script}"
    print(f"Running on {args.host}:{args.port}: {cmd}")
    code = stream_command(client, cmd, timeout=args.timeout)
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
