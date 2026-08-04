import type { OperatorBuildBehavior } from '@plugin/domain/plugins/operator-plugin.interface';

export const DEBUG_LAUNCH_CONFIG = {
  MSDEBUG: 'msdebug',
  REMOTE_MSDEBUG: 'remote-debug',
  MSDEBUG_CPU: 'msdebug-cpu',
  MSDEBUG_PYTHON: 'msdebug-python',
  MSDEBUG_TRITON_NPU: 'msdebug-triton-npu',
} as const;

export type DebugLaunchConfigName =
  typeof DEBUG_LAUNCH_CONFIG[keyof typeof DEBUG_LAUNCH_CONFIG];

const PYTHON_LAUNCH_CONFIGS: ReadonlySet<string> = new Set([
  DEBUG_LAUNCH_CONFIG.MSDEBUG_PYTHON,
  DEBUG_LAUNCH_CONFIG.MSDEBUG_TRITON_NPU,
]);

const TORCH_LIBRARY_TEMPLATE = 'torch_library_template';

/** Launch configs that patch `target` / `targetArgs` / `cwd` instead of a binary path. */
export function isPythonDebugLaunchConfig(configName: string): boolean {
  return PYTHON_LAUNCH_CONFIGS.has(configName);
}

/**
 * Map stored project_type + template to a launch.json configuration name.
 * Uses persisted values from getProjectType(), not detection enum strings.
 */
export function resolveDebugLaunchConfigName(
  projectType: string | null | undefined,
  mode: 'cpu' | 'npu',
  _buildBehavior: OperatorBuildBehavior,
  projectTemplateName?: string,
  remote?: boolean,
): DebugLaunchConfigName {
  const pt = (projectType ?? '').trim();
  const template = (projectTemplateName ?? '').trim();

  if (pt === 'triton') {
    return DEBUG_LAUNCH_CONFIG.MSDEBUG_TRITON_NPU;
  }

  const isTorchLibrary = pt === 'cann' && template === TORCH_LIBRARY_TEMPLATE;

  if (isTorchLibrary) {
    return DEBUG_LAUNCH_CONFIG.MSDEBUG_PYTHON;
  }

  if (mode === 'cpu') {
    return DEBUG_LAUNCH_CONFIG.MSDEBUG_CPU;
  }

  return remote
    ? DEBUG_LAUNCH_CONFIG.REMOTE_MSDEBUG
    : DEBUG_LAUNCH_CONFIG.MSDEBUG;
}
