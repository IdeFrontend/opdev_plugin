/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Shared persisted `user_options` key ↔ workspace dotted settings key mappings.
 * Used by the import/webview writes (row → dotted) and runtime reads (dotted → row shape).
 */

export type LegacyDottedPair = readonly [legacyKey: string, dottedKey: string];

/** On-board profiler metrics (excludes A5-gated pcSampling / cacheHeatmap). */
export const ON_BOARD_METRIC_LEGACY_TO_DOTTED: readonly LegacyDottedPair[] = [
  [
    'Occupancy',
    'performanceTuning.onBoard.interCoreLoad',
  ],
  [
    'Roofline',
    'performanceTuning.onBoard.roofline',
  ],
  [
    'Source',
    'performanceTuning.onBoard.operatorCodeHotspot',
  ],
  [
    'ArithmeticUtilization',
    'performanceTuning.onBoard.cubeAndVectorInstructionTimeAndRatio',
  ],
  [
    'L2Cache',
    'performanceTuning.onBoard.l2CacheHitRate',
  ],
  [
    'Memory',
    'performanceTuning.onBoard.memoryReadWriteBandwidth',
  ],
  [
    'MemoryL0',
    'performanceTuning.onBoard.l0ReadWriteBandwidth',
  ],
  [
    'MemoryUB',
    'performanceTuning.onBoard.ubReadWriteBandwidth',
  ],
  [
    'PipeUtilization',
    'performanceTuning.onBoard.computeAndMoveUnitTimeRatio',
  ],
  [
    'ResourceConflictRatio',
    'performanceTuning.onBoard.resourceConflictRatio',
  ],
  [
    'KernelScale',
    'performanceTuning.onBoard.enableKernelCodeSegmentProfiling',
  ],
];

export const SIMULATE_METRIC_LEGACY_TO_DOTTED: readonly LegacyDottedPair[] = [
  [
    'PMSampling',
    'performanceTuning.simulation.memoryThroughputWaveform',
  ],
  [
    'ResourceConflictRatio',
    'performanceTuning.simulation.resourceConflictRatio',
  ],
];

export function readLegacyFieldsFromDottedPairs(
  pairs: readonly LegacyDottedPair[],
  readDotted: (dottedKey: string)=> unknown,
  target: Record<string, unknown>,
  setIfDefined: (obj: Record<string, unknown>, key: string, value: unknown)=> void,
): void {
  for (const [
    legacy,
    dotted,
  ] of pairs) {
    setIfDefined(target, legacy, readDotted(dotted));
  }
}

export function collectDottedEntriesFromLegacyPairs(
  pairs: readonly LegacyDottedPair[],
  opts: Record<string, unknown>,
): Array<[dottedKey: string, value: unknown]> {
  const entries: Array<[string, unknown]> = [];

  for (const [
    legacy,
    dotted,
  ] of pairs) {
    const value = opts[legacy];

    if (value !== undefined) {
      entries.push([
        dotted,
        value,
      ]);
    }
  }

  return entries;
}
