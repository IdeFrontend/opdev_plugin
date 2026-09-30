/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import {
  ON_BOARD_METRIC_LEGACY_TO_DOTTED,
  SIMULATE_METRIC_LEGACY_TO_DOTTED,
  collectDottedEntriesFromLegacyPairs,
  readLegacyFieldsFromDottedPairs,
} from '@plugin/helpers/workspace-user-options-dotted-map';

describe('workspace-user-options-dotted-map', () => {
  it('maps on_board legacy metrics to dotted keys and back', () => {
    const legacy = {
      Occupancy: true,
      Roofline: false,
      KernelScale: true,
    };
    const dottedEntries = collectDottedEntriesFromLegacyPairs(ON_BOARD_METRIC_LEGACY_TO_DOTTED, legacy);
    const store = Object.fromEntries(dottedEntries);
    const roundTrip: Record<string, unknown> = {};

    readLegacyFieldsFromDottedPairs(
      ON_BOARD_METRIC_LEGACY_TO_DOTTED,
      (key) => store[key],
      roundTrip,
      (obj, key, value) => {
        if (value !== undefined) {
          obj[key] = value;
        }
      },
    );
    expect(roundTrip.Occupancy)
      .toBe(true);
    expect(roundTrip.Roofline)
      .toBe(false);
    expect(roundTrip.KernelScale)
      .toBe(true);
  });

  it('maps simulate legacy metrics to dotted keys', () => {
    const entries = collectDottedEntriesFromLegacyPairs(SIMULATE_METRIC_LEGACY_TO_DOTTED, {
      PMSampling: true,
      ResourceConflictRatio: false,
    });

    expect(entries)
      .toEqual([
        [
          'performanceTuning.simulation.memoryThroughputWaveform',
          true,
        ],
        [
          'performanceTuning.simulation.resourceConflictRatio',
          false,
        ],
      ]);
  });
});
