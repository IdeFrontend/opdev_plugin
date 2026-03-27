import * as fs from 'fs';
import * as path from 'path';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import { IProjectDetector, ProjectDetectionResult } from './project-detector.interface';
import { hasPyFilesInRoot } from './detection-utils';

/**
 * Project detector for TORCH_LIBRARY operator projects (torch_library extension pattern).
 *
 * Like STANDARD_CUSTOM, TORCH_LIBRARY has no dedicated op_type — its operators
 * use 'ascend' or 'cann'. Detection-only; does not implement IOperatorPlugin.
 *
 * Mirrors V1 detection: CMakeLists.txt exists AND .py files present at root.
 */
export class TorchLibraryDetector implements IProjectDetector {
  readonly projectType = OperatorProjectType.TORCH_LIBRARY;

  async detectProject(dirPath: string): Promise<ProjectDetectionResult> {
    const hasCmake = fs.existsSync(path.join(dirPath, 'CMakeLists.txt'));
    const hasPy = hasPyFilesInRoot(dirPath);
    return {
      isMatch: hasCmake && hasPy,
      confidence: 'heuristic',
    };
  }
}
