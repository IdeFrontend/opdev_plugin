# Ascend / CANN environment resolution — canonical spec

Status: implemented in `shared/ascend-series-registry.ts`,
`plugin/src/domain/utils/ascend-util.ts`, `plugin/src/domain/utils/global-env-snapshot.ts`,
`plugin/src/domain/utils/ascend-detection-env.ts`.

Workspace keys: [`workspace-settings.md`](./workspace-settings.md). A5 operations: [`ascend-a5-support.md`](./ascend-a5-support.md).

> If implementation disagrees with this document, fix the implementation.

---

## 1. Quick reference — chip → series → defaults

Matching uses **normalized** chip id (§3). **Order:** exact (§4.1), then prefix (§4.2).

| Rule | Pattern / names (normalized) | Series | Default `socVersion` |
|------|------------------------------|--------|----------------------|
| Prefix | `Ascend950*` | A5 | `ascend950` |
| Prefix | `Ascend910_*` | A3 | `ascend910_93` |
| Prefix | `Ascend910A*`, `Ascend910B*` | A2 | `ascend910b` |
| Exact | `Ascend901A/B`, `Ascend910PremiumA`, `Ascend910ProA/B` | A2 | `ascend910b` |

Prefix order: `Ascend950` → `Ascend910_` → `Ascend910A` → `Ascend910B`.

| Series | `socVersion` | `simulatorType` | Default `npuArch` |
|--------|--------------|-----------------|-------------------|
| A2 | `ascend910b` | `Ascend910B3` | `dav-2201` |
| A3 | `ascend910_93` | `Ascend910C` | `dav-2201` |
| A5 | `ascend950` | `Ascend950PR_9589` | `dav-3510` |

**A2 Pro / Premium / 901:** still series **A2** (`ascend910b`, `Ascend910B3`); only `NPU_ARCH` is **`dav-1001`** (not `dav-2201`). Workspace `socVersion=ascend910b` alone does not set `dav-1001` — needs a detected/cached §4.1 chip (§5).

Constants: [`shared/cann-env-constants.ts`](../shared/cann-env-constants.ts).

---

## 2. Variables the plugin owns

| Name | Meaning | Where it lands |
|------|---------|----------------|
| `SOC_VERSION` | CANN SOC **slug** on non-simulator runs; on **simulator-class** runs spawn value is **simulator directory name** | Spawn env (§8) + `{soc_version}` (**always slug**) + `--soc=` when applicable |
| `simulatorType` | Simulator dir under `tools/simulator/<dir>/lib` | `{simulator_type}`, `--simulator`; **not** `process.env.SIMULATOR_TYPE` |
| `NPU_ARCH` | AscendC `--npu-arch` | Spawn env; §6 |
| `SUPPORT_COMPUTE_UNIT` / `SUPPORT_TILING_DIR` | ACLNN cmake literals | Baked at operator generation (§9) |

Spawn exports `SOC_VERSION` + `NPU_ARCH` only for types whose cmake reads them (`ascend-c`, `torch-library`, `op_type=cann`). Standard-custom / pyasc / triton use placeholders only (`OperatorPluginRegistry.filterSpawnEnv()`).

---

## 3. Chip Name normalization

```
normalize(chip) = chip.trim().replace(/\s+/g, '')
```

Examples: `Ascend 910_9362 V1` → `Ascend910_9362V1` (A3); `Ascend 910 ProA` → `Ascend910ProA` (A2 + `dav-1001`). Matching uses normalized id; logs and chip cache store **raw** probe text.

---

## 4. Chip rules

### 4.1 Extract from probes

Once per session: `asys info -r=status`, then `npu-smi info`, in bash sourcing CANN `set_env.sh` (§7.2 step 3).

1. Lines `Chip Name` / `芯片名称` — value after `:` to EOL.
2. Fallback: tokens `Ascend` + digits/model (`Ascend\s*\d[\dA-Za-z_]*`).

Dedupe, preserve order; use **first** chip matching §4.2–4.3.

### 4.2 Exact match (first)

| Normalized chip | Series | `npuArch` |
|-----------------|--------|-----------|
| `Ascend901A`, `Ascend901B`, `Ascend910PremiumA`, `Ascend910ProA`, `Ascend910ProB` | A2 | `dav-1001` |

### 4.3 Prefix match

| Prefix | Series |
|--------|--------|
| `Ascend950` | A5 |
| `Ascend910_` | A3 |
| `Ascend910A`, `Ascend910B` | A2 |

No match → detection yields no slug. Non-`Ascend*` labels (e.g. `Atlas A5` without chip name) → user sets `environment.socVersion`.

### 4.4 Slug → series (overrides / simulator inverse)

| Slug | Series |
|------|--------|
| `ascend910b`, `ascend910`, `ascend310p` | A2 |
| `ascend910_93` | A3 |
| `ascend950` | A5 |

Simulator → slug: invert §1 default simulator names only (`simulatorTypeToCannSoc`). Unknown → warning, fall back to §7.

### 4.5 ACLNN & profiler (by series of resolved slug)

| Series | `SUPPORT_COMPUTE_UNIT` | `SUPPORT_TILING_DIR` | On-board profiler |
|--------|------------------------|----------------------|-------------------|
| A2, A3 | `ascend910_95` | `arch22` | `MemoryDetail`, … |
| A5 | `ascend950` | `arch35` | `PCSampling`, … (`isAscendA5ProfilerCannSoc` ↔ `ascend950`) |

---

## 5. Session chip cache

On successful host detection, cache **raw** Chip Name until extension restart. Used for `dav-1001` in §6 when later resolves use workspace/global slug. Test hook resets cache; not cleared on workspace SOC change.

---

## 6. `npuArch`

1. Cached chip matches §4.2 → `dav-1001` (slug still `ascend910b`).
2. Else series default from §1 for resolved slug.
3. Empty slug → `''` (no silent 910-class default).

Simulator directory does not map to `npuArch`.

---

## 7. Resolution (`resolveAscendEnv`)

```ts
{
  socVersion: string,
  npuArch: string,
  simulatorType: string | undefined,
  source: {
    socVersion: 'workspace-setting' | 'global-env' | 'detected' |
                'derived-from-simulator' | 'default',
    simulatorType: 'workspace-setting' | 'global-env' | 'default-from-soc' | 'n/a',
    npuArch: 'derived-from-soc',
  },
}
```

Entry points: `resolveAscendEnv()`, `resolveAscendEnvForOperatorCommand()` → `buildOperatorSpawnEnvFromResolution()`.

### 7.1 `simulatorType` (simulator runs only)

1. Workspace `performanceTuning.simulation.simulatorType` (explicit; schema default does **not** count).
2. Global snapshot `SIMULATOR_TYPE`.
3. §1 default for series of resolved slug.

Only (1) triggers **SOC-from-simulator** via §4.4 inverse.

### 7.2 `socVersion`

- Simulator + workspace-explicit simulator → slug from §4.4.
- Else:
  1. Workspace `environment.socVersion` (explicit).
  2. Global snapshot `SOC_VERSION`.
  3. Host detection — §4.1–4.3 → §1 `socVersion`. `set_env.sh` from: `environment.environmentScript` → `ASCEND_ENV_SCRIPT` → `find … set_env.sh`. Project `ascend_env_script` **not** used for detection.
  4. `DEFAULT_FALLBACK_CANN_SOC` (`''`).

`projects.json` `soc_version` is display only.

### 7.3 `npuArch`

Apply §6 after `socVersion` is known. Empty SOC at generation still resolves `SUPPORT_*`; one-time warning before build if SOC unset.

---

## 8. Operator commands

**Spawn:** `executeOperatorCommand` prepends `export SOC_VERSION=… && export NPU_ARCH=…` (`shell-env-exports.ts`); not via `CommandExecutor` `options.env`. Exports before `. ${ascend_env_script} &&` when set.

**Placeholders / CLI** (same resolution per command): `{soc_version}` → slug; `{simulator_type}` → sim dir; ascend build → `--simulator <dir> --soc=<slug>`.

---

## 9. Templates

- **CANN:** cmake `$ENV{SOC_VERSION}` / `$ENV{NPU_ARCH}`; sim runs use sim dir as spawn `SOC_VERSION`.
- **Ascend `add_custom`:** `__MSTT_SUPPORT_*__` at unzip via `resolveAclnnCmakeDefaultsForGeneration()` (§7.2 chain); values from §4.5.

---

## 10. Global env snapshot

`global-env-snapshot.ts` freezes `SOC_VERSION`, `SIMULATOR_TYPE`, `NPU_ARCH`, `ASCEND_ENV_SCRIPT` at activation. Plugin **never** writes them back to `process.env`.

---

## 11. What the plugin does NOT do

- Mutate host `process.env` for ascend vars.
- Source env scripts at activation.
- Export mutable module-level `soc_version` / `npu_arch`.

---

## 12. Logging

| When | Scope |
|------|--------|
| Activation | `op-devtools/ascend-env` — global snapshot |
| Detection | `detected series=A2 soc=ascend910b npu_arch=dav-1001 chip=… (via=npu-smi)` |
| Each resolve | `Ascend Environment Resolved: soc=… source=…` |
| Operator run | `op-devtools/command` — full export chain in logged command |

---

## 13. Tests

`ascend-series-registry.spec.ts`, `ascend-soc-detection-rules.spec.ts`, `operator-spawn-env.spec.ts`, `shell-env-exports.spec.ts`, `operator-command-executor.spec.ts`, `operator-script-placeholders.spec.ts`, `profiler-simulator-resolution.spec.ts`.

---

## 14. Code map

| Piece | Path |
|-------|------|
| Registry | `shared/ascend-series-registry.ts` |
| Resolver | `plugin/src/domain/utils/ascend-util.ts` |
| Probes | `plugin/src/domain/utils/ascend-detection-env.ts` |
| Snapshot | `plugin/src/domain/utils/global-env-snapshot.ts` |
| Spawn | `operator-command-executor.ts`, `shell-env-exports.ts`, `operator-script-placeholders.ts` |
