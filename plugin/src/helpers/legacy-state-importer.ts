import * as fs from 'fs';
import * as path from 'path';
import {
  normalizeProjectPath, projectPathsEqual,
} from '@plugin/domain/models/project-model';
import {
  ConfigService,
  LegacyConfigRow,
  LegacySources,
  dedupeLegacyRowsByTypeAndOp,
  locateLegacySources,
  mergeLegacyConfigs,
  readSettingsJsonFile,
  runLegacySettingsStep,
} from '@plugin/service/config-service';
import { getIdeSettingsFilePath } from '@plugin/helpers/ide-config-dir';
import { AsyncSingleFlight } from '@plugin/helpers/async-single-flight';
import {
  FileMapEntry,
  FolderScanState,
  seedIfMissing,
  updateWorkspaceCache,
} from '@plugin/helpers/workspace-cache';
import { SETTINGS_PREFIX } from '@shared/flavor';
import { getFirstWorkspaceFolderPath } from '@plugin/helpers/operator-project-workspace-config';

/**
 * Versioned one-time import of the persisted host-global state.
 *
 * At activation the importer copies the host-global state (projects/configs/ops
 * stores, the workspace configs store, the remote config) into the workspace —
 * settings.json (via {@link runLegacySettingsStep}) and `.vscode/cache.json`
 * (via {@link hydrateCacheFromLegacy}).
 *
 * Versioning: `op-devtools.internal.settingsVersion` in settings.json records
 * the plugin version that completed the import. Semver steps
 * (`{ since, run }`) run when `stored < since <= current`; the marker is
 * written LAST (a crash between steps leaves the old version and the import is
 * retried — seedIfMissing merges make the retry converge). A stored version
 * >= current (downgrade) is a full no-op.
 *
 * Invariants:
 *  - the source stores are READ ONLY — never deleted, never recreated
 *    (fs.existsSync only; the store APIs would recreate empty files),
 *  - only the CURRENT project (the opened workspace root) is imported — rows of
 *    other projects are untouched,
 *  - never throws: every step failure is logged and skipped.
 */

/** Relative key under `op-devtools`; the marker = plugin version that completed the import. */
export const SETTINGS_VERSION_KEY = 'internal.settingsVersion';

/** Semver compare on `major.minor.patch` (prerelease/build ignored; unparsable → 0.0.0). */
export function compareSemver(a: string, b: string): number {
  const parse = (value: string): number[] => {
    const nums = (value || '').split('-')[0]
      .split('.')
      .map((part) => {
        const n = Number.parseInt(part, 10);

        return Number.isNaN(n) ? 0 : n;
      });

    while (nums.length < 3) {
      nums.push(0);
    }

    return nums.slice(0, 3);
  };

  const A = parse(a);
  const B = parse(b);

  for (let i = 0; i < 3; i += 1) {
    if (A[i] !== B[i]) {
      return A[i] < B[i] ? -1 : 1;
    }
  }

  return 0;
}

export type MigrationStep = {
  /** Run when `storedVersion < since <= currentVersion`. */
  since: string;
  /** @returns true when the step wrote anything (settings.json or cache.json). */
  run: (root: string, sources: LegacySources)=> Promise<boolean>;
};

/**
 * Step 0.0.1: seed settings.json + cache.json from the legacy stores of the
 * current project (the workspace root).
 */
export const MIGRATION_STEPS: MigrationStep[] = [
  {
    since: '0.0.1',
    run: runVersionedImportStep,
  },
];

const importFlight = new AsyncSingleFlight<void>();

/** @internal — reset the import single-flight between tests. */
export function resetLegacyImportFlightForTest(): void {
  importFlight.reset();
}

/**
 * Versioned one-time import for the opened workspace. No-op when the stored
 * marker is already >= `currentVersion`. Never throws.
 */
export async function importLegacyWorkspaceState(
  currentVersion: string,
  opts: { targetProjectPath?: string } = {},
): Promise<void> {
  const root = opts.targetProjectPath ?? getFirstWorkspaceFolderPath();

  if (!root) {
    return;
  }

  await importFlight.run(async () => {
    try {
      const storedVersion = readStoredSettingsVersion(root);

      if (storedVersion !== undefined && compareSemver(storedVersion, currentVersion) >= 0) {
        return;
      }

      const from = storedVersion ?? '0.0.0';
      const sources = locateLegacySources(root);
      let anyStepFailed = false;
      let anyStepRan = false;
      let wroteAnything = false;

      for (const step of MIGRATION_STEPS) {
        const isPending = compareSemver(from, step.since) < 0
          && compareSemver(step.since, currentVersion) <= 0;

        if (!isPending) {
          continue;
        }

        anyStepRan = true;

        try {
          if (sources) {
            wroteAnything = (await step.run(root, sources)) || wroteAnything;
          }
        }
        catch (error) {
          anyStepFailed = true;
          console.warn('[legacy-state-importer] step failed:', step.since, root, error);
        }
      }

      // Marker written LAST, and ONLY when the import actually completed: a
      // crash between steps leaves the old version (retried next launch), and
      // a FAILED step suppresses the marker too — a partially written import
      // (e.g. broken source store) must be retried, not marked complete.
      // `wroteAnything || !sources || !anyStepRan`: an empty-but-valid import
      // (no sources, or no pending steps — already at the target version) still
      // records the marker, so re-runs stay no-ops.
      if (!anyStepFailed && (wroteAnything || !sources || !anyStepRan)) {
        await ConfigService.writeOpDevtoolsDottedSettings({ [SETTINGS_VERSION_KEY]: currentVersion }, root);
      }
    }
    catch (error) {
      console.warn('[importLegacyWorkspaceState] failed:', root, error);
    }
  });
}

function readStoredSettingsVersion(root: string): string | undefined {
  const settings = readSettingsJsonFile(getIdeSettingsFilePath(root));
  const value = settings[`${SETTINGS_PREFIX}.${SETTINGS_VERSION_KEY}`];

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

type LegacyProjectRow = {
  id: number;
  project_path?: string | null;
  project_type?: string | null;
  ascend_env_script?: string | null;
  ops_meet?: Array<{ name: string;
    path: string }> | null;
  ops_list?: Array<{ name: string;
    path: string;
    isCompiled?: boolean }> | null;
  experimental_ops_list?: Array<{ name: string;
    path: string;
    isCompiled?: boolean }> | null;
  selected_operator_ids?: number[] | null;
};

function readJsonFile<T>(filePath: string): T | undefined {
  try {
    if (!fs.existsSync(filePath)) {
      return undefined;
    }

    const raw = fs.readFileSync(filePath, 'utf8')
      .trim();

    if (!raw) {
      return undefined;
    }

    return JSON.parse(raw) as T;
  }
  catch (error) {
    console.warn('[legacy-state-importer] failed to read:', filePath, error);

    return undefined;
  }
}

/** The project row of the CURRENT workspace root (join key for the import). */
function findProjectRow(sources: LegacySources, root: string): LegacyProjectRow | undefined {
  const store = readJsonFile<{ projects?: LegacyProjectRow[] }>(sources.projectsFile);

  if (!store?.projects?.length) {
    return undefined;
  }

  return store.projects.find((row) => Boolean(row.project_path) && projectPathsEqual(row.project_path as string, root));
}

/** Settings step + cache hydrate for the current project. */
async function runVersionedImportStep(root: string, sources: LegacySources): Promise<boolean> {
  const projectRow = findProjectRow(sources, root);

  if (!projectRow) {
    return false;
  }

  let wroteAnything = false;

  wroteAnything = (await runLegacySettingsStep(root)) || wroteAnything;

  // Carry the canonical project_type from the persisted projects.json value
  // ('cann'/'ascend'/'pyasc'/'triton', 'ascend' verbatim for standard-custom
  // collections) into the workspace `projectType` setting. This is a
  // PASS-THROUGH, never a mapping: the synthesized record must not reclassify
  // imported workspaces as 'standard-custom'. Skipped when the row carries no
  // type (openProject persists the synthesized type instead).
  if (projectRow.project_type) {
    wroteAnything = (await ConfigService.writeOpDevtoolsDottedSettings(
      { projectType: projectRow.project_type },
      root,
    )) || wroteAnything;
  }

  wroteAnything = (await hydrateCacheFromLegacy(root, sources, projectRow)) || wroteAnything;

  return wroteAnything;
}

/**
 * Merge the legacy state into cache.json: every field is seeded
 * seedIfMissing-style — state already present (runtime writes, or a prior
 * partial import) is NEVER clobbered. One atomic write per import.
 *
 * @returns true when cache.json was written.
 */
async function hydrateCacheFromLegacy(
  root: string,
  sources: LegacySources,
  projectRow: LegacyProjectRow,
): Promise<boolean> {
  // Dedup by (config_type, op) AFTER the project_id filter (row-pick
  // semantics: the first matching row wins) — rows of other projects with the
  // same operator name must not be deduped away.
  const projectConfigs = dedupeLegacyRowsByTypeAndOp(mergeLegacyConfigs(sources)
    .filter((row) => row.project_id === projectRow.id));

  return updateWorkspaceCache(root, (cache) => {
    cache.project = {
      selectedOperatorPaths: seedIfMissing(cache.project?.selectedOperatorPaths, deriveSelectedOperatorPaths(projectRow)),
      compiledOpPaths: seedIfMissing(cache.project?.compiledOpPaths, deriveCompiledOpPaths(projectRow)),
    };

    const folderState = deriveFolderState(projectRow, deriveOpsTypeByName(sources, projectRow.id));
    const rootKey = normalizeProjectPath(root);

    cache.folders = {
      ...(cache.folders ?? {}),
      [rootKey]: seedIfMissing(cache.folders?.[rootKey], folderState),
    };

    cache.fileMapLists = {
      sanitizer: seedIfMissing(cache.fileMapLists?.sanitizer, fileMapListOf(projectConfigs, 'sanitizer')),
      simulate: seedIfMissing(cache.fileMapLists?.simulate, fileMapListOf(projectConfigs, 'simulate')),
      on_board: seedIfMissing(cache.fileMapLists?.on_board, fileMapListOf(projectConfigs, 'on_board')),
    };

    cache.sanitizerPythonTarget = seedIfMissing(cache.sanitizerPythonTarget, deriveSanitizerPythonTarget(projectConfigs));

  });
}

/**
 * Reverse-re-key `selected_operator_ids` to paths. The legacy synthetic id
 * formula is `rootProject.id * 10000 + index` for regular ops and
 * `rootProject.id * 10000 + 1000 + index` for experimental ops — the shape the
 * old registry-based tree produced.
 */
function deriveSelectedOperatorPaths(projectRow: LegacyProjectRow): string[] {
  const ids = projectRow.selected_operator_ids ?? [];
  const regular = projectRow.ops_list ?? [];
  const experimental = projectRow.experimental_ops_list ?? [];
  const paths: string[] = [];

  for (const id of ids) {
    const rootId = Math.floor(id / 10000);

    if (rootId !== projectRow.id) {
      continue;
    }

    const index = id % 10000;

    if (index >= 1000) {
      const op = experimental[index - 1000];

      if (op?.path) {
        paths.push(op.path);
      }
    }
    else {
      const op = regular[index];

      if (op?.path) {
        paths.push(op.path);
      }
    }
  }

  return paths;
}

/** Paths of compiled sub-operators (standard-custom), keyed by path → true. */
function deriveCompiledOpPaths(projectRow: LegacyProjectRow): Record<string, boolean> {
  const compiled: Record<string, boolean> = {};
  const ops = [
    ...(projectRow.ops_list ?? []),
    ...(projectRow.experimental_ops_list ?? []),
  ];

  for (const op of ops) {
    if (op.isCompiled === true && op.path) {
      compiled[op.path] = true;
    }
  }

  return compiled;
}

function deriveFolderState(
  projectRow: LegacyProjectRow,
  opsTypeByName: Map<string, string>,
): FolderScanState {
  const withOpType = (ops: Array<{ name: string;
    path: string;
    isCompiled?: boolean }>) => ops.map((op) => {
    const opType = opsTypeByName.get(op.name);

    return opType === undefined
      ? op
      : {
        ...op,
        opType,
      };
  });

  return {
    opsMeet: projectRow.ops_meet ?? [],
    opsList: withOpType(projectRow.ops_list ?? []),
    experimentalOpsList: withOpType(projectRow.experimental_ops_list ?? []),
  };
}

/**
 * op name → legacy ops.json op_type for the project's rows. The op_type is the
 * base discriminator between a migrated standard-custom sub-operator ('cann'
 * rows — the cann command forms) and a plugin-created one ('ascend', base
 * viewIdToProjectType(2) — the ascend command forms).
 */
function deriveOpsTypeByName(sources: LegacySources, projectRowId: number): Map<string, string> {
  const store = readJsonFile<{ ops?: Array<{ project_id?: number;
    op_name?: string;
    op_type?: string }> }>(sources.opsFile);
  const map = new Map<string, string>();

  for (const row of store?.ops ?? []) {
    if (row.project_id === projectRowId && typeof row.op_name === 'string' && typeof row.op_type === 'string') {
      map.set(row.op_name, row.op_type);
    }
  }

  return map;
}

function fileMapListOf(rows: LegacyConfigRow[], configType: string): FileMapEntry[] {
  const row = rows.find((r) => r.config_type === configType);
  const list = row?.user_options?.fileMapList;

  return Array.isArray(list) ? (list as FileMapEntry[]) : [];
}

/** Per-operator sanitizer Python target (e.g. Triton `python3 <file>`), keyed by op name. */
function deriveSanitizerPythonTarget(rows: LegacyConfigRow[]): Record<string, string> {
  const target: Record<string, string> = {};

  for (const row of rows) {
    const op = row.user_options?.op;
    const targetFile = row.user_options?.target_file;

    if (typeof op === 'string' && op.trim() && typeof targetFile === 'string' && targetFile.trim()) {
      target[op] = targetFile;
    }
  }

  return target;
}
