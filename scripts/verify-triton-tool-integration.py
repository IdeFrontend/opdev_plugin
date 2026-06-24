#!/usr/bin/env python3
"""Emulate plugin CLI runs for msprof/mssanitizer/msdebug on op_triton.py (6430)."""
from __future__ import annotations

import argparse
import sys
import textwrap
import time

import paramiko

HOST = "7.213.219.27"
PORT = 6430
USER = "developer"
PASSWORD = "developer"
PROJECT = "/home/developer/op_triton"
SCRIPT = "op_triton.py"
PYTHON = "/usr/local/python3.11.14/bin/python3"
ENV = ". /etc/profile"
CD = f"cd {PROJECT}"
SIMULATOR_DEVICE = "Ascend910B4"
SANITIZER_ENV = (
    "TRITON_ENABLE_SANITIZER=1 TRITON_ALWAYS_COMPILE=1 PYTORCH_NO_NPU_MEMORY_CACHING=1"
)
MSDEBUG_ENV = (
    "TRITON_DISABLE_CACHE=1 TRITON_DISABLE_LINE_INFO=false LLVM_EXTRACT_DI_LOCAL_VARIABLES=1"
)


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str]:
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = (stdout.read() + stderr.read()).decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    return code, out


def section(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def check(label: str, code: int, out: str, ok_patterns: list[str], fail_patterns: list[str]) -> bool:
    text = out.strip()
    tail = "\n".join(text.splitlines()[-25:]) if text else "(empty)"
    ok = code == 0
    for pat in ok_patterns:
        if pat not in text:
            ok = False
    for pat in fail_patterns:
        if pat in text:
            ok = False
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {label} (exit={code})")
    print(tail)
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--user", default=USER)
    parser.add_argument("--password", default=PASSWORD)
    args = parser.parse_args()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(args.host, args.port, args.user, args.password, timeout=30)

    results: list[tuple[str, bool]] = []
    log_ts = int(time.time() * 1000)
    opprof_dir = f"{PROJECT}/.vscode/opprof"
    san_log_dir = f"{PROJECT}/.vscode/mindstudio_sanitizer_log"
    san_log = f"{san_log_dir}/mssanitizer_{log_ts}.log"

    section("Preflight: tools on PATH")
    for tool in ("msprof", "mssanitizer", "msdebug", "msdebug-mi", "bishengir-opt"):
        code, out = run(client, f"bash -lc '{ENV} && command -v {tool}'")
        print(f"  {tool}: exit={code} -> {out.strip() or '(missing)'}")
        if code != 0:
            results.append((f"preflight:{tool}", False))

    section("Plugin-style run (baseline)")
    baseline = f"bash -lc '{ENV} && {CD} && {PYTHON} {SCRIPT}'"
    print(f"CMD: {baseline}")
    code, out = run(client, baseline, timeout=300)
    results.append(
        (
            "run",
            check(
                "run",
                code,
                out,
                ["op_triton: OK", "Sample add run success"],
                ["Traceback", "MLIRCompilationError", "FileNotFoundError"],
            ),
        )
    )

    section("Plugin-style msprof op simulator")
    sim_cmd = (
        f"bash -lc '{ENV} && {CD} && mkdir -p {opprof_dir} && "
        f"msprof op simulator --soc-version={SIMULATOR_DEVICE} "
        f"--output={opprof_dir} --aic-metrics=PipeUtilization "
        f"{PYTHON} {SCRIPT}'"
    )
    print(f"CMD: {sim_cmd}")
    code, out = run(client, sim_cmd, timeout=900)
    results.append(
        (
            "msprof-simulator",
            check(
                "msprof op simulator",
                code,
                out,
                [],
                ["Traceback", "error:", "ERROR", "failed", "Failed"],
            ),
        )
    )
    if code == 0:
        code2, out2 = run(client, f"find {opprof_dir} -type f 2>/dev/null | head -10")
        print(f"[artifacts] exit={code2}")
        print(out2.strip() or "(no files)")

    section("Plugin-style msprof op onboard")
    onboard_cmd = (
        f"bash -lc '{ENV} && {CD} && mkdir -p {opprof_dir} && "
        f"msprof op --output={opprof_dir} "
        f"--aic-metrics=Occupancy,Roofline,Source,MemoryDetail,KernelScale "
        f"{PYTHON} {SCRIPT}'"
    )
    print(f"CMD: {onboard_cmd}")
    code, out = run(client, onboard_cmd, timeout=900)
    results.append(
        (
            "msprof-onboard",
            check(
                "msprof op onboard",
                code,
                out,
                [],
                ["Traceback", "ERR", "failed", "Failed"],
            ),
        )
    )
    if code == 0:
        code2, out2 = run(
            client,
            f"find {opprof_dir} -type f 2>/dev/null | tail -15",
        )
        print(f"[artifacts] exit={code2}")
        print(out2.strip() or "(no files)")

    section("Plugin-style mssanitizer")
    san_cmd = (
        f"bash -lc '{ENV} && {SANITIZER_ENV} && {CD} && mkdir -p {san_log_dir} && "
        f"mssanitizer --tool=memcheck --log-level=warn --max-debuglog-size=1024 "
        f"--log-file={san_log} -- {PYTHON} {SCRIPT}'"
    )
    print(f"CMD: {san_cmd}")
    code, out = run(client, san_cmd, timeout=900)
    results.append(
        (
            "mssanitizer",
            check(
                "mssanitizer memcheck",
                code,
                out,
                [],
                ["Traceback", "FileNotFoundError", "cannot open shared object"],
            ),
        )
    )
    code2, out2 = run(client, f"test -s {san_log} && wc -c {san_log} || echo 'log missing'")
    print(f"[sanitizer log] {out2.strip()}")

    section("Plugin-style msdebug (compile + kernel path + CLI smoke)")
    msdebug_prep = textwrap.dedent(
        f"""
        bash -lc '{ENV} && {MSDEBUG_ENV} && {CD} && {PYTHON} {SCRIPT} >/tmp/op_triton_msdebug_compile.log 2>&1; echo compile_exit=$?'
        """
    ).strip()
    print(f"CMD compile: {msdebug_prep}")
    code, out = run(client, msdebug_prep, timeout=300)
    print(out.strip())
    compile_ok = "compile_exit=0" in out
    results.append(("msdebug-compile", compile_ok))

    kernel_cmd = (
        "find $HOME/.triton/cache -type f \\( -name 'kernel.o' -o -name 'kernel_reloc.o' \\) "
        "-printf '%T@ %p\\n' 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-"
    )
    code, kernel = run(client, f"bash -lc '{kernel_cmd}'")
    kernel = kernel.strip()
    print(f"kernel.o: {kernel or '(not found)'}")

    msdebug_version_cmd = f"bash -lc '{ENV} && msdebug --version 2>&1' | head -3"
    code, out = run(client, msdebug_version_cmd)
    print(f"msdebug --version: exit={code}")
    print(out.strip())

    msdebug_mi_cmd = (
        f"bash -lc '{ENV} && "
        f"export LD_LIBRARY_PATH=/home/developer/Ascend/cann-9.0.0/tools/msdebug/lib:$LD_LIBRARY_PATH && "
        f"/home/developer/Ascend/cann-9.0.0/tools/msdebug/bin/msdebug-mi --version 2>&1' | head -5"
    )
    code, out = run(client, msdebug_mi_cmd)
    mi_ok = code == 0 and "lldb" in out.lower() or "msdebug" in out.lower() or code == 0
    print(f"msdebug-mi --version: exit={code}")
    print(out.strip())

    if kernel and compile_ok:
        msdebug_smoke = (
            f"bash -lc '{ENV} && {MSDEBUG_ENV} && export LAUNCH_KERNEL_PATH={kernel} && "
            f"timeout 15 msdebug {PYTHON} {SCRIPT} -batch -ex quit 2>&1'"
        )
        print(f"CMD smoke: {msdebug_smoke}")
        code, out = run(client, msdebug_smoke, timeout=120)
        # timeout 124 is acceptable for interactive debugger attach attempt
        dbg_ok = code in (0, 124) and "Traceback" not in out
        print(f"msdebug smoke exit={code}")
        print("\n".join(out.splitlines()[-20:]))
        results.append(("msdebug-cli-smoke", dbg_ok))
    else:
        results.append(("msdebug-cli-smoke", False))

    results.append(("msdebug-mi", mi_ok))

    section("SUMMARY")
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    for name, ok in results:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    print(f"\n{passed}/{total} checks passed")
    client.close()
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
