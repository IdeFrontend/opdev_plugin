/**
 * Unit tests for the shared "数据采集配置" (Data Collection Config) helpers that back
 * the A5 new-tool dialog: the Metrics table set↔section linkage
 * (describeDataCollectionSet / matchSetForSections), the default command-line
 * seeding (buildDefaultCommandLine), and the fresh-config factory
 * (buildDefaultDataCollectionConfig). These are pure functions consumed by both
 * the plugin (command generation) and the web panel (the form).
 */

import {
  DATA_COLLECTION_SET_SECTIONS,
  DATA_COLLECTION_SET_CUSTOM_DESC,
  DATA_COLLECTION_SET_UNSUPPORTED,
  describeDataCollectionSet,
  matchSetForSections,
  resolveSelectedSections,
  buildDefaultCommandLine,
  buildDefaultDataCollectionConfig,
  dataCollectionConfigSettingKey,
  mergeSavedDataCollectionConfig,
  type DataCollectionConfig,
} from '@shared/data-collection-config';

describe('describeDataCollectionSet', () => {
  it('returns the Custom placeholder for the free-form set', () => {
    expect(describeDataCollectionSet('Custom'))
      .toBe(DATA_COLLECTION_SET_CUSTOM_DESC);
  });

  it('joins the expansion with ";" for a supported set', () => {
    expect(describeDataCollectionSet('basic'))
      .toBe('PipeUtilization;L2Cache;Memory');
    expect(describeDataCollectionSet('full'))
      .toBe('PipeUtilization;Pipeline;L2Cache;Memory;MemoryL0;MemoryUB;ArithmeticUtilization;ResourceConflictRatio');
  });

  it('returns the "暂不支持" placeholder for sets with no expansion', () => {
    expect(describeDataCollectionSet('detailed'))
      .toBe(DATA_COLLECTION_SET_UNSUPPORTED);
    expect(describeDataCollectionSet('hccl'))
      .toBe(DATA_COLLECTION_SET_UNSUPPORTED);
    expect(describeDataCollectionSet('roofline'))
      .toBe(DATA_COLLECTION_SET_UNSUPPORTED);
  });

  it('treats an unknown set as unsupported (empty expansion)', () => {
    expect(describeDataCollectionSet('nope'))
      .toBe(DATA_COLLECTION_SET_UNSUPPORTED);
  });
});

describe('matchSetForSections', () => {
  it('matches a supported set regardless of section order', () => {
    // basic = PipeUtilization;L2Cache;Memory — shuffle the order.
    expect(matchSetForSections([
      'Memory',
      'L2Cache',
      'PipeUtilization',
    ]))
      .toBe('basic');
  });

  it('matches the full set from its 8-section expansion', () => {
    expect(matchSetForSections([...DATA_COLLECTION_SET_SECTIONS.full]))
      .toBe('full');
  });

  it('falls back to Custom when no supported set matches', () => {
    // Superset of basic → not an exact match for any preset.
    expect(matchSetForSections([
      'Pipeline',
      'PipeUtilization',
      'L2Cache',
      'Memory',
      'MemoryL0',
    ]))
      .toBe('Custom');
    expect(matchSetForSections([]))
      .toBe('Custom');
  });

  it('round-trips describe → match for every supported set', () => {
    ([
      'basic',
      'full',
    ] as const).forEach((set) => {
      const sections = DATA_COLLECTION_SET_SECTIONS[set];

      expect(matchSetForSections([...sections]))
        .toBe(set);
    });
  });
});

describe('resolveSelectedSections', () => {
  const base = (): DataCollectionConfig => buildDefaultDataCollectionConfig('onboard');

  it('expands a named set into its sections', () => {
    const config = base();

    config.metrics = {
      kind: 'set',
      set: 'basic',
      sections: [],
    };

    expect(resolveSelectedSections(config))
      .toEqual([...DATA_COLLECTION_SET_SECTIONS.basic]);
  });

  it('uses the checked sections for Custom', () => {
    const config = base();

    config.metrics = {
      kind: 'set',
      set: 'Custom',
      sections: [
        'Memory',
        'MemoryUB',
      ],
    };

    expect(resolveSelectedSections(config))
      .toEqual([
        'Memory',
        'MemoryUB',
      ]);
  });

  it('uses the checked sections in section mode', () => {
    const config = base();

    config.metrics = {
      kind: 'section',
      sections: ['L2Cache'],
    };

    expect(resolveSelectedSections(config))
      .toEqual(['L2Cache']);
  });

  it('passes all sections through (all sections are now supported)', () => {
    const config = base();

    config.metrics = {
      kind: 'section',
      sections: [
        'Pipeline',
        'L2Cache',
        'ArithmeticUtilization',
      ],
    };

    expect(resolveSelectedSections(config))
      .toEqual([
        'Pipeline',
        'L2Cache',
        'ArithmeticUtilization',
      ]);
  });

  it('falls back to checked sections for an unsupported (empty) set', () => {
    const config = base();

    config.metrics = {
      kind: 'set',
      set: 'hccl',
      sections: ['L2Cache'],
    };

    expect(resolveSelectedSections(config))
      .toEqual(['L2Cache']);
  });
});

describe('buildDefaultCommandLine', () => {
  const base = (): DataCollectionConfig => buildDefaultDataCollectionConfig('onboard');

  it('expands a named (non-Custom) set into repeated --section flags (no --set)', () => {
    const config = base();

    config.metrics = {
      kind: 'set',
      set: 'basic',
      sections: [],
    };

    // npu-compute has no --set; basic = PipeUtilization;L2Cache;Memory.
    expect(buildDefaultCommandLine(config))
      .toBe('--section PipeUtilization --section L2Cache --section Memory');
    expect(buildDefaultCommandLine(config))
      .not.toContain('--set');
  });

  it('emits a "--section" token per section for section mode', () => {
    const config = base();

    config.metrics = {
      kind: 'section',
      sections: [
        'L2Cache',
        'Memory',
      ],
    };

    expect(buildDefaultCommandLine(config))
      .toBe('--section L2Cache --section Memory');
  });

  it('falls back to the checked sections when set is Custom', () => {
    const config = base();

    config.metrics = {
      kind: 'set',
      set: 'Custom',
      sections: ['MemoryUB'],
    };

    expect(buildDefaultCommandLine(config))
      .toBe('--section MemoryUB');
  });

  it('appends --force when forceOverwrite is on', () => {
    const config = base();

    config.metrics = {
      kind: 'set',
      set: 'Custom',
      sections: ['Memory'],
    };
    config.common.forceOverwrite = true;

    expect(buildDefaultCommandLine(config))
      .toBe('--section Memory --force');
  });

  it('emits no metric flags for simulate (npu-emulate takes no --section/--set)', () => {
    const config = buildDefaultDataCollectionConfig('simulate');

    config.metrics = {
      kind: 'set',
      set: 'basic',
      sections: [],
    };

    expect(buildDefaultCommandLine(config))
      .toBe('');
  });
});

describe('buildDefaultDataCollectionConfig', () => {
  it('carries the requested collection type', () => {
    expect(buildDefaultDataCollectionConfig('simulate').collectionType)
      .toBe('simulate');
    expect(buildDefaultDataCollectionConfig('onboard').collectionType)
      .toBe('onboard');
  });

  it('seeds Metrics on the basic set with its expanded sections', () => {
    const config = buildDefaultDataCollectionConfig('onboard');

    expect(config.metrics.kind)
      .toBe('set');
    expect(config.metrics.set)
      .toBe('basic');
    expect(config.metrics.sections)
      .toEqual([...DATA_COLLECTION_SET_SECTIONS.basic]);
  });

  it('seeds commandLine from the default selections (basic expanded to --section)', () => {
    expect(buildDefaultDataCollectionConfig('onboard').common.commandLine)
      .toBe('--section PipeUtilization --section L2Cache --section Memory');
  });

  it('seeds an empty commandLine for simulate (npu-emulate takes no metric flags)', () => {
    expect(buildDefaultDataCollectionConfig('simulate').common.commandLine)
      .toBe('');
  });

  it('defaults the Common panel to the prototype single choices', () => {
    const { common } = buildDefaultDataCollectionConfig('onboard');

    expect(common.targetProcesses)
      .toBe('all');
    expect(common.replayMode)
      .toBe('application');
    expect(common.applicationReplayBuffer)
      .toBe('file');
    expect(common.applicationReplayMode)
      .toBe('balanced');
    expect(common.forceOverwrite)
      .toBe(false);
  });
});

describe('dataCollectionConfigSettingKey', () => {
  it('keys the persisted config per collection type', () => {
    expect(dataCollectionConfigSettingKey('onboard'))
      .toBe('performanceTuning.dataCollection.onboard');
    expect(dataCollectionConfigSettingKey('simulate'))
      .toBe('performanceTuning.dataCollection.simulate');
  });
});

describe('mergeSavedDataCollectionConfig', () => {
  it('returns the fresh default when nothing was saved', () => {
    expect(mergeSavedDataCollectionConfig('onboard', undefined))
      .toEqual(buildDefaultDataCollectionConfig('onboard'));
    expect(mergeSavedDataCollectionConfig('simulate', null))
      .toEqual(buildDefaultDataCollectionConfig('simulate'));
  });

  it('restores the saved common + metrics over the default', () => {
    const saved = {
      collectionType: 'onboard',
      common: {
        outputFile: '/tmp/out.npu-rep',
        forceOverwrite: true,
        commandLine: '--section Memory --force',
      },
      metrics: {
        kind: 'set',
        set: 'full',
        sections: [...DATA_COLLECTION_SET_SECTIONS.full],
      },
    };

    const merged = mergeSavedDataCollectionConfig('onboard', saved);

    expect(merged.common.outputFile)
      .toBe('/tmp/out.npu-rep');
    expect(merged.common.forceOverwrite)
      .toBe(true);
    // A hand-edited commandLine is preserved verbatim (not re-derived).
    expect(merged.common.commandLine)
      .toBe('--section Memory --force');
    expect(merged.metrics.kind)
      .toBe('set');
    expect(merged.metrics.set)
      .toBe('full');
    expect(merged.metrics.sections)
      .toEqual([...DATA_COLLECTION_SET_SECTIONS.full]);
  });

  it('takes collectionType from the caller, never from the saved blob', () => {
    const merged = mergeSavedDataCollectionConfig('simulate', { collectionType: 'onboard' });

    expect(merged.collectionType)
      .toBe('simulate');
  });

  it('ignores malformed fields and keeps the defaults', () => {
    const base = buildDefaultDataCollectionConfig('onboard');
    const merged = mergeSavedDataCollectionConfig('onboard', {
      common: {
        outputFile: 123,
        forceOverwrite: 'yes',
        commandLine: null,
      },
      metrics: {
        kind: 'nonsense',
        set: 'notASet',
        sections: 'notAnArray',
      },
    });

    expect(merged.common.outputFile)
      .toBe(base.common.outputFile);
    expect(merged.common.forceOverwrite)
      .toBe(base.common.forceOverwrite);
    expect(merged.common.commandLine)
      .toBe(base.common.commandLine);
    expect(merged.metrics.kind)
      .toBe(base.metrics.kind);
    expect(merged.metrics.set)
      .toBe(base.metrics.set);
    expect(merged.metrics.sections)
      .toEqual(base.metrics.sections);
  });

  it('drops non-string entries from a saved sections array', () => {
    const merged = mergeSavedDataCollectionConfig('onboard', {
      metrics: {
        kind: 'section',
        sections: [
          'Memory',
          42,
          'L2Cache',
          null,
        ],
      },
    });

    expect(merged.metrics.sections)
      .toEqual([
        'Memory',
        'L2Cache',
      ]);
  });

  it('keeps all sections from a saved config (all sections are now supported)', () => {
    const merged = mergeSavedDataCollectionConfig('onboard', {
      metrics: {
        kind: 'section',
        sections: [
          'Pipeline',
          'Memory',
          'ArithmeticUtilization',
          'ResourceConflictRatio',
        ],
      },
    });

    expect(merged.metrics.sections)
      .toEqual([
        'Pipeline',
        'Memory',
        'ArithmeticUtilization',
        'ResourceConflictRatio',
      ]);
  });
});
