/**
 * Debug routing matrix: for every supported project type, the stored
 * projectType (+ template for torch_library) must map to the SAME launch.json
 * configuration name as the resolver, in BOTH debug modes (NPU and CPU).
 *
 * This pins the matrix — a future change to the stored type conventions must
 * not silently change which debugger (msdebug C/C++, msdebug-cpu,
 * msdebug-python, msdebug-triton-npu) a project type launches.
 */
import type { OperatorBuildBehavior } from '@plugin/domain/plugins/operator-plugin.interface';
import {
  DEBUG_LAUNCH_CONFIG,
  resolveDebugLaunchConfigName,
} from '@plugin/domain/utils/debug-config-resolver';

const defaultBehavior: OperatorBuildBehavior = {
  requiresBuildBeforeAnalysis: true,
  requiresActiveFileCheck: false,
};

type RoutingRow = {
  /** Stable display name of the project type (the 6 supported types). */
  type: string;
  /** Stored projectType value(s) that occur for this type on the branch. */
  storedProjectTypes: string[];
  /** Stored template for torch_library rows, '' otherwise. */
  template: string;
  /** Expected config name per mode — the pinned routing. */
  expected: {
    npu: string;
    cpu: string;
  };
};

const BASE_ROUTING_MATRIX: RoutingRow[] = [
  {
    type: 'cann',
    storedProjectTypes: ['cann'],
    template: '',
    expected: {
      npu: DEBUG_LAUNCH_CONFIG.MSDEBUG,
      cpu: DEBUG_LAUNCH_CONFIG.MSDEBUG_CPU,
    },
  },
  {
    type: 'ascend',
    storedProjectTypes: [
      'ascend',
      'ascend-c',
    ],
    template: '',
    expected: {
      npu: DEBUG_LAUNCH_CONFIG.MSDEBUG,
      cpu: DEBUG_LAUNCH_CONFIG.MSDEBUG_CPU,
    },
  },
  {
    type: 'pyasc',
    storedProjectTypes: ['pyasc'],
    template: '',
    expected: {
      npu: DEBUG_LAUNCH_CONFIG.MSDEBUG,
      cpu: DEBUG_LAUNCH_CONFIG.MSDEBUG_CPU,
    },
  },
  {
    type: 'triton',
    storedProjectTypes: ['triton'],
    template: '',
    expected: {
      npu: DEBUG_LAUNCH_CONFIG.MSDEBUG_TRITON_NPU,
      cpu: DEBUG_LAUNCH_CONFIG.MSDEBUG_TRITON_NPU,
    },
  },
  {
    type: 'torch_library',
    // Freshly created (settings-native openProject): canonical 'torch-library'.
    // Imported from the registry / webview creation: 'cann'.
    storedProjectTypes: [
      'torch-library',
      'cann',
    ],
    template: 'torch_library_template',
    expected: {
      npu: DEBUG_LAUNCH_CONFIG.MSDEBUG_PYTHON,
      cpu: DEBUG_LAUNCH_CONFIG.MSDEBUG_PYTHON,
    },
  },
  {
    type: 'standard-custom',
    storedProjectTypes: [
      'ascend',
      'standard-custom',
    ],
    template: '',
    expected: {
      npu: DEBUG_LAUNCH_CONFIG.MSDEBUG,
      cpu: DEBUG_LAUNCH_CONFIG.MSDEBUG_CPU,
    },
  },
];

describe('debug routing per project type matches the pinned matrix', () => {
  it.each(BASE_ROUTING_MATRIX)(
    '$type (stored $storedProjectTypes) -> NPU $expected.npu, CPU $expected.cpu',
    ({
      storedProjectTypes, template, expected,
    }) => {
      for (const storedType of storedProjectTypes) {
        expect(resolveDebugLaunchConfigName(storedType, 'npu', defaultBehavior, template))
          .toBe(expected.npu);
        expect(resolveDebugLaunchConfigName(storedType, 'cpu', defaultBehavior, template))
          .toBe(expected.cpu);
      }
    },
  );
});
