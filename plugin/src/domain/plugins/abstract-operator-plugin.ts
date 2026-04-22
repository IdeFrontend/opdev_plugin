import * as path from 'path';
import { CommandStrategy } from '@plugin/domain/services/command-strategy/types';
import { OpRecord } from '@plugin/domain/models/model';
import {
  BaseOpGenerator, OpGenParams, OpGenProject,
} from '@plugin/domain/services/op-generator-factory';
import {
  IOperatorPlugin,
  OperatorBuildBehavior,
  OperatorConfigScripts,
  OperatorDefaultPaths,
} from './operator-plugin.interface';

/**
 * Abstract base class for operator-type plugins.
 *
 * Provides defaults matching the current 'cann' fallback behavior:
 *  - buildBehavior: build required, no active-file check
 *  - getDefaultPaths: build/<op_name> layout
 *  - getInitialConfigScripts: simple `bash build.sh` invocations
 *
 * Concrete plugins override only what differs from these defaults.
 * createProjectGenerator() throws by default — every plugin must implement it.
 */
export abstract class AbstractOperatorPlugin implements IOperatorPlugin {
  abstract readonly opType: string;
  abstract readonly displayName: string;
  abstract readonly commandStrategy: CommandStrategy;

  readonly buildBehavior: OperatorBuildBehavior = {
    requiresBuildBeforeAnalysis: true,
    requiresActiveFileCheck: false,
  };

  getDefaultPaths(op: OpRecord): OperatorDefaultPaths {
    const buildPath = path.join(op.op_path, 'build', op.op_name);

    return {
      opScriptPath:      path.join(op.op_path, 'build.sh'),
      exampleScriptPath: path.join(op.op_path, 'build.sh'),
      targetDir:         path.resolve(op.op_path, 'build_out'),
      targetOpFile:      buildPath,
      targetExampleFile: buildPath,
    };
  }

  getInitialConfigScripts(op: OpRecord, _workspaceRoot: string): OperatorConfigScripts {
    const script = path.join(op.op_path, 'build.sh');

    return {
      buildScript:     `bash ${script}`,
      exampleScript:   `bash ${script}`,
      simulateScript:  `bash ${script} --simulator Ascend910B3`,
      onBoardScript:   `bash ${script} --onboard`,
      sanitizerScript: `bash ${script} --mssanitizer`,
      cpuDebugScript:  `bash ${script} --simulator`,
      npuDebugScript:  `bash ${script} --debug`,
    };
  }

  createProjectGenerator(
    _params: OpGenParams,
    _project: OpGenProject,
    _extensionPath: string,
  ): BaseOpGenerator {
    throw new Error(`createProjectGenerator not implemented for opType '${this.opType}'`);
  }
}
