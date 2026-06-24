#!/usr/bin/env python3
"""Verify Triton-Ascend setup on CodeArts container 6430."""
import argparse
import sys

import paramiko

HOST = "7.213.219.27"
PORT = 6430
USER = "developer"
PASSWORD = "developer"
PROFILE_D = "/etc/profile.d/99-ascend-triton.sh"
ASCEND_HOME = "/home/developer/Ascend"
PYTHON = "/usr/local/python3.11.14/bin/python3"


def run(client, cmd: str, timeout: int = 120) -> tuple[int, str, str]:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return code, out, err


def section(title: str) -> None:
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--user", default=USER)
    parser.add_argument("--password", default=PASSWORD)
    parser.add_argument(
        "--settings",
        default="",
        help="Remote .vscode/settings.json path to grep (optional)",
    )
    parser.add_argument(
        "--triton-op-dir",
        default="",
        help="Remote triton project dir for import smoke test (optional)",
    )
    args = parser.parse_args()

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

    print(f"Connected to {args.host}:{args.port} as {args.user}")
    failures = 0

    section("CANN layout")
    checks = [
        ("ascend home", f"ls -la {ASCEND_HOME}"),
        ("set_env.sh", f"ls -la {ASCEND_HOME}/cann/set_env.sh"),
        ("libhccl.so", f"ls -la {ASCEND_HOME}/cann-9.0.0/aarch64-linux/lib64/libhccl.so"),
    ]
    for label, cmd in checks:
        code, out, err = run(client, cmd)
        print(f"[{label}] exit={code}")
        print((out + err).strip() or "(empty)")
        if code != 0:
            failures += 1

    section("Env scripts")
    checks = [
        ("ascend-env.sh", f"head -5 {PROFILE_D.replace('99-ascend-triton.sh', 'ascend-env.sh')} 2>&1"),
        ("profile.d", f"cat {PROFILE_D} 2>&1"),
        ("export LD in ascend-env", f"grep '^export LD_LIBRARY_PATH' /etc/ascend-env.sh 2>&1"),
    ]
    for label, cmd in checks:
        code, out, err = run(client, cmd)
        print(f"[{label}] exit={code}")
        print((out + err).strip() or "(empty)")

    section("Python + torch + triton")
    checks = [
        ("python3.11.14", f"{PYTHON} --version 2>&1"),
        (
            "dash import test",
            f'dash -c \'. {PROFILE_D} && python3 -c "import torch, triton; print(torch.__version__, triton.__version__)"\' 2>&1',
        ),
        ("pip packages", f"{PYTHON} -m pip list 2>/dev/null | grep -iE 'torch|triton'"),
    ]
    for label, cmd in checks:
        code, out, err = run(client, cmd)
        print(f"[{label}] exit={code}")
        print((out + err).strip() or "(empty)")
        if code != 0:
            failures += 1

    section("CANN tools on PATH after env")
    code, out, err = run(
        client,
        f". {PROFILE_D} && which msprof && which mssanitizer && which msdebug",
    )
    print(f"[which msprof/mssanitizer/msdebug] exit={code}")
    print((out + err).strip() or "(empty)")
    if code != 0:
        failures += 1

    code, out, err = run(
        client,
        f". {PROFILE_D} && command -v bishengir-opt && test -x $(command -v bishengir-opt)",
    )
    print(f"[bishengir-opt] exit={code}")
    print((out + err).strip() or "(empty)")
    if code != 0:
        failures += 1
        print("Hint: run scripts/upload-fix-bishengir-opt.py to repair ascendnpu-ir")

    section("NPU")
    code, out, err = run(
        client,
        f". {ASCEND_HOME}/cann/set_env.sh && npu-smi info 2>&1 | head -8",
    )
    print(f"[npu-smi] exit={code}")
    print((out + err).strip() or "(empty)")

    if args.settings:
        section("Workspace settings")
        code, out, err = run(
            client,
            f"grep -E 'python.defaultInterpreterPath|environmentScript|operatorSupport.triton|debugMode|socVersion' {args.settings} 2>&1",
        )
        print(f"[settings] exit={code}")
        print((out + err).strip() or "(empty)")

    if args.triton_op_dir:
        section("Triton operator smoke")
        code, out, err = run(
            client,
            f'dash -c \'. {PROFILE_D} && cd {args.triton_op_dir} && python3 triton_vector_add.py --help\' 2>&1 | head -15',
        )
        print(f"[triton --help] exit={code}")
        print((out + err).strip() or "(empty)")

    section("SUMMARY")
    if failures:
        print(f"FAILED checks: {failures}")
    else:
        print("All critical checks passed.")
    client.close()
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
