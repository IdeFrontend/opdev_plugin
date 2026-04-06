import * as fs from 'fs';
import * as path from 'path';
import { AscendCommandStrategy } from '@plugin/domain/services/command-strategy/ascend-strategy';
import {
  AscendOpGenerator, OpGenParams, OpGenProject,
} from '@plugin/domain/services/op-generator-factory';
import { OpRecord } from '@plugin/domain/models/model';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { soc_version } from '@plugin/domain/utils/ascend-util';
import { getDetailedSystemInfo } from '@plugin/domain/utils/op-util';
import { checkBuildShHasBishengConfig } from '@plugin/domain/utils/build-utils';
import { AbstractOperatorPlugin } from './abstract-operator-plugin';
import {
  IProjectDetector, ProjectDetectionResult,
} from './project-detector.interface';
import {
  OperatorConfigScripts, OperatorDefaultPaths,
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
    const { architecture } = getDetailedSystemInfo();
    // Mirrors the runPackageMap in op-util.ts getDefaultTarget().
    // Note: runPackageName may be undefined for unknown op names — preserves V1 behavior.
    const runPackageMap: Record<string, string> = {
      'ops-math':        `cann-${op.op_name}-custom_linux-${architecture}.run`,
      'ops-transformer': `cann-${op.op_name}-custom_linux-${architecture}.run`,
      'ops-nn':          `cann-${op.op_name}-custom-linux.${architecture}.run`,
      'ops-cv':          `cann-${op.op_name}-custom-linux.${architecture}.run`,
    };
    const runPackageName = runPackageMap[op.op_name];

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
    const base = `bash ${script} --pkg --soc=${soc_version} --vendor_name=custom`;

    return {
      // V1 inline ternary for build_op.script had NO bisheng variant — always the plain base.
      buildScript:     base,
      // V1 getExampleScript for ascend returned `bash ... --vendor_name=custom --run_example`
      // with NO --pkg and NO --soc flags (and no bisheng variant — V1 bug preserved).
      exampleScript:   `bash ${script} --vendor_name=custom --run_example`,
      simulateScript:  h ? `${base} --bisheng_flags=ccec_g`         : `${base} --simulator Ascend910B3`,
      onBoardScript:   h ? `${base} --bisheng_flags=ccec_g`         : `${base} --onboard`,
      // V1 inline ternary for sanitizer.script had NO bisheng variant — always base + --mssanitizer.
      sanitizerScript: `${base} --mssanitizer`,
      cpuDebugScript:  h ? `${base} --bisheng_flags=ccec_g`         : `${base} --simulator`,
      npuDebugScript:  h ? `${base} --bisheng_flags=ccec_O0,ccec_g` : `${base} --debug`,
    };
  }

  createProjectGenerator(params: OpGenParams, project: OpGenProject, extensionPath: string) {
    return new AscendOpGenerator(params, project, extensionPath);
  }
}
