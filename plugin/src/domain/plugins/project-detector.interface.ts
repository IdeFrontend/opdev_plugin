import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';

export type { OperatorProjectType };

export interface ProjectDetectionResult {
  isMatch: boolean;
  /**
   * 'definitive' — unambiguous (e.g. file-content check). Registry stops searching.
   * 'heuristic'  — probabilistic (e.g. file-extension check). Registry keeps searching
   *                for a 'definitive' match but accepts this if none is found.
   */
  confidence: 'definitive' | 'heuristic';
}

/**
 * Project structure detection plugin.
 *
 * Encapsulates filesystem heuristics for detecting a specific OperatorProjectType.
 * Separate from IOperatorPlugin because project types and op types are different
 * classification axes: STANDARD_CUSTOM and TORCH_LIBRARY have no dedicated op_type.
 *
 * Keyed by projectType in OperatorPluginRegistry.
 */
export interface IProjectDetector {
  /** The OperatorProjectType this detector identifies. */
  readonly projectType: OperatorProjectType;

  /**
   * Test whether dirPath is a project of this type.
   * Registration order in OperatorPluginRegistry determines detection priority.
   */
  detectProject(dirPath: string): Promise<ProjectDetectionResult>;
}
