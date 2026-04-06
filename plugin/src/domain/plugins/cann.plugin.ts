import { CannCommandStrategy } from '@plugin/domain/services/command-strategy/cann-strategy';
import {
  CannOpGenerator, OpGenParams, OpGenProject,
} from '@plugin/domain/services/op-generator-factory';
import { AbstractOperatorPlugin } from './abstract-operator-plugin';

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

  createProjectGenerator(params: OpGenParams, project: OpGenProject, extensionPath: string) {
    return new CannOpGenerator(params, project, extensionPath);
  }
}
