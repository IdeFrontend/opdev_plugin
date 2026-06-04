import * as fs from 'fs';
import * as path from 'path';
import { OpRecord } from '@plugin/domain/models/model';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { TritonCommandStrategy } from '@plugin/domain/services/command-strategy/triton-strategy';
import {
  BaseOpGenerator,
  OpGenParams,
  OpGenProject,
  TritonOpGenerator,
} from '@plugin/domain/services/op-generator-factory';
import { AbstractOperatorPlugin } from './abstract-operator-plugin';
import { IProjectDetector, ProjectDetectionResult } from './project-detector.interface';
import {
  OperatorBuildBehavior,
  OperatorConfigScripts,
  OperatorDefaultPaths,
} from './operator-plugin.interface';
import {
  hasPyFilesRecursive,
  hasTritonPythonIndicatorsInRoot,
} from './detection-utils';

function tritonDefaultPythonEntry(op: OpRecord): string {
  return `python3 ./${op.op_name}.py`;
}

/**
 * Plugin for op_type='triton' (Python Triton operators for Ascend workflows).
 * Also acts as project detector for OperatorProjectType.TRITON.
 */
export class TritonPlugin extends AbstractOperatorPlugin implements IProjectDetector {
  readonly opType = 'triton';
  readonly displayName = 'Triton';
  readonly commandStrategy = new TritonCommandStrategy();
  readonly projectType = OperatorProjectType.TRITON;
  readonly projectTypeMappings = [OperatorProjectType.TRITON] as const;

  override readonly buildBehavior: OperatorBuildBehavior = {
    requiresBuildBeforeAnalysis: false,
    requiresActiveFileCheck: true,
    activeFileExtension: '.py',
    supportsSanitizer: false,
    supportsSimulate: false,
    supportsOnBoard: false,
    supportsCpuDebug: false,
    supportsNpuDebug: false,
    supportsNpuPythonDebug: false,
  };

  async detectProject(dirPath: string): Promise<ProjectDetectionResult> {
    const hasPy = hasPyFilesRecursive(dirPath, 2);
    const hasCmake = fs.existsSync(path.join(dirPath, 'CMakeLists.txt'));
    const hasTritonMarkers = hasTritonPythonIndicatorsInRoot(dirPath);

    return {
      isMatch: hasPy && !hasCmake && hasTritonMarkers,
      confidence: 'heuristic',
    };
  }

  getDefaultPaths(op: OpRecord): OperatorDefaultPaths {
    const pyTarget = tritonDefaultPythonEntry(op);
    return {
      opScriptPath: path.join(op.op_path, 'build.sh'),
      exampleScriptPath: path.join(op.op_path, 'build.sh'),
      targetDir: path.resolve(op.op_path, 'build_out'),
      targetOpFile: pyTarget,
      targetExampleFile: pyTarget,
    };
  }

  /**
   * Same idea as PyAsc: single `.py` entry, no bundled shell scripts. Point all config script
   * slots at that interpreter line so Build does not reference missing `build.sh`.
   * Profiling/sanitizer flows may still need manual customization for real Ascend tooling.
   */
  getInitialConfigScripts(op: OpRecord, _workspaceRoot: string): OperatorConfigScripts {
    const py = tritonDefaultPythonEntry(op);
    return {
      buildScript: py,
      exampleScript: py,
      simulateScript: py,
      onBoardScript: py,
      sanitizerScript: py,
      cpuDebugScript: py,
      npuDebugScript: py,
      utTestScript: py,
    };
  }

  createProjectGenerator(
    params: OpGenParams,
    project: OpGenProject,
    extensionPath: string,
  ): BaseOpGenerator {
    return new TritonOpGenerator(
      {
        ...params,
        template_name: params.template_name || 'triton_vector_add',
      },
      project,
      extensionPath,
    );
  }
}
