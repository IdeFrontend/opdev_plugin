import * as fs from 'fs';
import * as path from 'path';
import { AscendCommandStrategy } from '@plugin/domain/services/command-strategy/ascend-strategy';
import {
  AscendOpGenerator, OpGenParams, OpGenProject,
} from '@plugin/domain/services/op-generator-factory';
import { OpRecord } from '@plugin/domain/models/model';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { checkBuildShHasBishengConfig } from '@plugin/domain/utils/build-utils';
import { AbstractOperatorPlugin } from './abstract-operator-plugin';
import {
  IProjectDetector, ProjectDetectionResult,
} from './project-detector.interface';
import { patchAclnnCmakeSupportVars } from '@plugin/domain/utils/ascend-util';
import {
  OperatorBuildBehavior, OperatorConfigScripts, OperatorDefaultPaths,
} from './operator-plugin.interface';
import {
  hasAscFiles, hasPyFilesInRoot,
} from './detection-utils';

/**
 * Plugin for op_type='ascend' (Ascend C operators).
 * Also acts as a project detector for OperatorProjectType.ASCEND_C.
 */
export class AscendPlugin extends AbstractOperatorPlugin implements IProjectDetector {
  readonly opType = 'ascend';
  readonly displayName = 'Ascend C';
  readonly commandStrategy = new AscendCommandStrategy();
  override readonly buildBehavior: OperatorBuildBehavior = {
    requiresBuildBeforeAnalysis: true,
    requiresActiveFileCheck: false,
    supportsSanitizer: true,
    supportsSimulate: true,
    supportsOnBoard: true,
    supportsCpuDebug: true,
    supportsNpuDebug: true,
    supportsNpuPythonDebug: true,
  };
  readonly projectTypeMappings = [
    OperatorProjectType.ASCEND_C,
    OperatorProjectType.TORCH_LIBRARY,
  ] as const;
  readonly projectType = OperatorProjectType.ASCEND_C;

  async detectProject(dirPath: string): Promise<ProjectDetectionResult> {
    const hasCmake = fs.existsSync(path.join(dirPath, 'CMakeLists.txt'));
    const hasAsc = hasAscFiles(dirPath);
    const hasPy = hasPyFilesInRoot(dirPath);

    return {
      isMatch: hasCmake && hasAsc && !hasPy,
      confidence: 'heuristic',
    };
  }

  getDefaultPaths(op: OpRecord): OperatorDefaultPaths {
    const runPackageName = '*.run';

    return {
      opScriptPath:      path.join(op.op_path, 'build.sh'),
      exampleScriptPath: path.join(op.op_path, 'build.sh'),
      targetDir:         path.resolve(op.op_path, 'build_out'),
      targetOpFile:      path.join(op.op_path, 'build_out', runPackageName),
      targetExampleFile: path.join(op.op_path, 'build', `test_aclnn_${op.op_name}`),
    };
  }

  getInitialConfigScripts(op: OpRecord, workspaceRoot: string): OperatorConfigScripts {
    const script = path.join(op.op_path, 'build.sh');
    const h = checkBuildShHasBishengConfig(workspaceRoot);
    const base = `bash ${script} --pkg --soc={soc_version} --vendor_name=custom --ops={operatorNames}`;
    return {
      // V1 inline ternary for build_op.script had NO bisheng variant — always the plain base.
      buildScript:     base,
      // V1 getExampleScript for ascend returned `bash ... --vendor_name=custom --run_example`
      // with NO --pkg and NO --soc flags (and no bisheng variant — V1 bug preserved).
      exampleScript:   `bash ${script} --vendor_name=custom --run_example`,
      simulateScript:  h ? `${base} --bisheng_flags=ccec_g`         : `${base} --simulator {simulator_type}`,
      onBoardScript:   h ? `${base} --bisheng_flags=ccec_g`         : `${base} --onboard`,
      // V1 inline ternary for sanitizer.script had NO bisheng variant — always base + --mssanitizer.
      sanitizerScript: `${base} --mssanitizer`,
      cpuDebugScript:  h ? `${base} --bisheng_flags=ccec_g`         : `${base} --simulator {simulator_type}`,
      npuDebugScript:  h ? `${base} --bisheng_flags=ccec_O0,ccec_g` : `${base} --debug`,
      utTestScript:    `bash ${script} --soc={soc_version} --ops={operatorNames} -u`,
    };
  }

  override patchGeneratedProject(opPath: string, params: OpGenParams): void {
    patchAclnnCmakeSupportVars(opPath, params.soc_version);
  }

  createProjectGenerator(params: OpGenParams, project: OpGenProject, extensionPath: string) {
    return new AscendOpGenerator(params, project, extensionPath);
  }
}
