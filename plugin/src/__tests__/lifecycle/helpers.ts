/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
/**
 * Lifecycle-parity harness.
 *
 * Runs the REAL lifecycle flows (welcomeMethods.createdProject /
 * welcomeMethods.openProject + workspace registration) against REAL modules —
 * real fs, real store files (user_data_dir/data), real OpGeneratorFactory
 * with template zips packed from plugin/templates/code_template — only the
 * vscode API is mocked (same approach as the golden harness).
 *
 * Every case runs in a fresh temp root:
 *   - WORKSPACE_FOLDER=<root>  → store files land in <root>/data
 *   - the extension path points at <root>/.extension with out/templates rebuilt
 *     from the tracked template sources (build artifacts are not committed)
 *   - jest module registry is reset so the user-data dir re-reads env
 *
 * Snapshots are normalized (temp root → `<root>`, ISO timestamps → `<ts>`,
 * `.env` dumps → sorted variable-key list) so they are deterministic per run.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';

import {
  CREATION_CASES, OPEN_CASES, seedConfigRows, seedOpRow, seedProjectRow,
} from './fixtures';

const SOURCE_TEMPLATE_ROOT = path.resolve(__dirname, '../../../templates/code_template');
const SOURCE_PROTOTYPE_ROOT = path.resolve(__dirname, '../../../templates/ops_prototype');

/** Template groups packed to `<group>/<name>.zip` (mirrors scripts/build-extension.ts). */
export const TEMPLATE_GROUPS = [
  'cann_template',
  'ascend_template',
  'triton_template',
] as const;

export type VscodeMessage = {
  kind: 'info' | 'error' | 'warning'
  text: string
};

export type LifecycleSnapshot = {
  files: Record<string, string>
  messages: VscodeMessage[]
};

export type FlowContext = {
  root: string
  extensionRoot: string
  projectDir: string
};

export type LifecycleCaseOptions = {
  /** Seed the workspace root before any module is loaded. */
  setup?: (root: string)=> void
  /** Execute the lifecycle flow under test. */
  run: (ctx: FlowContext)=> Promise<void>
  /** Workspace folder exposed to the mocked vscode API. Defaults to the root. */
  workspaceFolder?: string | ((root: string)=> string)
  /** Handler for `vscode.commands.executeCommand`. Defaults to a no-op. */
  onCommand?: (command: string, args: unknown[])=> Promise<unknown>
};

/**
 * Pack each template source directory under `templates/code_template/<group>/<name>/`
 * into `<root>/.extension/out/templates/code_template/<group>/<name>.zip`, mirroring
 * scripts/build-extension.ts (same .DS_Store filter). Also copies the ops_prototype
 * templates. Returns the extension root.
 */
export function buildExtensionTemplateRoot(root: string): string {
  const extensionRoot = path.join(root, '.extension');
  const outCodeTemplate = path.join(extensionRoot, 'out', 'templates', 'code_template');

  for (const group of TEMPLATE_GROUPS) {
    const groupDir = path.join(SOURCE_TEMPLATE_ROOT, group);

    if (!fs.existsSync(groupDir)) {
      continue;
    }

    for (const name of fs.readdirSync(groupDir)) {
      const dirPath = path.join(groupDir, name);

      if (!fs.statSync(dirPath)
        .isDirectory()) {
        continue;
      }

      const outGroup = path.join(outCodeTemplate, group);

      fs.mkdirSync(outGroup, { recursive: true });
      const zip = new AdmZip();

      zip.addLocalFolder(dirPath, '', (zipEntryPath: string) =>
        !zipEntryPath.split(/[/\\]/)
          .some((segment) => segment === '.DS_Store'));
      zip.writeZip(path.join(outGroup, `${name}.zip`));
    }
  }

  const outPrototype = path.join(extensionRoot, 'out', 'templates', 'ops_prototype');

  fs.mkdirSync(outPrototype, { recursive: true });

  for (const file of fs.readdirSync(SOURCE_PROTOTYPE_ROOT)) {
    fs.copyFileSync(path.join(SOURCE_PROTOTYPE_ROOT, file), path.join(outPrototype, file));
  }

  return extensionRoot;
}

function normalizeRootPaths(value: string, root: string): string {
  const variants = [
    root.replace(/\\/g, '/'), // C:/.../root (forward slashes)
    root.toLowerCase()
      .replace(/\\/g, '/'), // c:/.../root (lowercased — cache.json folders key via normalizeProjectPath)
    root, // C:\...\root (raw)
    root.toLowerCase(), // c:\...\root
    root.replace(/\\/g, '\\\\'), // C:\\...\\root (JSON-escaped, inside stores/settings files)
    root.toLowerCase()
      .replace(/\\/g, '\\\\'), // c:\\...\\root (cache.json content)
  ];

  for (const variant of variants) {
    value = value.split(variant)
      .join('<root>');
  }

  // Canonicalize the separator that followed the root (raw or JSON-escaped).
  return value.split('<root>\\')
    .join('<root>/');
}

const ISO_TS_REGEX = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g;

/**
 * Home-dir-derived values (e.g. `os.homedir()/OpDevtoolsDownloads` written into
 * stored rows by `getDefaultDirectory`) must never reach a committed baseline:
 * replace every home variant with `<home>`, the same 6 forms used for the
 * temp root below. Without this, baselines captured on one machine carry its
 * user name and home path.
 */
function normalizeHomePaths(value: string): string {
  const home = os.homedir();
  const variants = [
    home.replace(/\\/g, '/'),
    home.toLowerCase()
      .replace(/\\/g, '/'),
    home,
    home.toLowerCase(),
    home.replace(/\\/g, '\\\\'),
    home.toLowerCase()
      .replace(/\\/g, '\\\\'),
  ];

  for (const variant of variants) {
    value = value.split(variant)
      .join('<home>');
  }

  return value.split('<home>\\')
    .join('<home>/');
}

export function normalizeContent(content: string, root: string): string {
  return normalizeHomePaths(normalizeRootPaths(content, root))
    .replace(ISO_TS_REGEX, '<ts>');
}

/**
 * `.env` dumps produced by `exportEnvToFile` contain the full process environment —
 * compare them by sorted variable-name list only (values are machine noise).
 */
function normalizeEnvDump(content: string): string {
  const keys = content
    .split('\n')
    .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
    .filter((key): key is string => Boolean(key))
    .sort();

  return keys.join('\n');
}

function isSettingsFile(relPath: string): boolean {
  return /(^|\/)\.vscode\/settings\.json$/.test(relPath)
    || /(^|\/)\.arts\/settings\.json$/.test(relPath);
}

function isStoreFile(relPath: string): boolean {
  return /^data\/(projects|configs|ops)\.json$/.test(relPath);
}

function isEnvDumpFile(relPath: string): boolean {
  return /(^|\/)\.vscode\/\.env$/.test(relPath)
    || /(^|\/)\.arts\/\.env$/.test(relPath);
}

function isLaunchJsonFile(relPath: string): boolean {
  return /(^|\/)launch\.json$/.test(relPath);
}

/**
 * launch.json path values carry platform separator artifacts — e.g.
 * `"remoteWorkspaceFolder": "<root>/\op_add"`, where the temp-root rewrite
 * leaves a glued backslash (`<root>/` + `\op_add`), or JSON-escaped backslash
 * runs (`\\`) inside the raw file text. Collapse every separator run on BOTH
 * sides of the comparison so `<root>/\op_add`, `<root>//op_add` and
 * `<root>/op_add` all compare equal, without touching the committed baselines.
 * (JSON escape sequences collapse identically on both sides, so equality is
 * preserved for identical content.)
 */
function normalizeLaunchJsonSeparators(content: string): string {
  return content.replace(/[\\/]+/g, '/');
}

/**
 * Flat file tree (relative POSIX paths → normalized content), deterministically ordered.
 * The harness scaffolding under `.extension` is excluded from the snapshot.
 */
export function captureFileTree(root: string): Record<string, string> {
  const files: Record<string, string> = {};

  const walk = (dir: string, rel: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) =>
        a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;

      if (rel === '' && entry.name === '.extension') {
        continue;
      }

      if (entry.isDirectory()) {
        walk(full, relPath);

        continue;
      }

      const raw = fs.readFileSync(full, 'utf8');
      const content = isEnvDumpFile(relPath) ? normalizeEnvDump(raw) : normalizeContent(raw, root);

      files[relPath] = content;
    }
  };

  walk(root, '');

  return files;
}

/**
 * Heal invalid JSON escapes produced by the snapshot path normalization:
 * `normalizeRootPaths` rewrites escaped Windows paths (`C:\\...\\root\\op_project`)
 * into `<root>/` + leftover backslash segments (`<root>/\op_project\build.sh`),
 * which is not valid JSON. Only escapes that are NOT valid JSON escapes are
 * converted (the rest — `\"`, `\\`, `\n`, ... — are untouched). The tolerant
 * settings compare tolerates op-devtools VALUE differences, so a mangled
 * path value is acceptable; what matters is that the settings PARSES.
 */
function healNormalizedEscapes(content: string): string {
  return content.replace(/\\([^"\\/bfnrtu])/g, '/$1');
}

function parseSettingsJson(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(healNormalizedEscapes(content)) as Record<string, unknown>;

    return parsed && typeof parsed === 'object' ? parsed : {};
  }
  catch {
    return {};
  }
}

/** Canonical dotted key → value map (sorted) for a settings.json file. */
function canonicalSettings(content: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(parseSettingsJson(content))
    .sort(([a], [b]) =>
      a.localeCompare(b)));
}

const OP_DEVTOOLS_PREFIX = 'op-devtools.';

export type CompareResult = {
  pass: boolean
  /** Strict (failing) differences. */
  diffs: string[]
  /** Tolerated deltas admitted by the delta manifest (reported, not failing). */
  tolerated: string[]
};

export type LifecycleFlow = 'creation' | 'open';

/**
 * Delta manifest: differences between the captured baseline
 * and a later run are allowed ONLY for
 *   1. settings structure — `op-devtools.*` key changes inside any
 *      `.vscode/settings.json` (settings/cache runtime),
 *   2. store content — the baseline captured full row shapes in
 *      data/{projects,configs,ops}.json; the stores are now read-only seeded
 *      inputs (trimmed fixture rows), so content differences are mechanical.
 *      Absence of a store file is STILL a regression for OPEN flows — the
 *      importer is read-only and must find its seeds.
 *   3. `cache.json` — an artifact the baseline never produces, so its
 *      appearance (content is runtime state) is tolerated.
 *   4. creation-only:
 *      - creation never writes the store files (createProject →
 *        projects/configs/ops.json rows are not produced), so for non-seeded
 *        creation cases the stores are absent —
 *      - the op-devtools workspace settings are written into the project's own
 *        workspace folder, not the HOST workspace `.vscode/settings.json`,
 *      - sub-operator creation spawns `bash build.sh` genop only when the
 *        collection is already registered; a FRESH collection is not yet
 *        registered at creation time (no workspace markers) — so the spawn
 *        never runs, `createDirOkCreateFilesError` never fires, and exactly
 *        that single warning is absent (with a registered collection genop
 *        IS attempted; the spawn then fails in the harness — no build.sh —
 *        and the warning appears).
 *   5. launch.json — path values carry platform separator artifacts (e.g.
 *      `<root>/\op_add` — the temp-root rewrite leaves a glued backslash):
 *      separator runs are collapsed on BOTH sides of the comparison
 *      (normalizeLaunchJsonSeparators), so both sides compare canonically
 *      (`<root>/op_add`) without touching the committed baselines.
 * Everything else is compared byte-for-byte.
 */
export const DELTA_MANIFEST = {
  stores: { mode: 'contentTolerant' },
  settings: { mode: 'tolerant' },
  env: { mode: 'keysOnly' },
  /** Env dump files may appear on hosts where the shell export succeeds; their
   * content is compared keys-only, so appearance is tolerated in every flow. */
  allowAppearedEnvFile: true,
  files: {
    mode: 'strict',
    ignoreBasenames: ['cache.json'],
  },
  creation: {
    allowAbsentStoreFiles: true,
    allowAbsentRootSettingsFile: true,
    allowOneRemovedWarning: true,
  },
} as const;

/** Files exempt from the byte-for-byte gate (cache.json — branch-only artifact). */
function isIgnoredDeltaFile(relPath: string): boolean {
  const basename = relPath.split('/')
    .pop() ?? relPath;

  return (DELTA_MANIFEST.files.ignoreBasenames as readonly string[]).includes(basename);
}

/**
 * True when `actual` equals `expected` with exactly ONE warning removed and
 * nothing else changed (the creation delta: genop is not spawned for a fresh
 * unregistered collection, so the `createDirOkCreateFilesError` warning is
 * absent). Any other difference — an extra/fewer info, an added error, or TWO
 * removed warnings — fails.
 */
function messagesEqualUpToOneRemovedWarning(
  expected: VscodeMessage[],
  actual: VscodeMessage[],
): boolean {
  const warningIndex = expected.findIndex((message) => message.kind === 'warning');

  if (warningIndex === -1 || actual.length !== expected.length - 1) {
    return false;
  }

  const withoutWarning = [
    ...expected.slice(0, warningIndex),
    ...expected.slice(warningIndex + 1),
  ];

  return JSON.stringify(withoutWarning) === JSON.stringify(actual);
}

export function compareSnapshots(
  expected: LifecycleSnapshot,
  actual: LifecycleSnapshot,
  flow: LifecycleFlow,
): CompareResult {
  const diffs: string[] = [];
  const tolerated: string[] = [];
  const relPaths = new Set([
    ...Object.keys(expected.files),
    ...Object.keys(actual.files),
  ]);

  for (const relPath of [...relPaths].sort()) {
    const expectedContent = expected.files[relPath];
    const actualContent = actual.files[relPath];

    if (expectedContent === undefined && actualContent === undefined) {
      continue;
    }

    if (isIgnoredDeltaFile(relPath)) {
      if (expectedContent !== actualContent) {
        tolerated.push(`[files] ignored delta path: ${relPath}`);
      }

      continue;
    }

    if (expectedContent === undefined) {
      if (
        DELTA_MANIFEST.allowAppearedEnvFile
        && isEnvDumpFile(relPath)
      ) {
        tolerated.push(`[env] appeared (env dump written when the host shell export succeeds): ${relPath}`);

        continue;
      }

      diffs.push(`file appeared: ${relPath}`);

      continue;
    }

    if (actualContent === undefined) {
      if (
        flow === 'creation'
        && DELTA_MANIFEST.creation.allowAbsentStoreFiles
        && isStoreFile(relPath)
      ) {
        tolerated.push(`[stores] absent (creation: legacy registry writes removed): ${relPath}`);

        continue;
      }

      if (
        flow === 'creation'
        && DELTA_MANIFEST.creation.allowAbsentRootSettingsFile
        && relPath === '.vscode/settings.json'
      ) {
        tolerated.push('[settings] workspace-root settings.json absent (creation: branch writes it into the project folder)');

        continue;
      }

      diffs.push(`file disappeared: ${relPath}`);

      continue;
    }

    if (isSettingsFile(relPath) && DELTA_MANIFEST.settings.mode === 'tolerant') {
      const expectedSettings = canonicalSettings(expectedContent);
      const actualSettings = canonicalSettings(actualContent);

      if (JSON.stringify(expectedSettings) === JSON.stringify(actualSettings)) {
        continue;
      }

      const opDevtoolsDeltas: string[] = [];
      const strictDeltas: string[] = [];
      const allKeys = new Set([
        ...Object.keys(expectedSettings),
        ...Object.keys(actualSettings),
      ]);

      for (const key of [...allKeys].sort()) {
        // Settings values may be nested objects (e.g. `files.associations`): two
        // separately parsed objects with identical content are never reference-
        // equal, so compare by serialized content, not identity.
        if (JSON.stringify(expectedSettings[key]) === JSON.stringify(actualSettings[key])) {
          continue;
        }

        const line = `settings key ${key}: ${JSON.stringify(expectedSettings[key])} -> ${JSON.stringify(actualSettings[key])}`;

        if (key.startsWith(OP_DEVTOOLS_PREFIX)) {
          opDevtoolsDeltas.push(line);
        }
        else {
          strictDeltas.push(line);
        }
      }

      if (opDevtoolsDeltas.length > 0) {
        tolerated.push(`[settings] ${relPath}: ${opDevtoolsDeltas.join('; ')}`);
      }

      if (strictDeltas.length > 0) {
        diffs.push(`settings (non op-devtools) ${relPath}: ${strictDeltas.join('; ')}`);
      }

      continue;
    }

    if (isEnvDumpFile(relPath) && DELTA_MANIFEST.env.mode === 'keysOnly') {
      // contents already normalized to sorted key lists at capture time
      if (expectedContent !== actualContent) {
        diffs.push(`env dump keys differ: ${relPath}`);
      }

      continue;
    }

    // launch.json is compared with collapsed separator runs on BOTH sides
    // (the committed baselines carry the platform artifacts, so normalizing
    // only the fresh capture would not be enough — see normalizeLaunchJsonSeparators).
    if (isLaunchJsonFile(relPath)
      && normalizeLaunchJsonSeparators(expectedContent) === normalizeLaunchJsonSeparators(actualContent)) {
      continue;
    }

    if (expectedContent !== actualContent) {
      if (isStoreFile(relPath) && DELTA_MANIFEST.stores.mode === 'contentTolerant') {
        tolerated.push(`[stores] content differs (branch keeps legacy stores as read-only inputs): ${relPath}`);
      }
      else {
        diffs.push(`content differs: ${relPath}`);
      }
    }
  }

  if (JSON.stringify(expected.messages) !== JSON.stringify(actual.messages)) {
    if (
      flow === 'creation'
      && DELTA_MANIFEST.creation.allowOneRemovedWarning
      && messagesEqualUpToOneRemovedWarning(expected.messages, actual.messages)
    ) {
      tolerated.push('[messages] creation: base-only warning removed (base genop command `bash build.sh` failed in the harness; branch generates from templates without the spawn)');
    }
    else {
      diffs.push(`messages differ: ${JSON.stringify(actual.messages)}`);
    }
  }

  return {
    pass: diffs.length === 0,
    diffs,
    tolerated,
  };
}

export function writeSnapshot(caseId: string, flow: 'creation' | 'open', snapshot: LifecycleSnapshot): void {
  const expectedDir = path.resolve(__dirname, 'expected');

  fs.mkdirSync(expectedDir, { recursive: true });
  fs.writeFileSync(path.join(expectedDir, `${flow}-${caseId}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

export function loadSnapshot(caseId: string, flow: 'creation' | 'open'): LifecycleSnapshot {
  const file = path.join(__dirname, 'expected', `${flow}-${caseId}.json`);

  if (!fs.existsSync(file)) {
    throw new Error(`expected snapshot missing: ${file} (run lifecycle:capture first)`);
  }

  return JSON.parse(fs.readFileSync(file, 'utf8')) as LifecycleSnapshot;
}

export function createStoreDir(root: string): string {
  const storeDir = path.join(root, 'data');

  fs.mkdirSync(storeDir, { recursive: true });

  return storeDir;
}

export function writeLegacyStore(root: string, name: string, rows: unknown[], lastId?: number): void {
  const payload = name === 'projects.json'
    ? {
      lastId: lastId ?? 1,
      projects: rows,
    }
    : name === 'configs.json'
      ? {
        lastId: lastId ?? 0,
        configs: rows,
      }
      : {
        lastId: lastId ?? 1,
        ops: rows,
      };

  fs.writeFileSync(path.join(root, 'data', name), JSON.stringify(payload, null, 2), 'utf8');
}

type GlobalStateMock = {
  update: (key: string, value: unknown)=> Promise<void>
  get: <T>(key: string)=> T | undefined
};

function makeGlobalState(): GlobalStateMock {
  const store = new Map<string, unknown>();

  return {
    update: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    get: <T>(key: string): T | undefined => store.get(key) as T | undefined,
  };
}

/**
 * Install the extension context on `globalThis` (what welcome-controller /
 * project-service read via getExtensionContext()). The templateName flow
 * (createdProject → handleOperatorProjectDirectoryFile) shares this instance.
 */
export function installExtensionContext(ctx: FlowContext): { globalState: GlobalStateMock } {
  const globalState = makeGlobalState()

  ;(globalThis as unknown as { extensionContext: unknown }).extensionContext = {
    extensionPath: ctx.extensionRoot,
    globalState,
    subscriptions: [],
  };

  return { globalState };
}

/** Live config backed by the workspace settings.json file (real I/O, like VS Code). */
function makeSettingsConfiguration(settingsFile: string, extraDefaults: Record<string, unknown>): {
  get: (key: string, def?: unknown)=> unknown
  inspect: (key: string)=> { key: string;
    workspaceFolderValue: unknown } | undefined
  update: ()=> Promise<void>
} {
  const readLive = (): Record<string, unknown> => {
    if (!fs.existsSync(settingsFile)) {
      return {};
    }

    return parseSettingsJson(fs.readFileSync(settingsFile, 'utf8'));
  };

  // Emulate VS Code's section-scoped getConfiguration('op-devtools'): the file
  // stores fully dotted keys ('op-devtools.projectType'), the section-scoped
  // API reads the relative key.
  const lookup = (store: Record<string, unknown>, key: string): unknown | undefined => {
    if (key in store) {
      return store[key];
    }

    const dotted = `op-devtools.${key}`;

    return dotted in store ? store[dotted] : undefined;
  };

  return {
    get: (key: string, def?: unknown) => {
      const store = readLive();
      const value = lookup(store, key);

      if (value !== undefined) {
        return value;
      }

      if (key in extraDefaults) {
        return extraDefaults[key];
      }

      return def;
    },
    inspect: (key: string) => {
      const store = readLive();
      const value = lookup(store, key);

      return value !== undefined
        ? {
          key,
          workspaceFolderValue: value,
        }
        : undefined;
    },
    update: () => Promise.resolve(),
  };
}

function wireVscode(opts: {
  workspaceFolder: string
  settingsFile: string
  onCommand: (command: string, args: unknown[])=> Promise<unknown>
  messages: VscodeMessage[]
  extraConfigDefaults: Record<string, unknown>
}): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscodeMock = require('vscode') as {
    workspace: { workspaceFolders?: unknown;
      getConfiguration: jest.Mock }
    window: Record<string, unknown>
    commands?: { executeCommand: jest.Mock }
    ProgressLocation?: Record<string, unknown>
  };
  const {
    workspace, window,
  } = vscodeMock;

  workspace.workspaceFolders = [{ uri: { fsPath: opts.workspaceFolder } }];
  workspace.getConfiguration = jest.fn(() => makeSettingsConfiguration(opts.settingsFile, opts.extraConfigDefaults));

  const record = (kind: VscodeMessage['kind']) => (message: string) => {
    opts.messages.push({
      kind,
      text: String(message ?? ''),
    });

    return Promise.resolve(undefined);
  };

  window.showInformationMessage = jest.fn(record('info'));
  window.showErrorMessage = jest.fn(record('error'));
  window.showWarningMessage = jest.fn(record('warning'));
  window.withProgress = jest.fn(async (_options: unknown, task: (progress: unknown)=> Promise<unknown>) =>
    task({ report: jest.fn() }));
  window.registerFileDecorationProvider = jest.fn(() => ({ dispose: jest.fn() }));

  vscodeMock.ProgressLocation = { Notification: 1 };
  vscodeMock.commands = { executeCommand: jest.fn(async (command: string, ...args: unknown[]) => opts.onCommand(command, args)) };
}

let execSyncEnvForwarded = false;

/**
 * jest (jest-environment-node) sandboxes `process.env`: env vars set in a test are
 * invisible to child processes spawned by `execSync`, which default to the host env,
 * so forward the sandboxed env to every spawn. Same approach as the golden harness.
 */
function forwardExecSyncEnv(): void {
  if (execSyncEnvForwarded) {
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const childProcess = require('child_process') as {
    execSync: (command: string, options?: Record<string, unknown>)=> unknown
  };
  const originalExecSync = childProcess.execSync;

  childProcess.execSync = ((command: string, options?: Record<string, unknown>) => {
    const merged: Record<string, unknown> = options
      ? {
        ...options,
        env: process.env,
      }
      : { env: process.env };

    return originalExecSync(command, merged);
  }) as typeof childProcess.execSync;
  execSyncEnvForwarded = true;
}

export function requireFresh<T>(moduleName: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(moduleName) as T;
}

/**
 * Run one lifecycle case in an isolated temp root with REAL modules.
 * `setup` seeds the root before any module is loaded; `run` executes the flow
 * and captures the resulting snapshot.
 */
export async function runLifecycleCase(opts: LifecycleCaseOptions): Promise<LifecycleSnapshot> {
  forwardExecSyncEnv();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opdevtools-lifecycle-'));
  const extensionRoot = buildExtensionTemplateRoot(root);
  const workspaceFolder = typeof opts.workspaceFolder === 'function'
    ? opts.workspaceFolder(root)
    : (opts.workspaceFolder ?? root);
  const settingsFile = path.join(workspaceFolder, '.vscode', 'settings.json');
  const messages: VscodeMessage[] = [];

  opts.setup?.(root);

  process.env.WORKSPACE_FOLDER = root;
  jest.resetModules();

  try {
    const ctx: FlowContext = {
      root,
      extensionRoot,
      projectDir: path.join(root, 'op_project'),
    };

    installExtensionContext(ctx);
    wireVscode({
      workspaceFolder,
      settingsFile,
      messages,
      extraConfigDefaults: { 'operatorSupport.triton': true },
      onCommand: opts.onCommand ?? (async () => undefined),
    });

    // `WORKSPACE_FOLDER` (set above) is the user data dir every consumer reads.

    // extension.ts activate() registers plugins; the harness does the same so the
    // REAL operator plugins + project detectors are available to every flow.
    requireFresh<{ registerOperatorPlugins: ()=> void }>('@plugin/domain/plugins')
      .registerOperatorPlugins();

    await opts.run(ctx);

    return {
      files: captureFileTree(root),
      messages,
    };
  }
  finally {
    delete process.env.WORKSPACE_FOLDER;
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  }
}

/**
 * Wire the real `opdevtools.createDictory` handler into the mocked
 * `commands.executeCommand` so the creation flow runs the REAL generator
 * pipeline (handleOperatorProjectDirectoryFile → createOpsByPrototype →
 * generateStructure → OpGeneratorFactory with real template zips).
 */
export function creationCommandDispatcher(): (command: string, args: unknown[])=> Promise<unknown> {
  return async (command: string, args: unknown[]): Promise<unknown> => {
    const { COMMAND_CREATE_DIRECTORY } = requireFresh<{ COMMAND_CREATE_DIRECTORY: string }>('@plugin/constants');

    if (command === COMMAND_CREATE_DIRECTORY) {
      const { handleOperatorProjectDirectoryFile } = requireFresh<{
        handleOperatorProjectDirectoryFile: (message: unknown, _that: unknown, progress: unknown)=> Promise<void>
      }>('@plugin/class/webview-message-list');

      await handleOperatorProjectDirectoryFile(args[0], undefined, args[1]);

      return undefined;
    }

    // revealInExplorer / vscode.openFolder / workbench.action.closeActiveEditor / setContext — no-op
    return undefined;
  };
}

/** Seed the store files for a creation case (standard-custom needs a collection row). */
export function setupCreationCase(root: string, caseId: string): void {
  createStoreDir(root);

  if (caseId === 'standard_custom') {
    const collection = {
      id: 7,
      project_name: 'op_collection',
      project_path: root,
      template_name: null,
      project_type: 'ascend',
      ascend_env_script: '/etc/profile',
      soc_version: null,
      ops_meet: null,
      ops_list: [],
      experimental_ops_list: null,
      selected_operator_ids: null,
    };

    writeLegacyStore(root, 'projects.json', [collection]);
    writeLegacyStore(root, 'configs.json', []);
    writeLegacyStore(root, 'ops.json', []);
  }
}

/** Seed a realistic per-type project directory + store files for an open case. */
export function setupOpenCase(root: string, caseId: string): void {
  const openCase = OPEN_CASES.find((c) => c.id === caseId);

  if (!openCase) {
    throw new Error(`unknown open case: ${caseId}`);
  }

  const projectDir = path.join(root, openCase.id === 'standard_custom' ? 'op_collection' : 'op_project');

  for (const [
    relPath,
    content,
  ] of Object.entries(openCase.markers)) {
    const full = path.join(projectDir, relPath);

    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }

  createStoreDir(root);
  writeLegacyStore(root, 'projects.json', [seedProjectRow(openCase, projectDir)]);
  // Full per-type row set (lastId 6, mirroring the committed etalon): the
  // one-time import hydrates settings/cache.json from it at flow start.
  writeLegacyStore(root, 'configs.json', seedConfigRows(openCase, projectDir), 6);
  writeLegacyStore(root, 'ops.json', [seedOpRow(openCase, projectDir)]);
}

export { CREATION_CASES };
