import { CommandStrategy } from '@plugin/domain/services/command-strategy/types';
import { OpRecord } from '@plugin/domain/models/model';
import {
  BaseOpGenerator, OpGenParams, OpGenProject,
} from '@plugin/domain/services/op-generator-factory';

export type {
  OpGenParams, OpGenProject,
};

export interface OperatorDefaultPaths {
  opScriptPath: string;
  exampleScriptPath: string;
  targetDir: string;
  targetOpFile: string;
  targetExampleFile: string;
}

export interface OperatorBuildBehavior {
  /** False for pyasc — it runs Python files directly, no compilation step. */
  requiresBuildBeforeAnalysis: boolean;
  /** True for pyasc — the active .py file in the editor determines what gets run. */
  requiresActiveFileCheck: boolean;
  /** Required when requiresActiveFileCheck is true. */
  activeFileExtension?: string;
  /** Whether sanitizer pipeline is supported for this operator type. */
  supportsSanitizer?: boolean;
  /** Whether simulation analysis pipeline is supported for this operator type. */
  supportsSimulate?: boolean;
  /** Whether on-board analysis pipeline is supported for this operator type. */
  supportsOnBoard?: boolean;
  /** Whether CPU debug flow is supported for this operator type. */
  supportsCpuDebug?: boolean;
  /** Whether NPU debug flow is supported for this operator type. */
  supportsNpuDebug?: boolean;
  /** Whether NPU debug should use python profile (msdebug-python). */
  supportsNpuPythonDebug?: boolean;
}

/**
 * All seven type-specific script strings produced by generateStructure().
 * Replaces five helper functions and two inline ternaries in model.ts.
 */
export interface OperatorConfigScripts {
  buildScript: string;
  exampleScript: string;
  simulateScript: string;
  onBoardScript: string;
  /** Sanitizer config script — previously a silent inline ternary in model.ts. */
  sanitizerScript: string;
  cpuDebugScript: string;
  npuDebugScript: string;
  utTestScript: string;
}

/**
 * Operator-type plugin interface.
 *
 * Encapsulates all op_type-level behavior: command generation, default file
 * paths, project scaffolding, build pre-flight behavior, and initial config
 * scripts. Keyed by opType which must match OpRecord.op_type exactly.
 *
 * Does NOT include project-structure detection — see IProjectDetector.
 * Does NOT include requiresExampleBuildForAnalysis — that is a STANDARD_CUSTOM
 * project-level concern handled separately by isRootStandardCustom().
 */
export interface IOperatorPlugin {
  /** Must match OpRecord.op_type exactly (e.g. 'ascend', 'cann', 'pyasc'). */
  readonly opType: string;

  readonly displayName: string;
  /**
   * Optional mapping from detected project_type values to this plugin's behavior.
   * Used when callers only know project_type (e.g. 'ascend-c', 'standard-custom').
   */
  readonly projectTypeMappings?: readonly string[];

  /** Reuses the existing CommandStrategy interface. No duplication with V1. */
  readonly commandStrategy: CommandStrategy;

  /**
   * Default file paths when a new operator record is first created.
   * Replaces the if-else chain in getDefaultTarget() in op-util.ts.
   */
  getDefaultPaths(op: OpRecord): OperatorDefaultPaths;

  /**
   * Project scaffolding generator factory.
   * Replaces OpGeneratorFactory.getGenerator() if-else.
   * Throws by default in AbstractOperatorPlugin — every plugin must implement this.
   */
  createProjectGenerator(
    params: OpGenParams,
    project: OpGenProject,
    extensionPath: string,
  ): BaseOpGenerator;

  /**
   * Operator-level build pre-flight behavior.
   * Replaces isPyascType copy-paste in BuildService.
   */
  readonly buildBehavior: OperatorBuildBehavior;

  /**
   * Initial config scripts written when a new operator is created.
   * Replaces 5 helper functions and 2 inline ternaries in model.ts generateStructure().
   *
   * @param op            The operator record
   * @param workspaceRoot VS Code workspace root path — used to check build.sh for
   *   --bisheng_flags. Mirrors V1 behavior where checkBuildShHasBishengConfig()
   *   read from vscode.workspace.workspaceFolders[0].uri.fsPath.
   */
  getInitialConfigScripts(op: OpRecord, workspaceRoot: string): OperatorConfigScripts;
}
