import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import type { OperatorOpType } from '@shared/operator-op-type';
import {
  normalizeOpTypeForSpawn,
  normalizeProjectTypeForSpawn,
} from './operator-context-normalize';
import type {
  IOperatorPlugin, OpGenParams, OpGenProject, OperatorSpawnEnvKey,
} from './operator-plugin.interface';
import type { OperatorBuildBehavior } from './operator-plugin.interface';
import type {
  IProjectDetector,
} from './project-detector.interface';
import type { BaseOpGenerator } from '@plugin/domain/services/op-generator-factory';
import type { OpRecord } from '@plugin/domain/models/model';

const CANN_SOC_PROJECT_TYPES: ReadonlySet<OperatorProjectType> = new Set([
  OperatorProjectType.ASCEND_C,
  OperatorProjectType.TORCH_LIBRARY,
]);

const NO_SPAWN_EXPORT_PROJECT_TYPES: ReadonlySet<OperatorProjectType> = new Set([
  OperatorProjectType.STANDARD_CUSTOM,
  OperatorProjectType.PYASC,
  OperatorProjectType.TRITON,
]);

function pickSpawnEnvKeys(
  env: Record<string, string>,
  keys: readonly OperatorSpawnEnvKey[],
): Record<string, string> {
  const picked: Record<string, string> = {};

  for (const key of keys) {
    const value = env[key];

    if (value !== undefined && value.trim() !== '') {
      picked[key] = value;
    }
  }

  return picked;
}

// NOTE: Imports above are mostly type-only to break runtime circular dependency cycles:
//   registry → op-generator-factory → registry
//   registry → model.ts → registry
// Value imports (OperatorProjectType, normalize*ForSpawn) are leaf modules with no
// registry back-edges. Plugin/detector implementations are registered at runtime via
// register() calls, not imported directly.

/** Minimal op descriptor needed for path/script lookup. Satisfied by both OpRecord and the local Op interface in op-util.ts. */
export type OpDescriptor = Pick<OpRecord, 'op_path' | 'op_type' | 'op_name'>;

/**
 * Central registry for operator-type plugins and project-type detectors.
 *
 * Manages two independent registries:
 *  - opPlugins (Map<opType, IOperatorPlugin>) — unordered; for command generation,
 *    file paths, scaffolding, build behavior, and initial config scripts
 *  - detectors (IProjectDetector[]) — ordered; for filesystem project detection
 *
 * Registration order for detectors MATTERS — more specific detectors (those that
 * return 'definitive') must be registered before ambiguous heuristic detectors.
 *
 * Recommended detector registration order:
 *   1. StandardCustomDetector  (definitive — build.sh content check)
 *   2. TorchLibraryDetector    (heuristic — CMakeLists + .py files)
 *   3. TritonPlugin            (heuristic/definitive — before PyAsc)
 *   4. PyAscPlugin             (heuristic — .py files, no CMakeLists)
 *   5. AscendPlugin            (heuristic — CMakeLists + .asc files)
 */
export class OperatorPluginRegistry {
  private static readonly opPlugins = new Map<string, IOperatorPlugin>();
  private static readonly detectors: IProjectDetector[] = [];

  /** Register an op-type plugin. Order does not matter. */
  static registerOpPlugin(plugin: IOperatorPlugin): void {
    this.opPlugins.set(plugin.opType, plugin);
  }

  /**
   * Register a project detector.
   * Order MATTERS — registration order equals detection priority.
   */
  static registerDetector(detector: IProjectDetector): void {
    this.detectors.push(detector);
  }

  /**
   * Convenience: register something that implements both interfaces.
   * Op-type registration is unordered; detection appends to the ordered list.
   */
  static register(plugin: IOperatorPlugin & IProjectDetector): void {
    this.registerOpPlugin(plugin);
    this.registerDetector(plugin);
  }

  /**
   * Get op-type plugin by opType.
   * Falls back to 'cann' if not found — same behavior as CommandStrategyFactory.
   */
  static getOpPlugin(opType: string | null | undefined): IOperatorPlugin {
    if (!opType) {
      return this.opPlugins.get('cann')!;
    }

    return this.opPlugins.get(opType) ?? this.opPlugins.get('cann')!;
  }

  /**
   * Resolve plugin by detected projectType (structure-level type).
   * Falls back to cann plugin for unknown/unsupported mappings.
   */
  static getProjectTypePlugin(projectType: string | null | undefined): IOperatorPlugin {
    if (!projectType) return this.getOpPlugin(undefined);
    for (const plugin of this.opPlugins.values()) {
      if (plugin.projectTypeMappings?.includes(projectType as any)) {
        return plugin;
      }
    }
    return this.getOpPlugin(undefined);
  }

  /**
   * Detect project type by inspecting the filesystem.
   * Iterates detectors in registration order.
   * Stops immediately on 'definitive'; keeps the first 'heuristic' match if
   * no 'definitive' is found.
   */
  static async detectProject(dirPath: string): Promise<{
    detector: IProjectDetector;
    projectType: OperatorProjectType;
  } | null> {
    let heuristicMatch: IProjectDetector | null = null;

    for (const detector of this.detectors) {
      const {
        isMatch, confidence,
      } = await detector.detectProject(dirPath);

      if (!isMatch) {
        continue;
      }

      if (confidence === 'definitive') {
        return {
          detector,
          projectType: detector.projectType,
        };
      }

      if (!heuristicMatch) {
        heuristicMatch = detector;
      }
    }

    return heuristicMatch
      ? {
        detector: heuristicMatch,
        projectType: heuristicMatch.projectType,
      }
      : null;
  }

  /** Get project scaffolding generator for the given op type. */
  static getProjectGenerator(
    params: OpGenParams,
    project: OpGenProject,
    extensionPath: string,
  ): BaseOpGenerator {
    return this.getOpPlugin(params.op_type)
      .createProjectGenerator(params, project, extensionPath);
  }

  /** Get default file paths for the given op descriptor. */
  static getDefaultPaths(op: OpDescriptor) {
    return this.getOpPlugin(op.op_type)
      .getDefaultPaths(op as OpRecord);
  }

  /**
   * Resolve build behavior by detected project type first, then fall back to op_type.
   * Avoids conflating project_type (e.g. 'standard-custom', 'ascend-c') with op_type
   * (e.g. 'ascend', 'cann', 'pyasc', 'triton').
   */
  static getBuildBehaviorByProjectType(
    projectType: string | null | undefined,
  ): OperatorBuildBehavior {
    if (!projectType) {
      return this.getOpPlugin(undefined).buildBehavior;
    }

    for (const plugin of this.opPlugins.values()) {
      if (plugin.projectTypeMappings?.includes(projectType as any)) {
        return plugin.buildBehavior;
      }
    }

    return this.getOpPlugin(projectType).buildBehavior;
  }

  static getRegisteredOpTypes(): string[] {
    return [...this.opPlugins.keys()];
  }

  /**
   * Spawn env keys for one command. Project type can force no export; ascend-c /
   * torch-library use cann cmake keys; otherwise defers to the op_type plugin.
   */
  static getSpawnEnvExportKeys(
    opType: OperatorOpType | null | undefined,
    projectType: OperatorProjectType | null | undefined,
  ): readonly OperatorSpawnEnvKey[] {
    const pt = projectType;

    if (pt && NO_SPAWN_EXPORT_PROJECT_TYPES.has(pt)) {
      return [];
    }

    if (pt && CANN_SOC_PROJECT_TYPES.has(pt)) {
      return this.getOpPlugin('cann')?.getSpawnEnvExportKeys() ?? [];
    }

    const normalizedOp = normalizeOpTypeForSpawn(opType);

    if (normalizedOp) {
      return this.getOpPlugin(normalizedOp)?.getSpawnEnvExportKeys() ?? [];
    }

    return [];
  }

  static filterSpawnEnv(
    fullEnv: Record<string, string>,
    opType: OperatorOpType | null | undefined,
    projectType: OperatorProjectType | null | undefined,
  ): Record<string, string> {
    return pickSpawnEnvKeys(
      fullEnv,
      this.getSpawnEnvExportKeys(opType, projectType),
    );
  }

  /** Re-export for callers that resolve persisted project_type strings. */
  static normalizeProjectTypeForSpawn = normalizeProjectTypeForSpawn;

  /** Re-export for callers that resolve persisted op_type strings. */
  static normalizeOpTypeForSpawn = normalizeOpTypeForSpawn;

  /**
   * Whether a given project_type is currently supported by registered plugins.
   * This reflects runtime capability (feature toggles may exclude some plugins).
   */
  static isProjectTypeSupported(projectType: string | null | undefined): boolean {
    if (!projectType || projectType.trim().length === 0) {
      return false;
    }

    for (const plugin of this.opPlugins.values()) {
      if (plugin.opType === projectType) {
        return true;
      }
      if (plugin.projectTypeMappings?.includes(projectType as any)) {
        return true;
      }
    }

    return false;
  }

  /** For testing only — resets registry state. */
  static _reset(): void {
    this.opPlugins.clear();
    this.detectors.length = 0;
  }
}
