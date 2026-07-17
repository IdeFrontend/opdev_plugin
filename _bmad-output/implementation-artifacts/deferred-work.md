# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-gc-45-basic-ttk.md`
  summary: Make the managed TTK supply chain deterministic and fully usable without network access.
  evidence: The basic implementation pins the upstream TTK commit, but its Python requirements are not hash-locked or bundled, and runtime-generated untracked files cannot safely be treated as source tampering. A release-grade follow-up needs a verified dependency manifest or wheelhouse plus an explicit managed-source integrity policy.

- source_spec: `_bmad-output/implementation-artifacts/spec-gc-45-basic-ttk.md`
  summary: Define and enforce a compatibility contract for a preinstalled system TTK.
  evidence: The basic probe validates the official version signature, but there is no approved supported-version range or capability matrix for `kernel`, `aclnn`, and `e2e`. Enforcing an invented range now could reject valid customer installations.

- source_spec: `_bmad-output/implementation-artifacts/spec-gc-45-basic-ttk.md`
  summary: Add a configurable watchdog policy for individual TTK CSV executions.
  evidence: Download, install, and probe stages are bounded, while an actual NPU test is intentionally stopped through the existing Stop action. A safe default duration and timeout semantics require product and hardware-duration data that are outside the approved basic slice.

- source_spec: `_bmad-output/implementation-artifacts/spec-gc-45-st-results-webview.md`
  summary: Validate the canonical ST results root before creating output directories.
  evidence: The baseline ST runner resolves its output beneath the workspace IDE-config path lexically, but a pre-existing junction or symlink in that directory chain can redirect TTK result creation outside the workspace; the visualization correctly confines artifacts to the resulting run root but cannot prove that root itself is workspace-owned.
