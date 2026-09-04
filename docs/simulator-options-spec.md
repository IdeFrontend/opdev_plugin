# Simulator options specification (`msprof op simulator`)

Canonical contract for **simulation** quick-options, workspace settings, and `msprof op simulator` command generation in OP DevTools.

**Related docs:** [`performance.md`](./performance.md), [`ascend-env-spec.md`](./ascend-env-spec.md) §8.1, [`review-a3-a5-environment-support.md`](./review-a3-a5-environment-support.md) §4.1.

**Code:** [`shared/msprof-simulator-metrics.ts`](../shared/msprof-simulator-metrics.ts), [`plugin/src/domain/services/profiler-service.ts`](../plugin/src/domain/services/profiler-service.ts) (`getSimulationAicMetrics`, `SimulatorStrategy`), [`web/src/views/panels/options-simulator/`](../web/src/views/panels/options-simulator/).

---

## 1. Scope

**In scope:** options that affect `msprof op simulator` metric collection (`--aic-metrics`), simulator platform selection (`--soc-version`), and the simulation quick-options webview.

**Out of scope:** on-board `msprof op` options, sanitizer / mssanitizer, model-level `msprof --application=…` collection, Insight display.

---

## 2. Documentation authority

| Layer | Role |
| ----- | ---- |
| **msopprof CLI** (CANN toolkit `msprof op simulator`) | Validates `--soc-version` and `--aic-metrics`; errors like `maybe in wrong soc platform` |
| **msprof analysis repo** (open-source parsing) | Defines metric group names and exported field semantics — **not** a simulator allow-list |
| **§8 manual CLI verification** | **UI gate** — a metric is shown only after a real `msprof op simulator` pass on that `(metric, cannSoc)` |

Do **not** infer simulator support from msprof analysis chip maps alone (A3 analysis includes `ResourceConflictRatio`; msopprof rejects it on `ascend910_93` — GC-22).

---

## 3. Support states

| State | UI | Allow-list |
| ----- | -- | ---------- |
| **confirmed** | Show control (or implicit base text) | Slug in `SIMULATOR_OPTIONAL_METRIC_SOCS` |
| **unverified** | Hidden | Slug not in set |
| **rejected** | Never | Slug never added (e.g. A3 + `ResourceConflictRatio`) |

Promotion: `unverified` → `confirmed` only after §8 CLI pass and PR evidence.

---

## 4. Environment identifiers (A5 example)

| Identifier | Value | Used for |
| ---------- | ----- | -------- |
| Simulator directory | `Ascend950PR_9589` | `msprof op simulator --soc-version` |
| CANN SOC slug | `ascend950` | Allow-list key, `resolveAscendEnv({ isSimulator: true }).socVersion` |
| Invalid for `--soc-version` | `ascend950` (slug) | msopprof rejects early |

See [`ascend-env-spec.md`](./ascend-env-spec.md) §8.1 for A2/A3 defaults and resolution precedence.

---

## 5. Metric registry (simulator UI)

| Metric | Quick-options section | Default | Notes |
| ------ | ---------------------- | ------- | ----- |
| `PipeUtilization` | Instruction pipeline (text only) | always collected | Base when no optional replacement is active |
| `ResourceConflictRatio` | Code hotspot checkbox | **on** | Mutually exclusive with `PipeUtilization` |
| `PMSampling` | Instruction pipeline checkbox | **off** | Appends after base choice when enabled |
| On-board metrics (`Occupancy`, `Roofline`, `PCSampling`, …) | — | — | **Out of scope** — different CLI (`msprof op`) |

Workspace mapping: [`workspace-settings.md`](./workspace-settings.md) — `simulation.resourceConflictRatio`, `simulation.memoryThroughputWaveform`.

---

## 6. Command rules

1. **Base:** emit `PipeUtilization` unless `ResourceConflictRatio` is both user-enabled **and** allow-listed for `cannSoc`.
2. **Mutual exclusion:** never emit `PipeUtilization` and `ResourceConflictRatio` together.
3. **Append:** `PMSampling` may append when user-enabled **and** allow-listed (e.g. `ResourceConflictRatio,PMSampling`).
4. **Stale workspace values** must not emit metrics when slug is not allow-listed (GC-22 safety).

Example A5 command (defaults on):

```bash
msprof op simulator \
  --soc-version=Ascend950PR_9589 \
  --output=<workspaceRoot>/.vscode/opprof \
  --aic-metrics=ResourceConflictRatio \
  <target>
```

With memory throughput enabled: `--aic-metrics=ResourceConflictRatio,PMSampling`.

---

## 7. §8 verification protocol

Run on a host with matching CANN toolkit before adding a slug to the allow-list:

```bash
# Baseline
msprof op simulator --soc-version=Ascend950PR_9589 \
  --output=/tmp/opprof_test --aic-metrics=PipeUtilization <target>

# Candidate metric (must exit 0 to promote)
msprof op simulator --soc-version=Ascend950PR_9589 \
  --output=/tmp/opprof_test --aic-metrics=ResourceConflictRatio <target>

msprof op simulator --soc-version=Ascend950PR_9589 \
  --output=/tmp/opprof_test --aic-metrics=PMSampling <target>

# A3 negative control (must fail for ResourceConflictRatio)
msprof op simulator --soc-version=Ascend910C \
  --output=/tmp/opprof_test --aic-metrics=ResourceConflictRatio <target>
```

Record CANN version, target operator, and pass/fail in the allow-list PR.

After per-metric PASS, also verify **combined** `--aic-metrics` values the UI can emit (e.g. `ResourceConflictRatio,PMSampling`, `PipeUtilization,PMSampling`) before treating combo paths as confirmed.

---

## 8. §8.1 Recorded results — A5 (`ascend950`)

Manual `msprof op simulator` verification (reported 2026-06-26):

| Metric / combo | Result | Allow-list slug |
| -------------- | ------ | --------------- |
| `ResourceConflictRatio` | **PASS** | `ascend950` |
| `PMSampling` | **PASS** | `ascend950` |
| `ResourceConflictRatio,PMSampling` | **not yet run** | — |
| `PipeUtilization,PMSampling` | **not yet run** | — |

| Field | Value |
| ----- | ----- |
| CANN toolkit version | *not recorded by verifier — add on next §8 run* |
| `--soc-version` | `Ascend950PR_9589` |
| Target operator | *not recorded* |

Implementation: both metrics added to `SIMULATOR_OPTIONAL_METRIC_SOCS` for `ascend950` only. Per-metric PASS is sufficient for initial UI promotion; combo rows above are follow-up verification.

---

## 9. Per-SOC capability matrix

| Environment | `cannSoc` | `--soc-version` | PipeUtilization | ResourceConflictRatio | PMSampling |
| ----------- | --------- | --------------- | --------------- | --------------------- | ---------- |
| **A5** | `ascend950` | `Ascend950PR_9589` | confirmed (base) | **confirmed** (§8.1) | **confirmed** (§8.1) |
| **A3** | `ascend910_93` | `Ascend910C` | confirmed (base) | **rejected** (GC-22) | unverified |
| **A2** | `ascend910b` | `Ascend910B3` | confirmed (base) | unverified | unverified |

**Never allow-list:** `ascend910_93` for `ResourceConflictRatio`.

---

## 10. UI ↔ command invariant

`getSimulatorSupportedMetrics()[metric] === true` ⟺ slug ∈ `SIMULATOR_OPTIONAL_METRIC_SOCS[metric]` ⟺ `getSimulationAicMetrics` would include `metric` when the user option is true.

Both paths use `resolveAscendEnv({ isSimulator: true }).socVersion` and [`isSimulatorOptionalMetricSupported`](../shared/msprof-simulator-metrics.ts).

---

## 11. Expected A5 quick-options (after allow-list)

| UI element | Shown on A5 |
| ---------- | ----------- |
| Instruction pipeline + description | Yes |
| Memory throughput waveform checkbox | Yes (default off) |
| Resource conflict ratio checkbox | Yes (default on) |
| `optionalUnsupported` hint | No (removed; A2/A3 use section copy instead) |
| Default `--aic-metrics` | `ResourceConflictRatio` |

A2/A3: optional checkboxes remain hidden until separate §8 passes add their slugs.
