import type {
  IOperatorPlugin, OpGenParams, OpGenProject,
} from './operator-plugin.interface';
import type {
  IProjectDetector, OperatorProjectType,
} from './project-detector.interface';
import type { BaseOpGenerator } from '@plugin/domain/services/op-generator-factory';
import type { OpRecord } from '@plugin/domain/models/model';

// NOTE: All imports above are type-only. This intentionally breaks the runtime
// circular dependency cycles:
//   registry → op-generator-factory → registry
//   registry → model.ts → registry
// The actual values (IOperatorPlugin implementations, IProjectDetector implementations)
// are passed in at runtime via register() calls, not imported directly.

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
 *   3. PyAscPlugin             (heuristic — .py files, no CMakeLists)
 *   4. AscendPlugin            (heuristic — CMakeLists + .asc files)
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

  /** Build pre-flight behavior for the given op_type string (falls back to cann). */
  static getBuildBehaviorByProjectType(
    projectType: string | null | undefined,
  ): OperatorBuildBehavior {
    return this.getOpPlugin(projectType).buildBehavior;
  }

  static getRegisteredOpTypes(): string[] {
    return [...this.opPlugins.keys()];
  }

  /** For testing only — resets registry state. */
  static _reset(): void {
    this.opPlugins.clear();
    this.detectors.length = 0;
  }
}
