import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';
import {
  CannOpGenerator, OpGenParams, OpGenProject,
} from '@plugin/domain/services/op-generator-factory';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { patchCannSanitizerCmakeOptions } from '@plugin/domain/utils/ascend-util';
import { AbstractOperatorPlugin } from './abstract-operator-plugin';
import type { OperatorSpawnEnvKey } from './operator-plugin.interface';

/**
 * Plugin for op_type='cann' (CANN framework operators).
 * Cann operators appear inside multiple project types, so this plugin
 * does not implement IProjectDetector.
 *
 * All behavior inherited from AbstractOperatorPlugin (cann-format defaults).
 */
export class CannPlugin extends AbstractOperatorPlugin {
  readonly opType = 'cann';
  readonly displayName = 'CANN';
  readonly commandStrategy = new CannCommandStrategy();
  readonly projectTypeMappings = [OperatorProjectType.STANDARD_CUSTOM] as const;

  override getSpawnEnvExportKeys(): readonly OperatorSpawnEnvKey[] {
    return [
      'SOC_VERSION',
      'NPU_ARCH',
    ];
  }

  override patchGeneratedProject(opPath: string, params: OpGenParams): void {
    patchCannSanitizerCmakeOptions(opPath, params.soc_version);
  }

  createProjectGenerator(params: OpGenParams, project: OpGenProject, extensionPath: string) {
    return new CannOpGenerator(params, project, extensionPath);
  }
}
