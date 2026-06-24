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
import {
  IProjectDetector, ProjectDetectionResult,
} from './project-detector.interface';
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

function tritonLaunchKernelPathSidecarWriter(opName: string): string {
  const findNewest = 'find "$HOME/.triton/cache" -type f \\( -name \'*.npubin\' -o -name kernel.o -o -name kernel_reloc.o \\) -printf "%T@ %p\\n" 2>/dev/null | sort -n | tail -1 | cut -d" " -f2-';
  const writeSidecar = 'd="$PWD"; while [ "$d" != "/" ]; do for cfg in .vscode .arts; do if [ -d "$d/$cfg" ]; then printf "%s\\n" "$K" > "$d/$cfg/.triton_launch_kernel_path"; exit 0; fi; done; d=$(dirname "$d"); done';

  return `sh -c 'K=$(find "$HOME/.triton/cache" -type f -name '${opName}.npubin' -printf "%T@ %p\\n" 2>/dev/null | sort -n | tail -1 | cut -d" " -f2-); [ -z "$K" ] && K=$(${findNewest}); [ -z "$K" ] && exit 0; ${writeSidecar}'`;
}

function tritonDebugPythonEntry(op: OpRecord): string {
  const compile = `TRITON_DISABLE_CACHE=1 TRITON_DISABLE_LINE_INFO=false LLVM_EXTRACT_DI_LOCAL_VARIABLES=1 python3 ./${op.op_name}.py`;

  return `${compile} && ${tritonLaunchKernelPathSidecarWriter(op.op_name)}`;
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
    supportsSanitizer: true,
    supportsSimulate: true,
    supportsOnBoard: true,
    supportsCpuDebug: false,
    supportsNpuDebug: true,
    supportsNpuPythonDebug: true,
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
   * Sanitizer runs via mssanitizer + Triton env vars; script slot is unused (pre-build skipped).
   */
  getInitialConfigScripts(op: OpRecord, _workspaceRoot: string): OperatorConfigScripts {
    const py = tritonDefaultPythonEntry(op);
    const debugPy = tritonDebugPythonEntry(op);

    return {
      buildScript: py,
      exampleScript: py,
      simulateScript: py,
      onBoardScript: py,
      sanitizerScript: py,
      cpuDebugScript: py,
      npuDebugScript: debugPy,
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
