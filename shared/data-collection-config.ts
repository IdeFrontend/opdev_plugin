/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Shared types for the A5 "数据采集配置" (Data Collection Config) dialog and the
 * new-tool profiler command generation. Consumed by both the plugin
 * (command generation, settings getters) and the web panel (the config form).
 *
 * On A5 (`ascend950`) the on-board / simulation analysis can be switched to the
 * replacement prototype tools:
 *   - on-board  → `npu-compute`  (see npu-compute使用文档.md)
 *   - simulation → `npu-emulate` (see NPUSim_使用文档.md; renamed from `npusim`)
 *
 * NOTE: the new simulation tool (`npu-emulate`, formerly `npusim`) is
 * temporarily unsupported on A5 — until it lands, simulation always falls back
 * to the legacy `msprof` tool (see ConfigService.getSimulationTool).
 */

/** On-board profiling tool: the new `npu-compute` prototype or the legacy `msprof`. */
export type OnBoardTool = 'npu-compute' | 'msprof';

/** Simulation tool: the new `npu-emulate` prototype (renamed from `npusim`) or the legacy `msprof`. */
export type SimulationTool = 'npu-emulate' | 'msprof';

/** Which collection the dialog is configuring; also preselects the top switch. */
export type CollectionType = 'onboard' | 'simulate';

/** Common (npu-compute/npu-emulate shared) collection options — the dialog's "Common" panel. */
export interface DataCollectionCommon {
  /** `--export` / `-o` output file path; empty → tool default under opprof. */
  outputFile: string;
  /** `--force`: overwrite an existing output file. */
  forceOverwrite: boolean;
  /** Target processes to attach; only `All` is offered for the prototype. */
  targetProcesses: 'all';
  /** Replay mode; only `Application` is offered for the prototype. */
  replayMode: 'application';
  /** Application replay buffer source; only `File` is offered for the prototype. */
  applicationReplayBuffer: 'file';
  /** Application replay mode; only `Balanced` is offered for the prototype. */
  applicationReplayMode: 'balanced';
  /**
   * The final tool arguments string. Auto-synced from the structured selections
   * but user-editable — this text is the source of truth for execution.
   */
  commandLine: string;
}

/** Metrics selection — the dialog's "Metrics" panel (section multi-select XOR set single-select). */
export interface DataCollectionMetrics {
  /** `section` → multi-select sections; `set` → single-select a named preset. */
  kind: 'section' | 'set';
  /** Selected section names (when kind === 'section', or expanded from a set). */
  sections: string[];
  /** Selected set name (when kind === 'set'). */
  set?: string;
}

/** Full payload the dialog produces and the plugin consumes to build the tool command. */
export interface DataCollectionConfig {
  collectionType: CollectionType;
  common: DataCollectionCommon;
  metrics: DataCollectionMetrics;
}

/**
 * Section names offered in the Metrics table (Name column, section mode).
 * Entries in {@link DATA_COLLECTION_UNSUPPORTED_SECTIONS} are kept in the list
 * so the user can see them, but their checkbox is disabled (not selectable).
 */
export const DATA_COLLECTION_SECTIONS: readonly string[] = [
  'PipeUtilization',
  'Pipeline',
  'L2Cache',
  'Memory',
  'MemoryL0',
  'MemoryUB',
  'ArithmeticUtilization',
  'ResourceConflictRatio',
];

/**
 * Sections that are visible in the Metrics table but not yet supported by
 * npu-compute (per the tool's `--help` / documentation). Their checkbox is
 * disabled in the UI, and they are filtered out when building `--section` flags
 * and when expanding named sets, so an unsupported section never reaches the
 * tool command line.
 *
 * As of the latest A5 npu-compute build, all sections listed in
 * {@link DATA_COLLECTION_SECTIONS} are supported on-board, so this set is
 * empty — every section row is selectable and reaches the command line.
 */
export const DATA_COLLECTION_UNSUPPORTED_SECTIONS: ReadonlySet<string> = new Set<string>();

/**
 * Sets that are visible in the Metrics table but not yet supported (no
 * expansion defined). Their radio button is disabled in the UI so the user
 * cannot select them; the "暂不支持" description already conveys why.
 */
export const DATA_COLLECTION_UNSUPPORTED_SETS: ReadonlySet<string> = new Set([
  'detailed',
  'hccl',
  'roofline',
]);

/** Set (preset) names offered in the Metrics table (Name column, set mode). */
export const DATA_COLLECTION_SETS: readonly string[] = [
  'Custom',
  'basic',
  'detailed',
  'full',
  'hccl',
  'roofline',
];

/**
 * Sections a named set expands to. `Custom` is free-form (user picks sections).
 * Sets marked "暂不支持" (not yet supported) keep an empty expansion so the
 * linkage validation can still round-trip them without asserting sections.
 *
 * Matches the Metrics table Description column (set mode):
 *   Custom → 默认参数, basic → PipeUtilization;L2Cache;Memory,
 *   detailed → 暂不支持, full → PipeUtilization;L2Cache;Memory;MemoryL0;MemoryUB,
 *   hccl → 暂不支持, roofline → 暂不支持.
 *
 * Unsupported sections (see {@link DATA_COLLECTION_UNSUPPORTED_SECTIONS}) are
 * excluded from set expansions so selecting a named preset never silently
 * picks an unsupported section.
 */
export const DATA_COLLECTION_SET_SECTIONS: Record<string, readonly string[]> = {
  Custom: [],
  basic: [
    'PipeUtilization',
    'L2Cache',
    'Memory',
  ],
  detailed: [],
  full: [
    'PipeUtilization',
    'Pipeline',
    'L2Cache',
    'Memory',
    'MemoryL0',
    'MemoryUB',
    'ArithmeticUtilization',
    'ResourceConflictRatio',
  ],
  hccl: [],
  roofline: [],
};

/** Placeholder shown for sets that are not yet supported (empty expansion). */
export const DATA_COLLECTION_SET_UNSUPPORTED = '暂不支持' as const;

/** Description shown for the `Custom` (free-form) set row. */
export const DATA_COLLECTION_SET_CUSTOM_DESC = '默认参数' as const;

/** Single Description shared by every section row (section mode). */
export const DATA_COLLECTION_SECTION_DESC = 'Detail analysis of the compute resource...' as const;

/**
 * Description text shown in the Metrics table for a given set: the `Custom`
 * placeholder, the `;`-joined section list for supported sets, or the
 * "暂不支持" placeholder for sets with no expansion.
 */
export function describeDataCollectionSet(set: string): string {
  if (set === 'Custom') {
    return DATA_COLLECTION_SET_CUSTOM_DESC;
  }

  const sections = DATA_COLLECTION_SET_SECTIONS[set] ?? [];

  return sections.length > 0 ? sections.join(';') : DATA_COLLECTION_SET_UNSUPPORTED;
}

/**
 * Resolve which set (if any) a set of selected sections corresponds to, matching
 * by the set's Description (its `;`-joined section list, order-insensitive).
 * Returns `Custom` when no supported set matches — the linkage rule when the user
 * hand-edits sections away from a preset.
 */
export function matchSetForSections(sections: readonly string[]): string {
  const wanted = [...sections].sort()
    .join('|');

  for (const set of DATA_COLLECTION_SETS) {
    if (set === 'Custom') {
      continue;
    }

    const setSections = DATA_COLLECTION_SET_SECTIONS[set] ?? [];

    if (setSections.length === 0) {
      continue;
    }

    if ([...setSections].sort()
      .join('|') === wanted) {
      return set;
    }
  }

  return 'Custom';
}

/** Default artifact filename the new tools export into the shared opprof run dir. */
export const NEW_TOOL_REPORT_FILENAME = 'result.npu-rep' as const;

/** Report file extension produced by the new tools (kept per npu-compute doc). */
export const NEW_TOOL_REPORT_EXT = 'npu-rep' as const;

/**
 * Resolve the concrete list of sections a config selects, expanding a chosen set
 * into its sections. `Custom` (and unsupported/empty sets) fall back to the
 * explicitly checked `sections`. npu-compute only understands `--section`, so a
 * set is always flattened to sections here (there is no `--set` option — see
 * npu-compute使用文档.md §5/§7).
 */
export function resolveSelectedSections(config: DataCollectionConfig): string[] {
  let resolved: string[];

  if (config.metrics.kind === 'set' && config.metrics.set && config.metrics.set !== 'Custom') {
    const expanded = DATA_COLLECTION_SET_SECTIONS[config.metrics.set] ?? [];

    resolved = expanded.length > 0 ? [...expanded] : [...config.metrics.sections];
  }
  else {
    resolved = [...config.metrics.sections];
  }

  // Safety net: an unsupported section should never reach the command line,
  // even if it slipped into a saved config from an older version.
  return resolved.filter((s) => !DATA_COLLECTION_UNSUPPORTED_SECTIONS.has(s));
}

/**
 * Build a sensible default `commandLine` text from the structured metrics/common
 * selections. Only npu-compute (on-board) consumes metric flags, and it accepts
 * one repeated `--section <id>` per section (no `--set`, no comma/space lists —
 * npu-compute使用文档.md §7). Simulation (npu-emulate) takes no section/set flags, so
 * metrics contribute nothing to its command line.
 */
export function buildDefaultCommandLine(config: DataCollectionConfig): string {
  const tokens: string[] = [];

  if (config.collectionType === 'onboard') {
    resolveSelectedSections(config)
      .forEach((section) => {
        tokens.push(`--section ${section}`);
      });

    if (config.common.forceOverwrite) {
      tokens.push('--force');
    }
  }

  return tokens.join(' ');
}

/**
 * Fresh dialog config for a given collection type. The Common panel keeps the
 * prototype's single-choice defaults; Metrics starts on the `basic` set and the
 * `commandLine` text is seeded from those selections (user-editable afterwards).
 */
export function buildDefaultDataCollectionConfig(collectionType: CollectionType): DataCollectionConfig {
  const config: DataCollectionConfig = {
    collectionType,
    common: {
      outputFile: '',
      forceOverwrite: false,
      targetProcesses: 'all',
      replayMode: 'application',
      applicationReplayBuffer: 'file',
      applicationReplayMode: 'balanced',
      commandLine: '',
    },
    metrics: {
      kind: 'set',
      set: 'basic',
      sections: [...DATA_COLLECTION_SET_SECTIONS.basic],
    },
  };

  config.common.commandLine = buildDefaultCommandLine(config);

  return config;
}

/**
 * Relative (dotted) workspace-setting key the dialog config for a collection type
 * is persisted under, so reopening the dialog restores the last confirmed config.
 * Kept per collection type because on-board (npu-compute) and simulation (npu-emulate)
 * carry different option sets — one shared blob would leak the other tool's args.
 */
export function dataCollectionConfigSettingKey(collectionType: CollectionType): string {
  return `performanceTuning.dataCollection.${collectionType}`;
}

/**
 * Merge a previously saved config over the fresh default for a collection type.
 * The saved value is treated as untrusted (it comes from a hand-editable
 * settings.json), so every field is validated against the defaults and only
 * recognized shapes are adopted; anything missing or malformed keeps the default.
 * `collectionType` always comes from the caller (which side the dialog opened),
 * never from the saved blob.
 */
export function mergeSavedDataCollectionConfig(
  collectionType: CollectionType,
  saved: unknown,
): DataCollectionConfig {
  const config = buildDefaultDataCollectionConfig(collectionType);

  if (!saved || typeof saved !== 'object') {
    return config;
  }

  const savedCommon = (saved as { common?: unknown }).common;

  if (savedCommon && typeof savedCommon === 'object') {
    const c = savedCommon as Record<string, unknown>;

    if (typeof c.outputFile === 'string') {
      config.common.outputFile = c.outputFile;
    }

    if (typeof c.forceOverwrite === 'boolean') {
      config.common.forceOverwrite = c.forceOverwrite;
    }

    if (typeof c.commandLine === 'string') {
      config.common.commandLine = c.commandLine;
    }
  }

  const savedMetrics = (saved as { metrics?: unknown }).metrics;

  if (savedMetrics && typeof savedMetrics === 'object') {
    const m = savedMetrics as Record<string, unknown>;

    if (m.kind === 'section' || m.kind === 'set') {
      config.metrics.kind = m.kind;
    }

    if (typeof m.set === 'string'
      && DATA_COLLECTION_SETS.includes(m.set)
      && !DATA_COLLECTION_UNSUPPORTED_SETS.has(m.set)
    ) {
      config.metrics.set = m.set;
    }

    if (Array.isArray(m.sections)) {
      config.metrics.sections = m.sections
        .filter((s): s is string => typeof s === 'string')
        .filter((s) => !DATA_COLLECTION_UNSUPPORTED_SECTIONS.has(s));
    }
  }

  return config;
}
