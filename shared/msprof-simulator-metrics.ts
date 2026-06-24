/**
 * Single source of truth for OPTIONAL `msprof op simulator` aic-metrics, shared by
 * the command builder (plugin `SimulatorStrategy`) and the simulator-options
 * webview so the UI never offers a metric the command would silently drop.
 *
 * Background (GC-22 / plugin_release #32): the simulator (CANN msopprof) validates
 * `--aic-metrics` against the platform selected by `--soc-version` and accepts only
 * a narrow, platform-dependent set; unknown metrics fail with
 * `[ERROR] Unexpected argument ... maybe in wrong soc platform` (this broke A3 /
 * `ascend910_93`). `PipeUtilization` is the mandatory base metric and is always
 * emitted, so it is NOT listed here — only genuinely optional metrics are gated.
 *
 * Ships EMPTY on purpose: the authoritative per-SOC contract lives in the external
 * CANN runtime, not this repo, so guessing a slug could re-break a platform. Add a
 * lowercase, trimmed CANN SOC slug (e.g. `ascend910b`, `ascend950`) to a set below
 * only once the metric is verified on that platform's real simulator. The CANN
 * simulator reference does not list `PMSampling` as a simulator metric at all, so
 * its set is expected to stay empty.
 */
export type SimulatorOptionalMetric = 'ResourceConflictRatio' | 'PMSampling';

export type SimulatorOptionalMetricAllowList =
  Readonly<Record<SimulatorOptionalMetric, ReadonlySet<string>>>;

export const SIMULATOR_OPTIONAL_METRIC_SOCS: SimulatorOptionalMetricAllowList = {
  ResourceConflictRatio: new Set<string>(),
  PMSampling: new Set<string>(),
};

/** Whether the simulator on `cannSoc` is allow-listed to accept `metric`. */
export function isSimulatorOptionalMetricSupported(
  metric: SimulatorOptionalMetric,
  cannSoc: string | null | undefined,
  allowList: SimulatorOptionalMetricAllowList = SIMULATOR_OPTIONAL_METRIC_SOCS,
): boolean {
  return allowList[metric].has((cannSoc || '').trim()
    .toLowerCase());
}
