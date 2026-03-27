import { OperatorPluginRegistry } from './operator-plugin.registry';
import { AscendPlugin } from './ascend.plugin';
import { CannPlugin } from './cann.plugin';
import { PyAscPlugin } from './pyasc.plugin';
import { StandardCustomDetector } from './standard-custom.detector';
import { TorchLibraryDetector } from './torch-library.detector';

/**
 * Register all built-in operator-type plugins and project-type detectors.
 * Called once at extension startup (activate()).
 *
 * Op-type plugins (registerOpPlugin): order doesn't matter.
 * Detectors (registerDetector): order IS significant — detection priority.
 *   1. StandardCustomDetector — 'definitive' build.sh check; must be first
 *   2. TorchLibraryDetector  — heuristic; CMakeLists + .py
 *   3. PyAscPlugin           — heuristic; .py, no CMakeLists
 *   4. AscendPlugin          — heuristic; CMakeLists + .asc
 */
export function registerOperatorPlugins(): void {
  const ascend = new AscendPlugin();
  const cann   = new CannPlugin();
  const pyasc  = new PyAscPlugin();

  // Op-type plugins
  OperatorPluginRegistry.registerOpPlugin(ascend);
  OperatorPluginRegistry.registerOpPlugin(cann);
  OperatorPluginRegistry.registerOpPlugin(pyasc);

  // Detectors in detection-priority order
  OperatorPluginRegistry.registerDetector(new StandardCustomDetector());
  OperatorPluginRegistry.registerDetector(new TorchLibraryDetector());
  OperatorPluginRegistry.registerDetector(pyasc);
  OperatorPluginRegistry.registerDetector(ascend);
}

export { OperatorPluginRegistry } from './operator-plugin.registry';
export type { IOperatorPlugin, OperatorBuildBehavior, OperatorConfigScripts, OperatorDefaultPaths } from './operator-plugin.interface';
export type { IProjectDetector, ProjectDetectionResult } from './project-detector.interface';
export { AbstractOperatorPlugin } from './abstract-operator-plugin';
