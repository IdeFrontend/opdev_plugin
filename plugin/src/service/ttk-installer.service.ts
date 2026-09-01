import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type * as vscode from 'vscode';

import type { CommandExecutor } from '@plugin/class/command-options';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { buildSourcedPythonCommand } from '@plugin/domain/services/st-test-command';
import { StTestCancelledError } from '@plugin/domain/services/st-test-errors';
import { shellQuoteBash } from '@plugin/domain/utils/shell-env-exports';
import { isPathOutside } from '@plugin/domain/utils/st-test-paths';
import { resolvePythonExecutablePath } from '@plugin/domain/services/command-strategy/python-operator-strategy-shared';
import { appendLog } from '@plugin/helpers/output-channel';

export const OPS_TEST_KIT_REPOSITORY = 'https://gitcode.com/cann/ops-test-kit.git';

export const OPS_TEST_KIT_REVISION = 'e559b7f1f55040a5f6a8d3cb0c05e4d6f8e9a3fe';

const TTK_LOG_SCOPE = 'op-devtools/st-test/ttk';
const TTK_PROBE_TIMEOUT_MS = 10_000;
const PYTHON_PROBE_TIMEOUT_MS = 10_000;
const TTK_DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const TTK_INSTALL_TIMEOUT_MS = 10 * 60_000;
const TTK_LOCK_WAIT_TIMEOUT_MS = 20 * 60_000;
const TTK_LOCK_STALE_MS = 30 * 60_000;
const TTK_LOCK_POLL_MS = 250;
const TTK_RENAME_RETRY_ATTEMPTS = 20;
const TTK_RENAME_RETRY_DELAY_MS = 25;
const TTK_REMOVE_RETRY_ATTEMPTS = 20;
// An ownerless lock directory is only broken when it outlives the
// mkdir -> owner.json write window by far (that write happens immediately).
const OWNERLESS_LOCK_GRACE_MS = 5_000;
const CALLER_CANCELLATION_POLL_MS = 50;
const CACHE_SCHEMA_VERSION = 1;
const PYTHON_VERSION_SENTINEL = '__MSTT_PYTHON_VERSION__=';
const TTK_ROOT_SENTINEL = '__MSTT_TTK_ROOT__=';

type CancellationCheck = ()=> boolean;

export type TtkRuntime = {
  source: 'system' | 'managed';
  interpreter: string;
  versionOutput: string;
  pythonPathEntries: string[];
  workingDirectory: string;
};

type PythonRuntime = {
  interpreter: string;
  version: string;
  majorMinor: string;
};

type ManagedCachePaths = {
  root: string;
  source: string;
  dependencies: string;
  marker: string;
  lock: string;
};

type CacheMarker = {
  schemaVersion: number;
  revision: string;
  pythonMajorMinor: string;
};

type InstallerDependencies = {
  resolveInterpreter: ()=> string;
  getExecutor: ()=> CommandExecutor;
  createId: ()=> string;
  createLockToken: ()=> string;
  now: ()=> number;
  sleep: (milliseconds: number)=> Promise<void>;
};

type EnsureWaiter = {
  isCancellationRequested?: CancellationCheck;
  cancelled: boolean;
};

type InFlightEnsure = {
  promise: Promise<TtkRuntime>;
  waiters: Set<EnsureWaiter>;
};

type CacheLockOwner = {
  token: string;
  host: string;
  pid: number;
  createdAt: number;
};

export type EnsureTtkOptions = {
  environmentScriptPath?: string;
  isCancellationRequested?: CancellationCheck;
};

export class TtkInstallerService {
  private readonly inFlight = new Map<string, InFlightEnsure>();
  private readonly dependencies: InstallerDependencies;

  constructor(
    private readonly context: vscode.ExtensionContext,
    dependencies: Partial<InstallerDependencies> = {},
  ) {
    this.dependencies = {
      resolveInterpreter: dependencies.resolveInterpreter ?? resolvePythonExecutablePath,
      getExecutor: dependencies.getExecutor ?? (() => ProjectManager.getInstance()
        .getExecutor()),
      createId: dependencies.createId ?? randomUUID,
      createLockToken: dependencies.createLockToken ?? randomUUID,
      now: dependencies.now ?? Date.now,
      sleep: dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
      })),
    };
  }

  async ensureAvailable(options: EnsureTtkOptions = {}): Promise<TtkRuntime> {
    const interpreter = this.dependencies.resolveInterpreter();
    const key = `${interpreter}\n${options.environmentScriptPath ?? ''}`;
    const existing = this.inFlight.get(key);
    const waiter: EnsureWaiter = {
      isCancellationRequested: options.isCancellationRequested,
      cancelled: false,
    };

    if (existing) {
      existing.waiters.add(waiter);

      return this.awaitForCaller(existing, waiter);
    }

    const created: InFlightEnsure = {
      promise: undefined as unknown as Promise<TtkRuntime>,
      waiters: new Set([waiter]),
    };
    const sharedOptions: EnsureTtkOptions = {
      environmentScriptPath: options.environmentScriptPath,
      isCancellationRequested: () => this.areAllWaitersCancelled(created),
    };
    const pending = this.ensureAvailableOnce(interpreter, sharedOptions)
      .finally(() => {
        if (this.inFlight.get(key) === created) {
          this.inFlight.delete(key);
        }
      });

    created.promise = pending;
    this.inFlight.set(key, created);

    return this.awaitForCaller(created, waiter);
  }

  getManagedCachePaths(pythonMajorMinor: string): ManagedCachePaths {
    const root = path.join(
      this.context.globalStorageUri.fsPath,
      'ttk',
      OPS_TEST_KIT_REVISION,
      `python-${pythonMajorMinor}`,
    );

    return {
      root,
      source: path.join(root, 'ops-test-kit'),
      dependencies: path.join(root, 'dependencies'),
      marker: path.join(root, 'install.json'),
      lock: `${root}.lock`,
    };
  }

  private async ensureAvailableOnce(
    interpreter: string,
    options: EnsureTtkOptions,
  ): Promise<TtkRuntime> {
    this.throwIfCancelled(options.isCancellationRequested);

    const python = await this.resolvePythonRuntime(
      interpreter,
      options.environmentScriptPath,
      options.isCancellationRequested,
    );
    const systemProbe = await this.probeTtk({
      interpreter,
      environmentScriptPath: options.environmentScriptPath,
      pythonPathEntries: [],
      isCancellationRequested: options.isCancellationRequested,
    });

    if (systemProbe) {
      const workingDirectory = await this.resolveSystemTtkWorkingDirectory({
        interpreter,
        environmentScriptPath: options.environmentScriptPath,
        isCancellationRequested: options.isCancellationRequested,
      });

      if (workingDirectory) {
        appendLog(TTK_LOG_SCOPE, 'Using system TTK', {
          interpreter,
          version: this.firstOutputLine(systemProbe),
          workingDirectory,
        });

        return {
          source: 'system',
          interpreter,
          versionOutput: systemProbe,
          pythonPathEntries: [],
          workingDirectory,
        };
      }

      appendLog(TTK_LOG_SCOPE, 'System TTK root is unusable; trying managed TTK', { interpreter });
    }

    const cache = this.getManagedCachePaths(python.majorMinor);
    const cached = await this.tryManagedCache(
      cache,
      python,
      options.environmentScriptPath,
      options.isCancellationRequested,
    );

    if (cached) {
      return cached;
    }

    const releaseLock = await this.acquireManagedCacheLock(
      cache,
      options.isCancellationRequested,
    );

    try {
      this.throwIfCancelled(options.isCancellationRequested);

      const cacheAfterLock = await this.tryManagedCache(
        cache,
        python,
        options.environmentScriptPath,
        options.isCancellationRequested,
      );

      if (cacheAfterLock) {
        return cacheAfterLock;
      }

      return await this.provisionManagedCache(
        cache,
        python,
        options.environmentScriptPath,
        options.isCancellationRequested,
      );
    }
    finally {
      await releaseLock();
    }
  }

  private async resolvePythonRuntime(
    interpreter: string,
    environmentScriptPath: string | undefined,
    isCancellationRequested: CancellationCheck | undefined,
  ): Promise<PythonRuntime> {
    const command = buildSourcedPythonCommand({
      interpreter,
      environmentScriptPath,
      args: [
        '-c',
        `import sys; print("${PYTHON_VERSION_SENTINEL}%d.%d.%d" % sys.version_info[:3])`,
      ],
    });
    const result = await this.execute(command, PYTHON_PROBE_TIMEOUT_MS, isCancellationRequested);

    if (result.code !== 0) {
      throw new Error(`Python interpreter is unavailable: ${interpreter}`);
    }

    const match = result.stdout.match(/^__MSTT_PYTHON_VERSION__=(\d+)\.(\d+)\.(\d+)\r?$/m);

    if (!match) {
      throw new Error(`Cannot determine Python version: ${interpreter}`);
    }

    const major = Number(match[1]);
    const minor = Number(match[2]);
    const version = `${match[1]}.${match[2]}.${match[3]}`;

    if (major < 3 || (major === 3 && minor < 8)) {
      throw new Error(`TTK requires Python 3.8 or newer; found ${version}`);
    }

    return {
      interpreter,
      version,
      majorMinor: `${match[1]}.${match[2]}`,
    };
  }

  private async probeTtk(params: {
    interpreter: string;
    environmentScriptPath?: string;
    pythonPathEntries: readonly string[];
    isCancellationRequested?: CancellationCheck;
  }): Promise<string | undefined> {
    this.throwIfCancelled(params.isCancellationRequested);

    const command = buildSourcedPythonCommand({
      interpreter: params.interpreter,
      environmentScriptPath: params.environmentScriptPath,
      pythonPathEntries: params.pythonPathEntries,
      args: [
        '-m',
        'ttk',
        '-v',
      ],
    });

    try {
      const result = await this.execute(
        command,
        TTK_PROBE_TIMEOUT_MS,
        params.isCancellationRequested,
      );
      const output = `${result.stdout}\n${result.stderr}`.trim();

      if (result.code === 0 && /(?:^|\n)\s*TTK\s+v[^\r\n]*/i.test(output)) {
        return output;
      }

      appendLog(TTK_LOG_SCOPE, 'TTK probe was not usable', {
        code: result.code,
        signatureFound: /TTK\s+v/i.test(output),
      });
    }
    catch (error) {
      if (error instanceof StTestCancelledError) {
        throw error;
      }

      appendLog(TTK_LOG_SCOPE, 'TTK probe failed', { error: error instanceof Error ? error.message : String(error) });
    }

    return undefined;
  }

  private async resolveSystemTtkWorkingDirectory(params: {
    interpreter: string;
    environmentScriptPath?: string;
    isCancellationRequested?: CancellationCheck;
  }): Promise<string | undefined> {
    this.throwIfCancelled(params.isCancellationRequested);

    const command = buildSourcedPythonCommand({
      interpreter: params.interpreter,
      environmentScriptPath: params.environmentScriptPath,
      args: [
        '-c',
        `import os, ttk; print("${TTK_ROOT_SENTINEL}" + os.path.dirname(os.path.dirname(os.path.abspath(ttk.__file__))))`,
      ],
    });

    try {
      const result = await this.execute(
        command,
        TTK_PROBE_TIMEOUT_MS,
        params.isCancellationRequested,
      );

      if (result.code !== 0) {
        return undefined;
      }

      const rootLines = result.stdout.split(/\r?\n/)
        .filter((line) => line.startsWith(TTK_ROOT_SENTINEL));

      if (rootLines.length !== 1) {
        return undefined;
      }

      const workingDirectory = rootLines[0].slice(TTK_ROOT_SENTINEL.length);

      if (!(await this.isTtkWorkingDirectoryUsable(workingDirectory))) {
        return undefined;
      }

      return workingDirectory;
    }
    catch (error) {
      if (error instanceof StTestCancelledError) {
        throw error;
      }

      appendLog(TTK_LOG_SCOPE, 'Could not resolve a writable system TTK root', { error: error instanceof Error ? error.message : String(error) });

      return undefined;
    }
  }

  private async isTtkWorkingDirectoryUsable(workingDirectory: string): Promise<boolean> {
    if (!path.isAbsolute(workingDirectory)) {
      return false;
    }

    try {
      const rootStat = await fs.promises.stat(workingDirectory);

      if (!rootStat.isDirectory()) {
        return false;
      }

      await fs.promises.access(workingDirectory, fs.constants.X_OK);

      const kernelMetaPath = path.join(workingDirectory, 'kernel_meta');
      let kernelMetaStat: fs.Stats;

      try {
        kernelMetaStat = await fs.promises.lstat(kernelMetaPath);
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          return false;
        }

        await fs.promises.access(
          workingDirectory,
          fs.constants.W_OK | fs.constants.X_OK,
        );

        return true;
      }

      if (kernelMetaStat.isSymbolicLink() || !kernelMetaStat.isDirectory()) {
        return false;
      }

      await fs.promises.access(
        kernelMetaPath,
        fs.constants.W_OK | fs.constants.X_OK,
      );

      for (const artifactName of [
        'warmup.o',
        'warmup.json',
      ]) {
        const artifactPath = path.join(kernelMetaPath, artifactName);

        try {
          const artifactStat = await fs.promises.lstat(artifactPath);

          if (artifactStat.isSymbolicLink() || !artifactStat.isFile()) {
            return false;
          }

          await fs.promises.access(artifactPath, fs.constants.W_OK);
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            return false;
          }
        }
      }

      return true;
    }
    catch {
      return false;
    }
  }

  private async tryManagedCache(
    cache: ManagedCachePaths,
    python: PythonRuntime,
    environmentScriptPath: string | undefined,
    isCancellationRequested: CancellationCheck | undefined,
  ): Promise<TtkRuntime | undefined> {
    const marker = await this.readCacheMarker(cache.marker);

    if (
      !marker
      || marker.schemaVersion !== CACHE_SCHEMA_VERSION
      || marker.revision !== OPS_TEST_KIT_REVISION
      || marker.pythonMajorMinor !== python.majorMinor
      || !fs.existsSync(path.join(cache.source, 'requirements.txt'))
      || !fs.existsSync(cache.dependencies)
    ) {
      return undefined;
    }

    if (!(await this.isPinnedCheckout(cache.source, isCancellationRequested))) {
      return undefined;
    }

    if (!(await this.isTtkWorkingDirectoryUsable(cache.source))) {
      return undefined;
    }

    const pythonPathEntries = [
      cache.source,
      cache.dependencies,
    ];
    const versionOutput = await this.probeTtk({
      interpreter: python.interpreter,
      environmentScriptPath,
      pythonPathEntries,
      isCancellationRequested,
    });

    if (!versionOutput) {
      return undefined;
    }

    appendLog(TTK_LOG_SCOPE, 'Using cached managed TTK', {
      cacheRoot: cache.root,
      revision: OPS_TEST_KIT_REVISION,
      version: this.firstOutputLine(versionOutput),
    });

    return {
      source: 'managed',
      interpreter: python.interpreter,
      versionOutput,
      pythonPathEntries,
      workingDirectory: cache.source,
    };
  }

  private async provisionManagedCache(
    cache: ManagedCachePaths,
    python: PythonRuntime,
    environmentScriptPath: string | undefined,
    isCancellationRequested: CancellationCheck | undefined,
  ): Promise<TtkRuntime> {
    const managedBase = path.join(this.context.globalStorageUri.fsPath, 'ttk');
    const stagingRoot = path.join(managedBase, `.staging-${this.dependencies.createId()}`);
    const staging: ManagedCachePaths = {
      root: stagingRoot,
      source: path.join(stagingRoot, 'ops-test-kit'),
      dependencies: path.join(stagingRoot, 'dependencies'),
      marker: path.join(stagingRoot, 'install.json'),
      lock: `${stagingRoot}.lock`,
    };
    let backupRoot: string | undefined;

    await fs.promises.mkdir(managedBase, { recursive: true });
    this.assertManagedPath(stagingRoot);

    try {
      this.throwIfCancelled(isCancellationRequested);
      await fs.promises.mkdir(stagingRoot, { recursive: true });

      appendLog(TTK_LOG_SCOPE, 'Downloading pinned ops-test-kit', {
        repository: OPS_TEST_KIT_REPOSITORY,
        revision: OPS_TEST_KIT_REVISION,
        cacheRoot: cache.root,
      });

      const cloneCommand = [
        `git init -q ${shellQuoteBash(staging.source)}`,
        `git -C ${shellQuoteBash(staging.source)} remote add origin ${shellQuoteBash(OPS_TEST_KIT_REPOSITORY)}`,
        `git -C ${shellQuoteBash(staging.source)} fetch --depth=1 origin ${shellQuoteBash(OPS_TEST_KIT_REVISION)}`,
        `git -C ${shellQuoteBash(staging.source)} checkout --detach -q FETCH_HEAD`,
      ].join(' && ');

      await this.executeRequired(
        cloneCommand,
        'download pinned ops-test-kit',
        isCancellationRequested,
        TTK_DOWNLOAD_TIMEOUT_MS,
      );

      if (!(await this.isPinnedCheckout(staging.source, isCancellationRequested))) {
        throw new Error(`Downloaded ops-test-kit did not match pinned revision ${OPS_TEST_KIT_REVISION}`);
      }

      const requirementsPath = path.join(staging.source, 'requirements.txt');

      if (!fs.existsSync(requirementsPath)) {
        throw new Error('Pinned ops-test-kit has no requirements.txt');
      }

      await fs.promises.mkdir(staging.dependencies, { recursive: true });
      const installCommand = buildSourcedPythonCommand({
        interpreter: python.interpreter,
        environmentScriptPath,
        args: [
          '-m',
          'pip',
          'install',
          '--disable-pip-version-check',
          '--no-input',
          '--target',
          staging.dependencies,
          '--requirement',
          requirementsPath,
        ],
      });

      await this.executeRequired(
        installCommand,
        'install isolated ops-test-kit dependencies',
        isCancellationRequested,
        TTK_INSTALL_TIMEOUT_MS,
      );

      const stagingVersion = await this.probeTtk({
        interpreter: python.interpreter,
        environmentScriptPath,
        pythonPathEntries: [
          staging.source,
          staging.dependencies,
        ],
        isCancellationRequested,
      });

      if (!stagingVersion) {
        throw new Error('Managed TTK probe failed after isolated installation');
      }

      const marker: CacheMarker = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        revision: OPS_TEST_KIT_REVISION,
        pythonMajorMinor: python.majorMinor,
      };

      await fs.promises.writeFile(staging.marker, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
      backupRoot = await this.promoteStaging(staging.root, cache.root);

      const finalVersion = await this.probeTtk({
        interpreter: python.interpreter,
        environmentScriptPath,
        pythonPathEntries: [
          cache.source,
          cache.dependencies,
        ],
        isCancellationRequested,
      });

      if (!finalVersion) {
        await this.restorePreviousCache(cache.root, backupRoot);
        backupRoot = undefined;
        throw new Error('Managed TTK probe failed after cache activation');
      }

      if (!(await this.isTtkWorkingDirectoryUsable(cache.source))) {
        await this.restorePreviousCache(cache.root, backupRoot);
        backupRoot = undefined;
        throw new Error('Managed TTK working directory is unusable after cache activation');
      }

      if (backupRoot) {
        const obsoleteBackupRoot = backupRoot;

        backupRoot = undefined;
        await this.removeManagedPath(obsoleteBackupRoot)
          .catch((error) => {
            appendLog(TTK_LOG_SCOPE, 'Could not remove previous managed TTK cache', {
              backupRoot: obsoleteBackupRoot,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }

      appendLog(TTK_LOG_SCOPE, 'Pinned managed TTK is ready', {
        cacheRoot: cache.root,
        revision: OPS_TEST_KIT_REVISION,
        pythonVersion: python.version,
      });

      return {
        source: 'managed',
        interpreter: python.interpreter,
        versionOutput: finalVersion,
        pythonPathEntries: [
          cache.source,
          cache.dependencies,
        ],
        workingDirectory: cache.source,
      };
    }
    catch (error) {
      if (backupRoot) {
        await this.restorePreviousCache(cache.root, backupRoot)
          .catch(() => undefined);
      }

      if (error instanceof StTestCancelledError) {
        throw error;
      }

      const message = `Unable to provision pinned TTK from ${OPS_TEST_KIT_REPOSITORY} at ${OPS_TEST_KIT_REVISION}. `
        + 'No usable system/cache copy was found. Check GitCode access, proxy, or restricted-network cache. '
        + `Stage: ${error instanceof Error ? error.message : String(error)}`;

      throw new Error(message);
    }
    finally {
      if (fs.existsSync(staging.root)) {
        await this.removeManagedPath(staging.root)
          .catch(() => undefined);
      }
    }
  }

  private async executeRequired(
    command: string,
    stage: string,
    isCancellationRequested: CancellationCheck | undefined,
    timeout: number,
  ): Promise<void> {
    const result = await this.execute(command, timeout, isCancellationRequested);

    if (result.timedOut) {
      throw new Error(`${stage} timed out after ${String(timeout)}ms and was terminated`);
    }

    if (result.code !== 0) {
      throw new Error(`${stage} failed with exit code ${String(result.code)}`);
    }
  }

  private async execute(
    command: string,
    timeout: number | undefined,
    isCancellationRequested: CancellationCheck | undefined,
  ) {
    this.throwIfCancelled(isCancellationRequested);

    const result = await this.dependencies.getExecutor()
      .execute(
        command,
        [],
        [],
        { timeout },
        false,
      );

    if (result.interruptedByUserStop || isCancellationRequested?.()) {
      throw new StTestCancelledError();
    }

    return result;
  }

  private async isPinnedCheckout(
    sourcePath: string,
    isCancellationRequested: CancellationCheck | undefined,
  ): Promise<boolean> {
    if (!fs.existsSync(path.join(sourcePath, '.git'))) {
      return false;
    }

    const command = `git -C ${shellQuoteBash(sourcePath)} rev-parse HEAD`
      + ` && git -C ${shellQuoteBash(sourcePath)} diff --quiet HEAD --`;

    try {
      const result = await this.execute(command, 10_000, isCancellationRequested);

      return result.code === 0
        && result.stdout.trim()
          .split(/\r?\n/)[0] === OPS_TEST_KIT_REVISION;
    }
    catch (error) {
      if (error instanceof StTestCancelledError) {
        throw error;
      }

      return false;
    }
  }

  private async readCacheMarker(markerPath: string): Promise<CacheMarker | undefined> {
    try {
      return JSON.parse(await fs.promises.readFile(markerPath, 'utf8')) as CacheMarker;
    }
    catch {
      return undefined;
    }
  }

  private async awaitForCaller(
    operation: InFlightEnsure,
    waiter: EnsureWaiter,
  ): Promise<TtkRuntime> {
    if (!waiter.isCancellationRequested) {
      return operation.promise;
    }

    let sharedFinished = false;
    const callerCancellation = (async (): Promise<never> => {
      while (!sharedFinished) {
        if (this.markWaiterCancelled(waiter)) {
          throw new StTestCancelledError();
        }

        await this.dependencies.sleep(CALLER_CANCELLATION_POLL_MS);
      }

      return new Promise<never>(() => undefined);
    })();

    try {
      return await Promise.race([
        operation.promise,
        callerCancellation,
      ]);
    }
    finally {
      sharedFinished = true;
    }
  }

  private markWaiterCancelled(waiter: EnsureWaiter): boolean {
    if (!waiter.cancelled && waiter.isCancellationRequested?.()) {
      waiter.cancelled = true;
    }

    return waiter.cancelled;
  }

  private areAllWaitersCancelled(operation: InFlightEnsure): boolean {
    return operation.waiters.size > 0
      && [...operation.waiters].every((waiter) => this.markWaiterCancelled(waiter));
  }

  private async acquireManagedCacheLock(
    cache: ManagedCachePaths,
    isCancellationRequested: CancellationCheck | undefined,
  ): Promise<()=> Promise<void>> {
    const lockPath = cache.lock;
    const ownerPath = path.join(lockPath, 'owner.json');
    const token = this.dependencies.createLockToken();
    const waitStartedAt = this.dependencies.now();

    this.assertManagedPath(lockPath);
    await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });

    while (true) {
      this.throwIfCancelled(isCancellationRequested);

      try {
        await fs.promises.mkdir(lockPath);

        const owner: CacheLockOwner = {
          token,
          host: os.hostname(),
          pid: process.pid,
          createdAt: this.dependencies.now(),
        };

        try {
          await fs.promises.writeFile(ownerPath, `${JSON.stringify(owner)}\n`, 'utf8');
        }
        catch (error) {
          await this.removeManagedPath(lockPath)
            .catch(() => undefined);
          throw error;
        }

        return () => this.releaseManagedCacheLock(lockPath, token);
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      }

      if (await this.recoverStaleManagedCacheLock(lockPath)) {
        continue;
      }

      const elapsed = this.dependencies.now() - waitStartedAt;

      if (elapsed >= TTK_LOCK_WAIT_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for managed TTK cache lock: ${lockPath}`);
      }

      await this.dependencies.sleep(Math.min(
        TTK_LOCK_POLL_MS,
        TTK_LOCK_WAIT_TIMEOUT_MS - elapsed,
      ));
      this.throwIfCancelled(isCancellationRequested);
    }
  }

  private async recoverStaleManagedCacheLock(lockPath: string): Promise<boolean> {
    let lockCreatedAt: number;
    let observedOwner: CacheLockOwner | undefined;

    try {
      observedOwner = await this.readCacheLockOwner(path.join(lockPath, 'owner.json'));
      const lockStat = await fs.promises.stat(lockPath);

      lockCreatedAt = observedOwner?.createdAt ?? lockStat.mtimeMs;
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return true;
      }

      throw error;
    }

    const currentOwner = await this.readCacheLockOwner(path.join(lockPath, 'owner.json'));

    if (observedOwner?.token !== currentOwner?.token) {
      return true;
    }

    if (currentOwner === undefined) {
      // An ownerless lock directory is a broken half-state: the creator either
      // crashed before writing owner.json or a release fallback removed the
      // marker before deleting the directory. Nothing owns it — recover it
      // once it outlives the mkdir -> owner.json write window.
      if (this.dependencies.now() - lockCreatedAt < OWNERLESS_LOCK_GRACE_MS) {
        return false;
      }

      await this.removeManagedPathWithRetry(lockPath);
      appendLog(TTK_LOG_SCOPE, 'Recovered ownerless managed TTK cache lock', { cacheLock: lockPath });

      return true;
    }

    if (currentOwner?.host === os.hostname()) {
      if (this.isProcessAlive(currentOwner.pid)) {
        return false;
      }
    }
    else if (this.dependencies.now() - lockCreatedAt < TTK_LOCK_STALE_MS) {
      return false;
    }

    const stalePath = `${lockPath}.stale-${this.dependencies.createLockToken()}`;

    this.assertManagedPath(stalePath);

    try {
      await this.renameManagedPathWithRetry(lockPath, stalePath);
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return true;
      }

      return false;
    }

    await this.removeManagedPath(stalePath);
    appendLog(TTK_LOG_SCOPE, 'Recovered stale managed TTK cache lock', { cacheLock: lockPath });

    return true;
  }

  private async releaseManagedCacheLock(lockPath: string, token: string): Promise<void> {
    const owner = await this.readCacheLockOwner(path.join(lockPath, 'owner.json'));

    if (owner?.token !== token) {
      return;
    }

    const releasedPath = `${lockPath}.released-${token}`;

    this.assertManagedPath(releasedPath);

    try {
      await this.renameManagedPathWithRetry(lockPath, releasedPath);
    }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;

      if (code === 'ENOENT') {
        return;
      }

      // Windows can keep refusing to rename a directory another instance is
      // polling for longer than the retry window, while deleting the same
      // directory is allowed. Remove in place as the fallback: the owner
      // marker has already been validated, and an ownerless directory left
      // behind by a crash mid-removal is recovered by the next waiter
      // (see recoverStaleManagedCacheLock).
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'ENOTEMPTY') {
        throw error;
      }

      await this.removeManagedPathWithRetry(lockPath);

      return;
    }

    await this.removeManagedPath(releasedPath);
  }

  private async readCacheLockOwner(ownerPath: string): Promise<CacheLockOwner | undefined> {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(ownerPath, 'utf8')) as Partial<CacheLockOwner>;

      if (
        typeof parsed.token !== 'string'
        || typeof parsed.host !== 'string'
        || typeof parsed.pid !== 'number'
        || !Number.isSafeInteger(parsed.pid)
        || parsed.pid <= 0
        || typeof parsed.createdAt !== 'number'
        || !Number.isFinite(parsed.createdAt)
      ) {
        return undefined;
      }

      return parsed as CacheLockOwner;
    }
    catch {
      return undefined;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);

      return true;
    }
    catch (error) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  }

  private async promoteStaging(stagingRoot: string, finalRoot: string): Promise<string | undefined> {
    this.assertManagedPath(stagingRoot);
    this.assertManagedPath(finalRoot);
    await fs.promises.mkdir(path.dirname(finalRoot), { recursive: true });

    let backupRoot: string | undefined;

    if (fs.existsSync(finalRoot)) {
      backupRoot = `${finalRoot}.previous-${this.dependencies.createId()}`;
      this.assertManagedPath(backupRoot);
      await fs.promises.rename(finalRoot, backupRoot);
    }

    try {
      await fs.promises.rename(stagingRoot, finalRoot);
    }
    catch (error) {
      if (backupRoot && !fs.existsSync(finalRoot)) {
        await fs.promises.rename(backupRoot, finalRoot)
          .catch(() => undefined);
      }

      throw error;
    }

    return backupRoot;
  }

  private async restorePreviousCache(finalRoot: string, backupRoot?: string): Promise<void> {
    if (!backupRoot) {
      if (fs.existsSync(finalRoot)) {
        await this.removeManagedPath(finalRoot);
      }

      return;
    }

    if (fs.existsSync(finalRoot)) {
      await this.removeManagedPath(finalRoot);
    }

    if (fs.existsSync(backupRoot)) {
      await fs.promises.rename(backupRoot, finalRoot);
    }
  }

  private async removeManagedPath(targetPath: string): Promise<void> {
    this.assertManagedPath(targetPath);
    await fs.promises.rm(targetPath, {
      recursive: true,
      force: true,
    });
  }

  /**
   * Rename with short retries. On Windows a directory that another instance
   * is polling (stat / owner.json reads while it waits for the lock) makes
   * `rename` fail transiently with EPERM/EBUSY/ENOTEMPTY; the poller's
   * syscalls finish in microseconds, so a short backoff lets the rename
   * through.
   */
  private async renameManagedPathWithRetry(source: string, target: string): Promise<void> {
    this.assertManagedPath(source);
    this.assertManagedPath(target);

    for (let attempt = 0; attempt < TTK_RENAME_RETRY_ATTEMPTS; attempt += 1) {
      try {
        await fs.promises.rename(source, target);

        return;
      }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;

        if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'ENOTEMPTY') {
          throw error;
        }

        if (attempt === TTK_RENAME_RETRY_ATTEMPTS - 1) {
          throw error;
        }

        await this.dependencies.sleep(TTK_RENAME_RETRY_DELAY_MS);
      }
    }
  }

  /**
   * Remove with short retries — the Windows counterpart of
   * {@link renameManagedPathWithRetry}: deletion is allowed where rename of a
   * polled directory is refused (see releaseManagedCacheLock).
   */
  private async removeManagedPathWithRetry(targetPath: string): Promise<void> {
    this.assertManagedPath(targetPath);

    for (let attempt = 0; attempt < TTK_REMOVE_RETRY_ATTEMPTS; attempt += 1) {
      try {
        await fs.promises.rm(targetPath, {
          recursive: true,
          force: true,
        });

        return;
      }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;

        if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'ENOTEMPTY') {
          throw error;
        }

        if (attempt === TTK_REMOVE_RETRY_ATTEMPTS - 1) {
          throw error;
        }

        await this.dependencies.sleep(TTK_RENAME_RETRY_DELAY_MS);
      }
    }
  }

  private assertManagedPath(targetPath: string): void {
    const managedBase = path.resolve(this.context.globalStorageUri.fsPath, 'ttk');
    const resolved = path.resolve(targetPath);
    const relative = path.relative(managedBase, resolved);

    if (!relative || isPathOutside(managedBase, resolved)) {
      throw new Error(`Refusing to mutate path outside managed TTK storage: ${resolved}`);
    }
  }

  private throwIfCancelled(isCancellationRequested?: CancellationCheck): void {
    if (isCancellationRequested?.()) {
      throw new StTestCancelledError();
    }
  }

  private firstOutputLine(output: string): string {
    return output.split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? '';
  }
}

const installerServices = new Map<string, TtkInstallerService>();

export function getTtkInstallerService(context: vscode.ExtensionContext): TtkInstallerService {
  const key = path.resolve(context.globalStorageUri.fsPath);
  const existing = installerServices.get(key);

  if (existing) {
    return existing;
  }

  const service = new TtkInstallerService(context);

  installerServices.set(key, service);

  return service;
}
