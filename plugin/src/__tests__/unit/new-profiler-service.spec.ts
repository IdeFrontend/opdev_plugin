/**
 * Unit tests for the A5 new-tool command builders (new-profiler-service):
 * buildNpuComputeCommand (on-board → npu-compute) and buildNpuEmulateCommand
 * (simulation → npu-emulate, renamed from npusim). The dialog's
 * common.commandLine is authoritative for tool args; the builders only augment
 * it with the report output path and the compiled target, and never overwrite
 * an option the user already typed.
 */

import {
  buildNpuComputeCommand,
  buildNpuEmulateCommand,
  NPU_EMULATE_SOC_VERSION,
} from '@plugin/domain/services/new-profiler-service';
import {
  NEW_TOOL_REPORT_FILENAME,
  buildDefaultDataCollectionConfig,
  type DataCollectionConfig,
} from '@shared/data-collection-config';

const opprofRunDir = '/ws/.mstt/opprof/run-1';
const targetFile = '/ws/build_out/op_test';

const configWithSections = (collectionType: 'onboard' | 'simulate'): DataCollectionConfig =>
  buildDefaultDataCollectionConfig(collectionType);

const configWithCommandLine = (collectionType: 'onboard' | 'simulate', commandLine: string): DataCollectionConfig => {
  const config = buildDefaultDataCollectionConfig(collectionType);

  config.common.commandLine = commandLine;

  return config;
};

describe('buildNpuComputeCommand', () => {
  it('builds --section flags from the booleans (sections param), then --export + target', () => {
    const cmd = buildNpuComputeCommand({
      config: configWithSections('onboard'),
      targetFile,
      opprofRunDir,
      sections: ['Pipeline'],
    });

    expect(cmd)
      .toBe(`npu-compute --section Pipeline --export ${opprofRunDir}/${NEW_TOOL_REPORT_FILENAME} ${targetFile}`);
  });

  it('orders multiple sections per DATA_COLLECTION_SECTIONS and dedupes', () => {
    const cmd = buildNpuComputeCommand({
      config: configWithSections('onboard'),
      targetFile,
      opprofRunDir,
      sections: [
        'Memory',
        'Pipeline',
        'Memory',
      ],
    });

    expect(cmd)
      .toBe(`npu-compute --section Pipeline --section Memory --export ${opprofRunDir}/${NEW_TOOL_REPORT_FILENAME} ${targetFile}`);
  });

  it('omits section flags but still emits --export when no section is selected', () => {
    const cmd = buildNpuComputeCommand({
      config: configWithSections('onboard'),
      targetFile,
      opprofRunDir,
      sections: [],
    });

    expect(cmd)
      .toBe(`npu-compute --export ${opprofRunDir}/${NEW_TOOL_REPORT_FILENAME} ${targetFile}`);
  });

  it('defaults sections to empty when the param is omitted', () => {
    const cmd = buildNpuComputeCommand({
      config: configWithSections('onboard'),
      targetFile,
      opprofRunDir,
    });

    expect(cmd)
      .toBe(`npu-compute --export ${opprofRunDir}/${NEW_TOOL_REPORT_FILENAME} ${targetFile}`);
  });
});

describe('buildNpuEmulateCommand', () => {
  it('builds "npu-emulate record <target> <args> -s <soc> -o <dir> -g" with defaults', () => {
    const cmd = buildNpuEmulateCommand({
      config: configWithCommandLine('simulate', '--section Memory'),
      targetFile,
      opprofRunDir,
    });

    expect(cmd)
      .toBe(`npu-emulate record ${targetFile} --section Memory -s ${NPU_EMULATE_SOC_VERSION} -o ${opprofRunDir} -g`);
  });

  it('does not duplicate -s / -o / -g when the user already supplied them', () => {
    const cmd = buildNpuEmulateCommand({
      config: configWithCommandLine('simulate', '-s Ascend950 -o /tmp/sim -g'),
      targetFile,
      opprofRunDir,
    });

    // Exactly one -g / -s / -o each (the user's), and our default -o dir is not appended.
    expect(cmd.match(/\s-g(\s|$)/g))
      .toHaveLength(1);
    expect(cmd.match(/\s-s\s/g))
      .toHaveLength(1);
    expect(cmd)
      .not.toContain(`-o ${opprofRunDir}`);
  });

  it('recognizes long-form --soc-version / --output / --gen-report', () => {
    const cmd = buildNpuEmulateCommand({
      config: configWithCommandLine('simulate', '--soc-version Ascend950 --output /tmp/sim --gen-report'),
      targetFile,
      opprofRunDir,
    });

    expect(cmd)
      .not.toContain(`-s ${NPU_EMULATE_SOC_VERSION}`);
    expect(cmd)
      .not.toContain(`-o ${opprofRunDir}`);
    expect(cmd)
      .not.toMatch(/\s-g(\s|$)/);
  });

  it('places the compiled target as the first positional after record', () => {
    const cmd = buildNpuEmulateCommand({
      config: configWithCommandLine('simulate', ''),
      targetFile,
      opprofRunDir,
    });

    expect(cmd.startsWith(`npu-emulate record ${targetFile}`))
      .toBe(true);
  });
});
