/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { OperatorPluginRegistry } from './operator-plugin.registry';
import { AscendPlugin } from './ascend.plugin';
import { CannPlugin } from './cann.plugin';
import { PyAscPlugin } from './pyasc.plugin';
import { TritonPlugin } from './triton.plugin';
import { StandardCustomDetector } from './standard-custom.detector';
import { TorchLibraryDetector } from './torch-library.detector';
import { SettingsLoader } from '@plugin/service/settings-loader';

/**
 * Register all built-in operator-type plugins and project-type detectors.
 * Called once at extension startup (activate()).
 *
 * Op-type plugins (registerOpPlugin): order doesn't matter.
 * Detectors (registerDetector): order IS significant — detection priority.
 *   1. StandardCustomDetector — 'definitive' build.sh --help check; must be first
 *   2. TorchLibraryDetector  — heuristic; CMakeLists + .py
 *   3. TritonPlugin          — heuristic/definitive; marker/dep + triton kernel pattern
 *   4. PyAscPlugin           — heuristic; .py, no CMakeLists
 *   5. AscendPlugin          — heuristic; CMakeLists + .asc
 */
export function registerOperatorPlugins(): void {
  const ascend = new AscendPlugin();
  const cann   = new CannPlugin();
  const pyasc  = new PyAscPlugin();
  const tritonEnabled = SettingsLoader.isOperatorSupportEnabled('triton');
  const triton = tritonEnabled ? new TritonPlugin() : null;

  // Op-type plugins
  OperatorPluginRegistry.registerOpPlugin(ascend);
  OperatorPluginRegistry.registerOpPlugin(cann);
  OperatorPluginRegistry.registerOpPlugin(pyasc);

  if (triton) {
    OperatorPluginRegistry.registerOpPlugin(triton);
  }

  // Detectors in detection-priority order
  OperatorPluginRegistry.registerDetector(new StandardCustomDetector());
  OperatorPluginRegistry.registerDetector(new TorchLibraryDetector());

  if (triton) {
    OperatorPluginRegistry.registerDetector(triton);
  }

  OperatorPluginRegistry.registerDetector(pyasc);
  OperatorPluginRegistry.registerDetector(ascend);
}

export { OperatorPluginRegistry } from './operator-plugin.registry';

export type {
  IOperatorPlugin, OperatorBuildBehavior, OperatorConfigScripts, OperatorDefaultPaths,
} from './operator-plugin.interface';

export type {
  IProjectDetector, ProjectDetectionResult,
} from './project-detector.interface';

export { AbstractOperatorPlugin } from './abstract-operator-plugin';
