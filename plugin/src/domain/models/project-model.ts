import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';
import {
  hasAscFiles,
  hasPyFilesInRoot,
  hasPyFilesRecursive,
  hasTritonPythonIndicatorsInRoot,
} from '@plugin/domain/plugins/detection-utils';
import { getDevtoolConfigPath } from '@plugin/helpers/ide-config-dir';
import {
  ENVIRONMENT_SCRIPT_SETTING,
  getConfiguredEnvironmentScriptPath,
  readWorkspaceProjectTypeSetting,
} from '@plugin/helpers/operator-project-workspace-config';
import type { FolderScanState } from '@plugin/helpers/workspace-cache';
import {
  readWorkspaceCache,
  updateWorkspaceCache,
} from '@plugin/helpers/workspace-cache';
import { ConfigService } from '@plugin/service/config-service';

// Sub-operator information
export type SubOperatorInfo = {
  name: string; // Operator name
  path: string; // operator path
  isCompiled?: boolean; // Has it been compiled?
};

// Operator collection information
export type OperatorCollectionInfo = {
  name: string; // Operator collection name
  path: string; // Operator collection path
};

export type ProjectRecord = {
  project_name: string;
  project_path: string;
  template_name?: string | null; // Template name: helloworld addn torch_library
  project_type?: string | null; // Operator project type: cann ascend pyasc
  ascend_env_script?: string | null;
  soc_version?: string | null; // SOC版本
  // Operator collection list of standard custom operator project
  ops_meet?: OperatorCollectionInfo[] | null;
  // Sub-operator list of standard custom operator project (non-experimental)
  ops_list?: SubOperatorInfo[] | null;
  // Experimental sub-operator list of standard custom operator project
  experimental_ops_list?: SubOperatorInfo[] | null;
  // List of selected operator IDs (for standard custom operator scenarios)
  selected_operator_ids?: number[] | null;
};

/** Canonical, case-insensitive path form used as a join key / equality basis (exported for the importer). */
export function normalizeProjectPath(projectPath: string): string {
  const normalizedPath = path.normalize(projectPath);
  const rootPath = path.parse(normalizedPath).root;
  const pathWithoutTrailingSeparators = normalizedPath.length > rootPath.length
    ? normalizedPath.replace(/[\\/]+$/, '')
    : normalizedPath;

  return pathWithoutTrailingSeparators
    .replace(/\\/g, '/')
    .toLowerCase();
}

export function projectPathsEqual(a: string, b: string): boolean {
  return normalizeProjectPath(a) === normalizeProjectPath(b);
}

export interface CreateProjectParams {
  project_name: string;
  project_path: string;
  template_name?: string,
  project_type?: string; // Operator project type
  /** Set to `null` to clear stored env script (e.g. when workspace setting is empty). */
  ascend_env_script?: string | null;
  soc_version?: string;
  ops_meet?: OperatorCollectionInfo[]; // Operator collection list of standard custom operator project
  ops_list?: SubOperatorInfo[]; // Sub-operator list of standard custom operator project (non-experimental)
  experimental_ops_list?: SubOperatorInfo[]; // Experimental sub-operator list of standard custom operator project
  selected_operator_ids?: number[]; // List of selected operator IDs (for standard custom operator scenarios)
}

/**
 * Persist the project type into the workspace settings — the dotted
 * `op-devtools.projectType` key that {@link readWorkspaceProjectTypeSetting}
 * reads back — so the synthesized project record survives restarts.
 */
export async function createProject(data: CreateProjectParams): Promise<void> {
  if (data.project_type) {
    await ConfigService.writeOpDevtoolsDottedSettings(
      { projectType: data.project_type },
      data.project_path,
    );
  }

  // The selection seed (`selected_operator_ids` — the scan index ids the
  // tree/webview use) is re-keyed to PATHS in the workspace cache
  // (`cache.project.selectedOperatorPaths`), the same re-key the import
  // performs (deriveSelectedOperatorPaths). Sibling cache state
  // (compiledOpPaths) is preserved.
  if (data.selected_operator_ids) {
    const cache = readWorkspaceCache(data.project_path);
    const folder = cache.folders?.[normalizeProjectPath(data.project_path)];
    const regular = folder?.opsList ?? [];
    const experimental = folder?.experimentalOpsList ?? [];
    const paths: string[] = [];

    for (const id of data.selected_operator_ids) {
      const index = id % 10000;
      const op = index >= 1000 ? experimental[index - 1000] : regular[index];

      if (op?.path && !paths.some((existingPath) => projectPathsEqual(existingPath, op!.path))) {
        paths.push(op.path);
      }
    }

    await updateWorkspaceCache(data.project_path, (nextCache) => {
      nextCache.project = {
        ...(nextCache.project ?? {}),
        selectedOperatorPaths: paths,
      };
    });
  }
}

/**
 * Persist the ascend env script into the workspace settings
 * (`op-devtools.environment.environmentScript`). `null` clears the stored
 * script; an absent field leaves it untouched.
 */
export async function updateShScript(data: CreateProjectParams): Promise<void> {
  if (data.ascend_env_script !== undefined) {
    await ConfigService.writeOpDevtoolsDottedSettings(
      { [ENVIRONMENT_SCRIPT_SETTING]: data.ascend_env_script ?? undefined },
      data.project_path,
    );
  }
}

/**
 * Project_type values the synthesized record accepts verbatim (canonical
 * detector types plus the stored values 'cann'/'ascend' — the
 * view id 'ascend' stays 'ascend', it is NEVER mapped to
 * 'standard-custom').
 */
const KNOWN_PROJECT_TYPES: ReadonlySet<string> = new Set([
  OperatorProjectType.STANDARD_CUSTOM,
  OperatorProjectType.ASCEND_C,
  OperatorProjectType.TORCH_LIBRARY,
  OperatorProjectType.PYASC,
  OperatorProjectType.TRITON,
  'cann',
  'ascend',
]);

/**
 * Synchronous structural re-detect: mirrors the detector registration
 * order (StandardCustom → TorchLibrary → Triton → PyAsc → Ascend) using the
 * sync fs helpers of detection-utils. StandardCustom's `build.sh --genop`
 * check needs an async spawn — unacceptable in this synchronous hot path — and
 * its structural fallback is ambiguous here, so paths without a distinctive
 * structure resolve to null (NOT to 'standard-custom').
 */
function detectProjectTypeSync(dirPath: string): string | null {
  const hasCmake = fs.existsSync(path.join(dirPath, 'CMakeLists.txt'));
  const hasPyRoot = hasPyFilesInRoot(dirPath);
  const hasTritonMarkers = hasTritonPythonIndicatorsInRoot(dirPath);

  if (hasCmake && hasPyRoot) {
    return OperatorProjectType.TORCH_LIBRARY;
  }

  if (hasTritonMarkers) {
    return OperatorProjectType.TRITON;
  }

  if (hasPyFilesRecursive(dirPath, 2) && !hasCmake) {
    return OperatorProjectType.PYASC;
  }

  if (hasCmake && hasAscFiles(dirPath) && !hasPyRoot) {
    return OperatorProjectType.ASCEND_C;
  }

  return null;
}

/**
 * Synthesize the project record for `projectPath` from workspace state. The
 * path is recognized as an operator
 * project when at least one marker is present:
 *   1. an explicit workspace `op-devtools.projectType` setting,
 *   2. a scanned standard-custom entry in `<project>/.vscode/cache.json`,
 *   3. a `devtool_config.json` marker in the project's ide config dir.
 * Returns `undefined` when none of the markers exists.
 *
 * The project_type comes strictly from (1) the setting when it is a
 * recognized value, (2) a synchronous structural re-detect otherwise — with no
 * 'ascend' → 'standard-custom' mapping and no standard-custom default.
 */
export function getProjectByPath(projectPath: string): ProjectRecord | undefined {
  if (!projectPath || typeof projectPath !== 'string') {
    console.warn('[getProjectByPath] Project path is empty or invalid:', projectPath);

    return undefined;
  }

  const settingsType = readWorkspaceProjectTypeSetting(vscode.Uri.file(projectPath));
  const cacheFolder = findCachedFolder(projectPath);
  const hasDevtoolConfig = fs.existsSync(getDevtoolConfigPath(projectPath));

  if (settingsType === undefined && cacheFolder === undefined && !hasDevtoolConfig) {
    return undefined;
  }

  const projectType = settingsType !== undefined
    ? (KNOWN_PROJECT_TYPES.has(settingsType) ? settingsType : detectProjectTypeSync(projectPath))
    : detectProjectTypeSync(projectPath);

  return {
    project_name: path.basename(projectPath),
    project_path: projectPath,
    project_type: projectType,
    // Explicit workspace setting only (the record is null unless create/open/sync
    // wrote an explicit script). The `/etc/profile` default stays in the readers
    // that use it (getEnvironmentScriptPathFromWorkspace for spawn paths) — the
    // record itself is never defaulted.
    ascend_env_script: getConfiguredEnvironmentScriptPath() ?? null,
    template_name: projectType === OperatorProjectType.TORCH_LIBRARY ? 'torch_library_template' : '',
  };
}

/**
 * Cache marker: the folder's scan state under `folders[normalizeProjectPath(path)]`.
 * A key stored under a differently-cased variant of the same path is matched
 * case-insensitively as well.
 */
function findCachedFolder(projectPath: string): FolderScanState | undefined {
  const folders = readWorkspaceCache(projectPath).folders;

  if (!folders) {
    return undefined;
  }

  const normalized = normalizeProjectPath(projectPath);
  const direct = folders[normalized];

  if (direct) {
    return direct;
  }

  for (const [
    key,
    value,
  ] of Object.entries(folders)) {
    if (normalizeProjectPath(key) === normalized) {
      return value;
    }
  }

  return undefined;
}
