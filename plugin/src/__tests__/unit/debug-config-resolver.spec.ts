/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import type { OperatorBuildBehavior } from '@plugin/domain/plugins/operator-plugin.interface';
import { TritonPlugin } from '@plugin/domain/plugins/triton.plugin';
import {
  DEBUG_LAUNCH_CONFIG,
  isPythonDebugLaunchConfig,
  resolveDebugLaunchConfigName,
} from '@plugin/domain/utils/debug-config-resolver';

const defaultBehavior: OperatorBuildBehavior = {
  requiresBuildBeforeAnalysis: true,
  requiresActiveFileCheck: false,
};

describe('resolveDebugLaunchConfigName', () => {
  it('maps triton NPU debug to msdebug-triton-npu', () => {
    expect(resolveDebugLaunchConfigName('triton', 'npu', defaultBehavior))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG_TRITON_NPU);
  });

  it('maps triton to msdebug-triton-npu only (no CPU debug)', () => {
    expect(resolveDebugLaunchConfigName('triton', 'cpu', defaultBehavior))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG_TRITON_NPU);
    expect(resolveDebugLaunchConfigName('triton', 'npu', defaultBehavior))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG_TRITON_NPU);
  });

  it('maps cann torch_library to msdebug-python for CPU and NPU', () => {
    expect(resolveDebugLaunchConfigName(
      'cann',
      'npu',
      defaultBehavior,
      'torch_library_template',
    ))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG_PYTHON);

    expect(resolveDebugLaunchConfigName(
      'cann',
      'cpu',
      defaultBehavior,
      'torch_library_template',
    ))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG_PYTHON);
  });

  it('maps canonical torch-library + template to msdebug-python for CPU and NPU (settings-native openProject storage)', () => {
    expect(resolveDebugLaunchConfigName(
      'torch-library',
      'npu',
      defaultBehavior,
      'torch_library_template',
    ))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG_PYTHON);

    expect(resolveDebugLaunchConfigName(
      'torch-library',
      'cpu',
      defaultBehavior,
      'torch_library_template',
    ))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG_PYTHON);
  });

  it('maps default ascend/cann projects to binary msdebug configs', () => {
    expect(resolveDebugLaunchConfigName('cann', 'npu', defaultBehavior))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG);

    expect(resolveDebugLaunchConfigName('ascend', 'cpu', defaultBehavior))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG_CPU);
  });

  it('does not use the broken ascend+torch_library combination', () => {
    expect(resolveDebugLaunchConfigName(
      'ascend',
      'npu',
      defaultBehavior,
      'torch_library_template',
    ))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG);
  });

  it('maps remote NPU debug to remote-debug', () => {
    expect(resolveDebugLaunchConfigName('cann', 'npu', defaultBehavior, undefined, true))
      .toBe(DEBUG_LAUNCH_CONFIG.REMOTE_MSDEBUG);
  });

  it('keeps local NPU debug as msdebug when remote is unset', () => {
    expect(resolveDebugLaunchConfigName('cann', 'npu', defaultBehavior, undefined, false))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG);
  });

  it('falls back to binary configs for an unset project type', () => {
    expect(resolveDebugLaunchConfigName(undefined, 'npu', defaultBehavior))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG);
    expect(resolveDebugLaunchConfigName(undefined, 'cpu', defaultBehavior))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG_CPU);
    expect(resolveDebugLaunchConfigName(null, 'npu', defaultBehavior))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG);
  });

  it('trims whitespace from project type and template values', () => {
    expect(resolveDebugLaunchConfigName(' triton ', 'npu', defaultBehavior))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG_TRITON_NPU);
    expect(resolveDebugLaunchConfigName(
      '  cann  ',
      'cpu',
      defaultBehavior,
      ' torch_library_template ',
    ))
      .toBe(DEBUG_LAUNCH_CONFIG.MSDEBUG_PYTHON);
  });
});

describe('isPythonDebugLaunchConfig', () => {
  it('recognizes python-based msdebug launch profiles', () => {
    expect(isPythonDebugLaunchConfig(DEBUG_LAUNCH_CONFIG.MSDEBUG_PYTHON))
      .toBe(true);
    expect(isPythonDebugLaunchConfig(DEBUG_LAUNCH_CONFIG.MSDEBUG_TRITON_NPU))
      .toBe(true);
  });

  it('excludes binary msdebug profiles', () => {
    expect(isPythonDebugLaunchConfig(DEBUG_LAUNCH_CONFIG.MSDEBUG))
      .toBe(false);
    expect(isPythonDebugLaunchConfig(DEBUG_LAUNCH_CONFIG.MSDEBUG_CPU))
      .toBe(false);
    expect(isPythonDebugLaunchConfig(DEBUG_LAUNCH_CONFIG.REMOTE_MSDEBUG))
      .toBe(false);
    expect(isPythonDebugLaunchConfig('anything-else'))
      .toBe(false);
  });
});

describe('triton buildBehavior flags', () => {
  it('hides NPU debug in UI while keeping debug script implementation', () => {
    const plugin = new TritonPlugin();

    expect(plugin.buildBehavior.supportsCpuDebug)
      .toBe(false);
    expect(plugin.buildBehavior.supportsNpuDebug)
      .toBe(false);
    expect(plugin.buildBehavior.supportsNpuPythonDebug)
      .toBe(true);
  });

  it('seeds Triton-specific debug compile env on debug scripts', () => {
    const plugin = new TritonPlugin();
    const scripts = plugin.getInitialConfigScripts(
      { op_name: 'vector_add' } as Parameters<typeof plugin.getInitialConfigScripts>[0],
      '/tmp/ws',
    );

    expect(scripts.cpuDebugScript)
      .toBe('python3 ./vector_add.py');
    expect(scripts.npuDebugScript)
      .toContain('TRITON_DISABLE_CACHE=1');
    expect(scripts.npuDebugScript)
      .toContain('TRITON_DISABLE_LINE_INFO=false');
    expect(scripts.npuDebugScript)
      .toContain('LLVM_EXTRACT_DI_LOCAL_VARIABLES=1');
  });
});
