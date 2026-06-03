import {
  ON_BOARD_METRIC_LEGACY_TO_DOTTED,
  SIMULATE_METRIC_LEGACY_TO_DOTTED,
  collectDottedEntriesFromLegacyPairs,
  readLegacyFieldsFromDottedPairs,
} from '@plugin/helpers/workspace-user-options-dotted-map';

describe('workspace-user-options-dotted-map', () => {
  it('maps on_board legacy metrics to dotted keys and back', () => {
    const legacy = { Occupancy: true, Roofline: false, KernelScale: true };
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
    expect(roundTrip.Occupancy).toBe(true);
    expect(roundTrip.Roofline).toBe(false);
    expect(roundTrip.KernelScale).toBe(true);
  });

  it('maps simulate legacy metrics to dotted keys', () => {
    const entries = collectDottedEntriesFromLegacyPairs(SIMULATE_METRIC_LEGACY_TO_DOTTED, {
      PMSampling: true,
      ResourceConflictRatio: false,
    });
    expect(entries).toEqual([
      ['performanceTuning.simulation.memoryThroughputWaveform', true],
      ['performanceTuning.simulation.resourceConflictRatio', false],
    ]);
  });
});
