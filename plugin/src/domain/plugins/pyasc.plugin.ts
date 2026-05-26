import * as fs from 'fs';
import * as path from 'path';
import { PyAscCommandStrategy } from '@plugin/domain/services/command-strategy/pyasc-strategy';
import {
  PyAscOpGenerator, OpGenParams, OpGenProject,
} from '@plugin/domain/services/op-generator-factory';
import { OpRecord } from '@plugin/domain/models/model';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { AbstractOperatorPlugin } from './abstract-operator-plugin';
import {
  IProjectDetector, ProjectDetectionResult,
} from './project-detector.interface';
import {
  OperatorBuildBehavior, OperatorConfigScripts, OperatorDefaultPaths,
} from './operator-plugin.interface';
import {
  hasPyFilesRecursive,
  hasTritonPythonIndicatorsInRoot,
} from './detection-utils';

/**
 * Plugin for op_type='pyasc' (Python-based ASC operators).
 * Also acts as a project detector for OperatorProjectType.PYASC.
 *
 * Key behavioral differences from AbstractOperatorPlugin defaults:
 *  - No build step — Python files are run directly
 *  - Requires an active .py file in the editor before triggering analysis
 */
export class PyAscPlugin extends AbstractOperatorPlugin implements IProjectDetector {
  readonly opType = 'pyasc';
  readonly displayName = 'PyAsc';
  readonly commandStrategy = new PyAscCommandStrategy();
  readonly projectType = OperatorProjectType.PYASC;
  readonly projectTypeMappings = [OperatorProjectType.PYASC] as const;

  override readonly buildBehavior: OperatorBuildBehavior = {
    requiresBuildBeforeAnalysis: false,
    requiresActiveFileCheck: true,
    activeFileExtension: '.py',
    supportsSanitizer: false,
    supportsSimulate: true,
    supportsOnBoard: true,
    supportsCpuDebug: false,
    supportsNpuDebug: false,
    supportsNpuPythonDebug: false,
  };

  async detectProject(dirPath: string): Promise<ProjectDetectionResult> {
    const hasPy = hasPyFilesRecursive(dirPath, 2);
    const hasCmake = fs.existsSync(path.join(dirPath, 'CMakeLists.txt'));
    const hasTritonMarkers = hasTritonPythonIndicatorsInRoot(dirPath);

    return {
      isMatch: hasPy && !hasCmake && !hasTritonMarkers,
      confidence: 'heuristic',
    };
  }

  getDefaultPaths(op: OpRecord): OperatorDefaultPaths {
    const pyEntry = path.join(op.op_path, `${op.op_name}.py`);
    const pyTarget = `python3 ./${op.op_name}.py`;

    return {
      opScriptPath:      pyEntry,
      exampleScriptPath: pyEntry,
      targetDir:         path.resolve(op.op_path, 'build_out'),
      targetOpFile:      pyTarget,
      targetExampleFile: pyTarget,
    };
  }

  /**
   * PyAsc runs the operator `.py` entry directly (no bundled build.sh / cmake).
   * Simulate and on-board use profiler strategies with resolveAscendEnv().
   */
  getInitialConfigScripts(op: OpRecord, _workspaceRoot: string): OperatorConfigScripts {
    const py = `python3 ./${op.op_name}.py`;
    return {
      buildScript:     py,
      exampleScript:   py,
      simulateScript:  py,
      onBoardScript:   py,
      sanitizerScript: py,
      cpuDebugScript:  py,
      npuDebugScript:  py,
    };
  }

  createProjectGenerator(params: OpGenParams, project: OpGenProject, extensionPath: string) {
    return new PyAscOpGenerator(params, project, extensionPath);
  }
}
