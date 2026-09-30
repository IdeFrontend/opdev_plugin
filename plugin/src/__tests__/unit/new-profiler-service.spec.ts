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
  it('builds "npu-emulate collect --output <report> <target>" with defaults', () => {
    const cmd = buildNpuEmulateCommand({
      config: configWithSections('simulate'),
      targetFile,
      opprofRunDir,
    });

    expect(cmd)
      .toBe(`npu-emulate collect --output ${opprofRunDir}/${NEW_TOOL_REPORT_FILENAME} ${targetFile}`);
  });

  it('ignores commandLine text — collect currently takes no extra args', () => {
    const cmd = buildNpuEmulateCommand({
      config: configWithCommandLine('simulate', '--section Memory -s Ascend950 -g'),
      targetFile,
      opprofRunDir,
    });

    expect(cmd)
      .toBe(`npu-emulate collect --output ${opprofRunDir}/${NEW_TOOL_REPORT_FILENAME} ${targetFile}`);
  });

  it('omits the trailing target when it is empty', () => {
    const cmd = buildNpuEmulateCommand({
      config: configWithCommandLine('simulate', ''),
      targetFile: '',
      opprofRunDir,
    });

    expect(cmd)
      .toBe(`npu-emulate collect --output ${opprofRunDir}/${NEW_TOOL_REPORT_FILENAME}`);
  });
});
