#!/usr/bin/env python3
"""Run Triton setup on 6430 (internet install) and verify against reference 6369."""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run_script(name: str, args: list[str]) -> int:
    cmd = [sys.executable, str(ROOT / name), *args]
    print(f"\n>>> {' '.join(cmd)}")
    return subprocess.call(cmd)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--audit-reference",
        action="store_true",
        help="Print live audit from reference container 6369 before setup",
    )
    parser.add_argument(
        "--setup-timeout",
        type=int,
        default=3600,
        help="Remote setup timeout seconds (Python compile can be slow)",
    )
    parser.add_argument(
        "--settings",
        default="/home/developer/op_triton/.vscode/settings.json",
        help="Remote .vscode/settings.json to patch (empty to skip)",
    )
    args = parser.parse_args()

    if args.audit_reference:
        rc = run_script("audit-reference-6369.py", [])
        if rc != 0:
            return rc

    upload_args = ["--timeout", str(args.setup_timeout)]
    if args.settings:
        upload_args.extend(["--settings", args.settings])

    rc = run_script("upload-setup-triton-codearts.py", upload_args)
    if rc != 0:
        return rc

    return run_script("verify-triton-codearts-container.py", [])


if __name__ == "__main__":
    raise SystemExit(main())
