import * as fs from 'fs';
import * as path from 'path';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import {
  IProjectDetector, ProjectDetectionResult,
} from './project-detector.interface';
import {
  hasPyFilesInRoot, hasAscFiles, hasAncestorBuildShWithGenop,
} from './detection-utils';

/**
 * Project detector for STANDARD_CUSTOM operator projects.
 *
 * STANDARD_CUSTOM has no dedicated op_type — operators inside use 'ascend' or 'cann'.
 * This is a detection-only class; it does NOT implement IOperatorPlugin.
 *
 * Replicates both detection paths from V1's OperatorProjectDetector.detectOperatorProject():
 *  Path 1 (definitive): build.sh exists and contains '--genop'
 *  Path 2 (heuristic):  CMakeLists.txt + no .asc + no .py + experimental/ancestor pattern
 *                        (detects sub-directories within a STANDARD_CUSTOM project root)
 *
 * Must be registered FIRST in OperatorPluginRegistry because its 'definitive' result
 * takes priority over AscendPlugin's heuristic.
 */
export class StandardCustomDetector implements IProjectDetector {
  readonly projectType = OperatorProjectType.STANDARD_CUSTOM;

  async detectProject(dirPath: string): Promise<ProjectDetectionResult> {
    const buildShPath = path.join(dirPath, 'build.sh');

    // Path 1: definitive — build.sh file-content check
    if (fs.existsSync(buildShPath)) {
      try {
        const content = fs.readFileSync(buildShPath, 'utf-8');

        if (content.includes('--genop')) {
          return {
            isMatch: true,
            confidence: 'definitive',
          };
        }
      }
      catch {
        // fall through to Path 2
      }
    }

    // Path 1.5: definitive — a folder nested inside a standard-custom collection.
    // If an ancestor (within 3 levels) has build.sh with --genop, this directory belongs to
    // that collection regardless of its own .asc/.py/CMake contents.
    if (hasAncestorBuildShWithGenop(dirPath)) {
      return {
        isMatch: true,
        confidence: 'definitive',
      };
    }

    // Path 2: heuristic — CMakeLists + no .asc + no .py + path/ancestor pattern
    const hasCmake = fs.existsSync(path.join(dirPath, 'CMakeLists.txt'));

    if (hasCmake && !hasAscFiles(dirPath) && !hasPyFilesInRoot(dirPath)) {
      const normalizedPath = path.normalize(dirPath)
        .toLowerCase();

      if (
        normalizedPath.includes('experimental')
        || fs.existsSync(path.join(path.dirname(dirPath), 'build.sh'))
        || hasAncestorBuildShWithGenop(dirPath)
      ) {
        return {
          isMatch: true,
          confidence: 'heuristic',
        };
      }
    }

    return {
      isMatch: false,
      confidence: 'heuristic',
    };
  }
}
