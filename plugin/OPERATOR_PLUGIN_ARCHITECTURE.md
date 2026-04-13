# Operator Plugin Architecture: Analysis and Refactoring Plan

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State: V1 (`plugin/src`)](#2-current-state-v1-pluginsrc)
3. [V2 Redesign Attempt (`plugin/src-v2`)](#3-v2-redesign-attempt-pluginsrc-v2)
4. [Proposed Architecture](#4-proposed-architecture)
5. [Architecture Comparison](#5-architecture-comparison)
6. [Adding a New Operator Type: Before vs After](#6-adding-a-new-operator-type-before-vs-after)
7. [Refactoring Plan](#7-refactoring-plan)

---

## 1. Executive Summary

`plugin/src` (V1) handles operator-type-specific behavior in **six separate locations** using incompatible dispatch patterns. Adding a new operator type like Triton requires touching all six. `plugin/src-v2` only addressed execution flow composition (build → simulate, build → onboard), not operator-type dispatch — it explicitly deferred this as out-of-scope.

The proposed fix is an **Operator Plugin System** with two clean interfaces:
- **`IOperatorPlugin`** — encapsulates all operator-*type*-level behavior (commands, file paths, scaffolding, build behavior, initial config scripts). Keyed by `op_type`.
- **`IProjectDetector`** — encapsulates project *structure* detection (filesystem heuristics). Keyed by `OperatorProjectType`.

A class can implement both interfaces (e.g. `AscendPlugin`). A detection-only class implements only `IProjectDetector` (e.g. `StandardCustomDetector`). A central `OperatorPluginRegistry` manages both. Adding a new operator type requires **one new file and two registration lines**.

---

## 2. Current State: V1 (`plugin/src`)

### 2.1 The Dual Classification Problem

V1 uses two overlapping systems to classify operator behavior, and this is the root cause of all extensibility problems.

**System 1: `op_type` (stored on `OpRecord`)** — drives command generation

| `op_type` | Strategy | Generator | Fallback? |
|---|---|---|---|
| `ascend` | `AscendCommandStrategy` | `AscendOpGenerator` | default for unknown |
| `cann` | `CannCommandStrategy` | `CannOpGenerator` | — |
| `pyasc` | `PyAscCommandStrategy` | `PyAscOpGenerator` | — |

**System 2: `OperatorProjectType` (detected from filesystem)** — drives project detection and some `BuildService` behavior

| Enum value | Detection heuristic |
|---|---|
| `STANDARD_CUSTOM` ('standard-custom') | `build.sh` contains `--genop` (definitive); or CMakeLists + no .asc + no .py + experimental/ancestor path pattern (heuristic) |
| `ASCEND_C` ('ascend-c') | `CMakeLists.txt` + `.asc` files, no `.py` |
| `TORCH_LIBRARY` ('torch-library') | `CMakeLists.txt` + `.py` files |
| `PYASC` ('pyasc') | `.py` files, no `CMakeLists.txt` |
| `MULTI_PROJECT` ('multi-project') | Set by higher-level scan logic, not by `detectOperatorProject()` |

**Why they don't collapse into one:** For PYASC, `project.project_type = 'pyasc'` and `operator.op_type = 'pyasc'` — the same string. For STANDARD_CUSTOM, `project.project_type = 'standard-custom'` but operators inside have `op_type: 'ascend'` or `'cann'` — they differ. There is no `op_type` called `'standard-custom'`. TORCH_LIBRARY similarly has operators with `op_type: 'ascend'` or `'cann'`.

`ProjectRecord.project_type` stores a mixture: op-type strings (`'pyasc'`, `'ascend'`, `'cann'`) and project-type strings (`'standard-custom'`). The field has no enforced schema.

### 2.2 The Six Dispatch Locations

**Location 1 — `CommandStrategyFactory` ✅ (already extensible)**

`domain/services/command-strategy/factory.ts` — Map-based registry with `register()` method. Adding a new type needs only `CommandStrategyFactory.register('triton', new TritonCommandStrategy())`. No modification to existing code.

**Location 2 — `OpGeneratorFactory` ❌**

`domain/services/op-generator-factory.ts` — if-else with 3 branches. Default falls back to `AscendOpGenerator`. Adding a type requires a new `if` branch.

**Location 3 — `getDefaultTarget` in `op-util.ts` ❌**

if-else on `op_type`. Note: the `ascend` branch uses a wildcard run package target (`build_out/*.run`). Adding a type requires an `else if`.

**Location 4 — `OperatorProjectDetector.detectOperatorProject()` ❌**

~160-line monolith with a priority-ordered chain of 5 detection conditions. Adding a project type requires inserting at the right priority position.

**Location 5 — `BuildService` ❌**

The pyasc-specific block is copy-pasted across `startRun`, `startSimulate`, `startOnBoard`. Each is ~40 lines. The three methods differ in subtle ways:
- `startRun`: uses `homeMethods.getProjectType()` (live detection) and skips if `params.filePath` is set
- `startSimulate`: uses `project?.project_type === 'pyasc'` (stored value) and `throw`s on failure
- `startOnBoard`: uses `project?.project_type === 'pyasc'` (stored value) and `return`s on failure

These are behavioral inconsistencies within V1 itself that the refactoring should clean up.

**Location 6 — `generateStructure` script helpers in `model.ts` ❌**

Five helper functions (`getNpuDebugScript`, `getCpuDebugScript`, `getSimulateScript`, `getOnBoardScript`, `getExampleScript`) plus **two inline ternaries** all branch on `op_type === 'ascend'`. Total: **7 type-specific string sources**:

```typescript
// 5 helpers for: npu_debug_script, cpu_debug_script, build_example.script,
//                on_board.script, simulate.script
// 2 inline ternaries for:
script: record.op_type === 'ascend'
  ? `bash ${opScriptPath} --pkg --soc=${soc_version} --vendor_name=custom`       // build_op.script
  : `bash ${opScriptPath}`,

script: record.op_type === 'ascend'
  ? `bash ${opScriptPath} --pkg --soc=${soc_version} --vendor_name=custom --mssanitizer`  // sanitizer.script
  : `bash ${opScriptPath} --mssanitizer`,
```

Note: `getExampleScript()` has a V1 bug — both branches of its bisheng conditional return the identical string (`--vendor_name=custom --run_example`), making the bisheng check dead code.

### 2.3 Adding a New Operator Type Today

| File | Required change |
|---|---|
| `command-strategy/<type>-strategy.ts` | **New file** — 9-method `CommandStrategy` implementation |
| `command-strategy/factory.ts` | Add to Map |
| `op-generator-factory.ts` | New generator class + new `if` branch |
| `utils/op-util.ts` | New `else if` in `getDefaultTarget()` |
| `services/operator-project-detector.ts` | New `OperatorProjectType` value + detection condition at correct priority |
| `service/build-service.ts` | If the new type has special pre-flight behavior, copy-paste the `isPyascType` block pattern into 3 methods |
| `domain/models/model.ts` | New case in all 5 helpers + 2 inline ternaries |

**6–8 files.** The developer must know all locations, their priority semantics, and their fallback conventions independently.

---

## 3. V2 Redesign Attempt (`plugin/src-v2`)

### 3.1 What V2 Solved

V2's `IExecutionStep` + `AbstractExecutionStrategy` + `ExecutionStrategyFactory` pattern correctly addresses the duplication in `BuildService`. Adding a new execution flow (e.g. "simulate with validation") = one new strategy class + one registration.

### 3.2 What V2 Did Not Solve

`ARCHITECTURE_AND_GOALS.md §1.2` explicitly defers operator-type branching as out-of-scope. `CommandGeneratorService` delegates every call to V1's domain functions. The REFACTORING_SUMMARY.md claim that "adding a new operator type takes 3 steps" only applies to adding a new execution *flow* variant, not an operator *type*.

V2's execution steps also have no operator-type awareness. `StandardSimulateStrategy` would run the build step even for pyasc operators (which must skip it) because steps have no `canSkip` logic that queries operator behavior.

### 3.3 Good Ideas from V2 to Keep

| Concept | Value |
|---|---|
| `IExecutionStep` + `AbstractExecutionStrategy` | Composable flows, no per-method duplication |
| `Result<T, E>` | Type-safe error handling |
| `ICommandExecutor` + `INotificationService` | VS Code decoupling |
| Lightweight DI `Container` | Testable wiring |
| Feature flags + route switching | Safe incremental rollout |

### 3.4 V2 Structural Problems

**Parallel codebase:** V2 lives alongside V1 in a separate directory. Any V1 signature change breaks V2's delegation layer. There is no defined retirement point for V1.

**Incomplete migration:** Config management, project management, operator creation remain on V1. The parallel structure cannot end cleanly without a full migration plan.

---

## 4. Proposed Architecture

### 4.1 Core Principle

Operator-type concerns and project-structure concerns are genuinely different axes. The proposed architecture handles both with explicit, separate extension points — and a unified registry that manages both.

- **`IOperatorPlugin`** — answers "given this `op_type`, how do I generate commands, paths, and scaffolding?"
- **`IProjectDetector`** — answers "given this directory, what project type is it?"

A class can implement both (e.g. `AscendPlugin` knows its detection fingerprint). Detection-only concepts implement only `IProjectDetector` (e.g. `StandardCustomDetector`, `TorchLibraryDetector`).

### 4.2 `IOperatorPlugin` Interface

```typescript
// domain/plugins/operator-plugin.interface.ts

export interface IOperatorPlugin {
  /** Matches OpRecord.op_type exactly. */
  readonly opType: string;

  readonly displayName: string;

  /** Reuses the existing CommandStrategy interface — no duplication with V1. */
  readonly commandStrategy: CommandStrategy;

  /**
   * Default file paths when a new operator is first registered.
   * Replaces the if-else chain in getDefaultTarget() in op-util.ts.
   *
   * Note: for the 'ascend' type, targetOpFile uses wildcard `.run`
   * (`build_out/*.run`) to match current V1 behavior.
   * This logic must be preserved in AscendPlugin.getDefaultPaths().
   */
  getDefaultPaths(op: OpRecord): OperatorDefaultPaths;

  /**
   * Project scaffolding generator.
   * Replaces OpGeneratorFactory.getGenerator() if-else.
   */
  createProjectGenerator(
    params: OpGenParams,
    project: Project,
    extensionPath: string,
  ): BaseOpGenerator;

  /**
   * Operator-level build behavior.
   * Replaces isPyascType copy-paste in BuildService.
   *
   * Does NOT include requiresExampleBuildForAnalysis — that is a
   * STANDARD_CUSTOM project-level concern, not an op-type concern.
   * It remains in BuildService as isRootStandardCustom().
   */
  readonly buildBehavior: OperatorBuildBehavior;

  /**
   * Initial config scripts written when a new operator is created.
   * Replaces the 5 helpers + 2 inline ternaries in model.ts generateStructure().
   *
   * @param workspaceRoot  The VS Code workspace root path. checkBuildShHasBishengConfig()
   *   in V1 reads from workspace root (not op.op_path), so this param is required.
   */
  getInitialConfigScripts(op: OpRecord, workspaceRoot: string): OperatorConfigScripts;
}

export interface OperatorDefaultPaths {
  opScriptPath: string;
  exampleScriptPath: string;
  targetDir: string;
  targetOpFile: string;
  targetExampleFile: string;
}

export interface OperatorBuildBehavior {
  /** False for pyasc — it runs Python files directly; no compilation step. */
  requiresBuildBeforeAnalysis: boolean;
  /** True for pyasc — the active .py file in the editor determines what gets run. */
  requiresActiveFileCheck: boolean;
  /** Required when requiresActiveFileCheck is true. */
  activeFileExtension?: string;
}

export interface OperatorConfigScripts {
  buildScript: string;      // build_op config script
  exampleScript: string;    // build_example config script
  simulateScript: string;   // simulate config script
  onBoardScript: string;    // on_board config script
  sanitizerScript: string;  // sanitizer config script (was: inline ternary in generateStructure)
  cpuDebugScript: string;   // build_op cpu_debug_script
  npuDebugScript: string;   // build_op npu_debug_script
}
```

### 4.3 `IProjectDetector` Interface

```typescript
// domain/plugins/project-detector.interface.ts

export interface IProjectDetector {
  /** The OperatorProjectType this detector identifies. */
  readonly projectType: OperatorProjectType;

  /**
   * Test whether dirPath is a project of this type.
   *
   * confidence:
   *   'definitive' — unambiguous (e.g. file content check). Registry stops searching.
   *   'heuristic'  — probabilistic (e.g. file extension check). Registry keeps searching
   *                  for a 'definitive' match but accepts this if none is found.
   */
  detectProject(dirPath: string): Promise<{
    isMatch: boolean;
    confidence: 'definitive' | 'heuristic';
  }>;
}
```

### 4.4 `OperatorPluginRegistry`

```typescript
// domain/plugins/operator-plugin.registry.ts

export class OperatorPluginRegistry {
  private static readonly opPlugins = new Map<string, IOperatorPlugin>();
  // Ordered list — registration order = detection priority
  private static readonly detectors: IProjectDetector[] = [];

  /** Register an operator-type plugin (keyed by opType). Order does not matter. */
  static registerOpPlugin(plugin: IOperatorPlugin): void {
    this.opPlugins.set(plugin.opType, plugin);
  }

  /**
   * Register a project detector. Order MATTERS — more specific detectors
   * (those that may return 'definitive') must be registered first.
   *
   * Recommended order:
   *   1. StandardCustomDetector  (definitive — build.sh content)
   *   2. TorchLibraryDetector    (heuristic — CMakeLists + .py)
   *   3. PyAscPlugin             (heuristic — .py, no CMakeLists)
   *   4. AscendPlugin            (heuristic — CMakeLists + .asc)
   */
  static registerDetector(detector: IProjectDetector): void {
    this.detectors.push(detector);
  }

  /**
   * Convenience: register something that implements both interfaces.
   * Op-type registration is unordered; detection registration is appended.
   */
  static register(plugin: IOperatorPlugin & IProjectDetector): void {
    this.registerOpPlugin(plugin);
    this.registerDetector(plugin);
  }

  /**
   * Get op-type plugin by opType. Falls back to 'cann' (same as CommandStrategyFactory).
   */
  static getOpPlugin(opType: string | null | undefined): IOperatorPlugin {
    if (!opType) return this.opPlugins.get('cann')!;
    return this.opPlugins.get(opType) ?? this.opPlugins.get('cann')!;
  }

  /**
   * Detect project type. Iterates detectors in registration order.
   * Stops on 'definitive'; keeps the best 'heuristic' match if no 'definitive' found.
   */
  static async detectProject(dirPath: string): Promise<{
    detector: IProjectDetector;
    projectType: OperatorProjectType;
  } | null> {
    let heuristicMatch: IProjectDetector | null = null;

    for (const detector of this.detectors) {
      const { isMatch, confidence } = await detector.detectProject(dirPath);
      if (!isMatch) continue;
      if (confidence === 'definitive') return { detector, projectType: detector.projectType };
      if (!heuristicMatch) heuristicMatch = detector; // keep first heuristic
    }

    return heuristicMatch
      ? { detector: heuristicMatch, projectType: heuristicMatch.projectType }
      : null;
  }

  static getRegisteredOpTypes(): string[] {
    return [...this.opPlugins.keys()];
  }
}
```

Plugin registration in `extension.ts`:

```typescript
// domain/plugins/index.ts
export function registerOperatorPlugins(): void {
  const ascend = new AscendPlugin();
  const pyasc  = new PyAscPlugin();
  const cann   = new CannPlugin();

  // Op-type plugins (order doesn't matter)
  OperatorPluginRegistry.registerOpPlugin(ascend);
  OperatorPluginRegistry.registerOpPlugin(cann);
  OperatorPluginRegistry.registerOpPlugin(pyasc);

  // Detectors in detection-priority order (most specific first)
  OperatorPluginRegistry.registerDetector(new StandardCustomDetector());  // definitive
  OperatorPluginRegistry.registerDetector(new TorchLibraryDetector());   // heuristic
  OperatorPluginRegistry.registerDetector(pyasc);                        // heuristic
  OperatorPluginRegistry.registerDetector(ascend);                       // heuristic

  // Adding Triton:
  // const triton = new TritonPlugin();
  // OperatorPluginRegistry.registerOpPlugin(triton);
  // OperatorPluginRegistry.registerDetector(triton);  // if it has a filesystem fingerprint
}
```

### 4.5 Abstract Base Classes

```typescript
// domain/plugins/abstract-operator-plugin.ts

export abstract class AbstractOperatorPlugin implements IOperatorPlugin {
  abstract readonly opType: string;
  abstract readonly displayName: string;
  abstract readonly commandStrategy: CommandStrategy;

  /** Default: build required, no active file check. Matches ascend/cann behavior. */
  readonly buildBehavior: OperatorBuildBehavior = {
    requiresBuildBeforeAnalysis: true,
    requiresActiveFileCheck: false,
  };

  /** Default paths: standard cann layout (build/<op_name>). */
  getDefaultPaths(op: OpRecord): OperatorDefaultPaths {
    const buildPath = path.join(op.op_path, 'build', op.op_name);
    return {
      opScriptPath:      path.join(op.op_path, 'build.sh'),
      exampleScriptPath: path.join(op.op_path, 'build.sh'),
      targetDir:         path.resolve(op.op_path, 'build_out'),
      targetOpFile:      buildPath,
      targetExampleFile: buildPath,
    };
  }

  /** Default config scripts: standard cann format. */
  getInitialConfigScripts(op: OpRecord, _workspaceRoot: string): OperatorConfigScripts {
    const script = path.join(op.op_path, 'build.sh');
    return {
      buildScript:     `bash ${script}`,
      exampleScript:   `bash ${script}`,
      simulateScript:  `bash ${script} --simulator Ascend910B3`,
      onBoardScript:   `bash ${script} --onboard`,
      sanitizerScript: `bash ${script} --mssanitizer`,
      cpuDebugScript:  `bash ${script} --simulator`,
      npuDebugScript:  `bash ${script} --debug`,
    };
  }

  /**
   * Throws by default — every concrete plugin must declare its generator.
   * V1's fallback (AscendOpGenerator) is not a safe default because a forgotten
   * override would silently produce wrong scaffolding.
   */
  createProjectGenerator(_params: OpGenParams, _project: Project, _ext: string): BaseOpGenerator {
    throw new Error(`createProjectGenerator not implemented for opType '${this.opType}'`);
  }
}
```

### 4.6 Concrete Plugin Implementations

```typescript
// domain/plugins/ascend.plugin.ts
// Implements both IOperatorPlugin (opType='ascend') and IProjectDetector (ASCEND_C).

export class AscendPlugin extends AbstractOperatorPlugin implements IProjectDetector {
  readonly opType = 'ascend';
  readonly displayName = 'Ascend C';
  readonly commandStrategy = new AscendCommandStrategy();
  readonly projectType = OperatorProjectType.ASCEND_C;

  // buildBehavior: inherits default (requiresBuildBeforeAnalysis: true)

  async detectProject(dirPath: string) {
    const hasCmake = fs.existsSync(path.join(dirPath, 'CMakeLists.txt'));
    const hasAsc   = hasAscFilesRecursive(dirPath);
    const hasPy    = hasPyFilesInRoot(dirPath);
    return {
      isMatch: hasCmake && hasAsc && !hasPy,
      confidence: 'heuristic' as const,
    };
  }

  getDefaultPaths(op: OpRecord): OperatorDefaultPaths {
    // Mirrors current V1 behavior for ascend run/deploy target.
    const runPackageName = '*.run';

    return {
      opScriptPath:      path.join(op.op_path, 'build.sh'),
      exampleScriptPath: path.join(op.op_path, 'build.sh'),
      targetDir:         path.resolve(op.op_path, 'build_out'),
      targetOpFile:      path.join(op.op_path, 'build_out', runPackageName),
      targetExampleFile: path.join(op.op_path, 'build', `test_aclnn_${op.op_name}`),
    };
  }

  getInitialConfigScripts(op: OpRecord, workspaceRoot: string): OperatorConfigScripts {
    const script = path.join(op.op_path, 'build.sh');
    // checkBuildShHasBishengConfig() in V1 reads from VS Code workspace root, not op.op_path.
    // The workspaceRoot parameter mirrors this behavior.
    const h = checkBuildShHasBishengConfig(workspaceRoot);
    const base = `bash ${script} --pkg --soc=${soc_version} --vendor_name=custom`;
    return {
      buildScript:     h ? `${base} --bisheng_flags=ccec_g`          : base,
      exampleScript:   `${base} --run_example`,    // bisheng branch is a V1 no-op (both return same string)
      simulateScript:  h ? `${base} --bisheng_flags=ccec_g`          : `${base} --simulator Ascend910B3`,
      onBoardScript:   h ? `${base} --bisheng_flags=ccec_g`          : `${base} --onboard`,
      sanitizerScript: h ? `${base} --bisheng_flags=ccec_g`          : `${base} --mssanitizer`,
      cpuDebugScript:  h ? `${base} --bisheng_flags=ccec_g`          : `${base} --simulator`,
      npuDebugScript:  h ? `${base} --bisheng_flags=ccec_O0,ccec_g`  : `${base} --debug`,
    };
  }

  createProjectGenerator(params, project, extensionPath) {
    return new AscendOpGenerator(params, project, extensionPath);
  }
}
```

```typescript
// domain/plugins/cann.plugin.ts
// CannPlugin is an op-type plugin only — cann operators appear inside multiple project types.

export class CannPlugin extends AbstractOperatorPlugin {
  readonly opType = 'cann';
  readonly displayName = 'CANN';
  readonly commandStrategy = new CannCommandStrategy();

  // buildBehavior: inherits default
  // getDefaultPaths: inherits default (build/<op_name>)
  // getInitialConfigScripts: inherits default (simple bash invocation)

  createProjectGenerator(params, project, extensionPath) {
    return new CannOpGenerator(params, project, extensionPath);
  }
}
```

```typescript
// domain/plugins/pyasc.plugin.ts
// Implements both IOperatorPlugin (opType='pyasc') and IProjectDetector (PYASC).

export class PyAscPlugin extends AbstractOperatorPlugin implements IProjectDetector {
  readonly opType = 'pyasc';
  readonly displayName = 'PyAsc';
  readonly commandStrategy = new PyAscCommandStrategy();
  readonly projectType = OperatorProjectType.PYASC;

  readonly buildBehavior: OperatorBuildBehavior = {
    requiresBuildBeforeAnalysis: false,  // runs Python directly, no compile step
    requiresActiveFileCheck: true,
    activeFileExtension: '.py',
  };

  async detectProject(dirPath: string) {
    const hasPy    = hasPyFilesInRoot(dirPath);
    const hasCmake = fs.existsSync(path.join(dirPath, 'CMakeLists.txt'));
    return { isMatch: hasPy && !hasCmake, confidence: 'heuristic' as const };
  }

  getDefaultPaths(op: OpRecord): OperatorDefaultPaths {
    const pyTarget = `python3 ./${op.op_name}.py`;
    return {
      opScriptPath:      path.join(op.op_path, 'build.sh'),
      exampleScriptPath: path.join(op.op_path, 'build.sh'),
      targetDir:         path.resolve(op.op_path, 'build_out'),
      targetOpFile:      pyTarget,
      targetExampleFile: pyTarget,
    };
  }

  // getInitialConfigScripts: inherits AbstractOperatorPlugin default (cann format)
  // PyAsc uses the same simple bash invocations as cann for initial configs.

  createProjectGenerator(params, project, extensionPath) {
    return new PyAscOpGenerator(params, project, extensionPath);
  }
}
```

```typescript
// domain/plugins/standard-custom.detector.ts
// Detection-only — STANDARD_CUSTOM has no dedicated op_type.
// Implements IProjectDetector only, NOT IOperatorPlugin.
// Operators inside STANDARD_CUSTOM projects have op_type='ascend' or 'cann'.

export class StandardCustomDetector implements IProjectDetector {
  readonly projectType = OperatorProjectType.STANDARD_CUSTOM;

  async detectProject(dirPath: string) {
    // Path 1 (definitive): build.sh contains --genop
    const buildShPath = path.join(dirPath, 'build.sh');
    if (fs.existsSync(buildShPath)) {
      try {
        const content = fs.readFileSync(buildShPath, 'utf-8');
        if (content.includes('--genop')) {
          return { isMatch: true, confidence: 'definitive' as const };
        }
      } catch { /* ignore */ }
    }

    // Path 2 (heuristic): CMakeLists + no .asc + no .py + experimental/ancestor pattern
    // This detects sub-directories within a STANDARD_CUSTOM project.
    const hasCmake = fs.existsSync(path.join(dirPath, 'CMakeLists.txt'));
    const hasAsc   = hasAscFilesRecursive(dirPath);
    const hasPy    = hasPyFilesInRoot(dirPath);
    if (hasCmake && !hasAsc && !hasPy) {
      const normalizedPath = path.normalize(dirPath).toLowerCase();
      if (normalizedPath.includes('experimental') || hasAncestorBuildShWithGenop(dirPath)) {
        return { isMatch: true, confidence: 'heuristic' as const };
      }
    }

    return { isMatch: false, confidence: 'heuristic' as const };
  }
}
```

```typescript
// domain/plugins/torch-library.detector.ts
// TorchLibrary projects have no dedicated op_type. Detection-only.
// (Operators inside have op_type='ascend' or 'cann' and use those strategies.)

export class TorchLibraryDetector implements IProjectDetector {
  readonly projectType = OperatorProjectType.TORCH_LIBRARY;

  async detectProject(dirPath: string) {
    const hasCmake = fs.existsSync(path.join(dirPath, 'CMakeLists.txt'));
    const hasPy    = hasPyFilesInRoot(dirPath);
    return { isMatch: hasCmake && hasPy, confidence: 'heuristic' as const };
  }
}
```

### 4.7 How Consumers Change

#### `OpGeneratorFactory` — one-liner

```typescript
export const OpGeneratorFactory = {
  getGenerator(params, project, extensionPath): BaseOpGenerator {
    return OperatorPluginRegistry.getOpPlugin(params.op_type)
      .createProjectGenerator(params, project, extensionPath);
  },
};
```

#### `op-util.ts getDefaultPath` — one-liner

```typescript
export function getDefaultPath(op: OpRecord): OperatorDefaultPaths {
  return OperatorPluginRegistry.getOpPlugin(op.op_type).getDefaultPaths(op);
}
```

#### `generateStructure` in `model.ts` — 7 type-specific strings → 1 plugin call

```typescript
const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? op.op_path;
const scripts = OperatorPluginRegistry.getOpPlugin(record.op_type)
  .getInitialConfigScripts(record, workspaceRoot);

// build_op
const buildOp = {
  user_options: {
    script:            scripts.buildScript,
    cpu_debug_script:  scripts.cpuDebugScript,
    npu_debug_script:  scripts.npuDebugScript,
    target_file:       targetFile,
    ...
  },
};
// build_example
const buildExample = { user_options: { script: scripts.exampleScript, ... } };
// sanitizer
const sanitizerCfg = { user_options: { script: scripts.sanitizerScript, ... } };
// on_board
const onBoard      = { user_options: { script: scripts.onBoardScript, ... } };
// simulate
const simulate     = { user_options: { script: scripts.simulateScript, ... } };
```

All 5 helper functions and both inline ternaries are deleted.

#### `OperatorProjectDetector` — thin wrapper

```typescript
export class OperatorProjectDetector {
  static async detectOperatorProject(dirPath: string): Promise<OperatorProjectDetectionResult> {
    const match = await OperatorPluginRegistry.detectProject(dirPath);
    if (!match) {
      return { isOperatorProject: false, projectPath: dirPath, projectName: path.basename(dirPath) };
    }
    return {
      isOperatorProject: true,
      projectType: match.projectType,      // IProjectDetector.projectType — correct OperatorProjectType value
      projectPath: dirPath,
      projectName: path.basename(dirPath),
    };
  }
}
```

`isRootStandardCustom()` in `BuildService` also migrates to use the registry:

```typescript
async function isRootStandardCustom(): Promise<boolean> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) return false;
  const match = await OperatorPluginRegistry.detectProject(workspaceFolders[0].uri.fsPath);
  return match?.projectType === OperatorProjectType.STANDARD_CUSTOM;
}
```

#### `BuildService` — behavior-driven, no string comparisons

The three `isPyascType` blocks collapse into a uniform pattern. The `startRun` / `startSimulate` / `startOnBoard` behavioral asymmetries (inconsistency in V1 around `!params.filePath` vs `!params.operatorNames`, and `return` vs `throw`) should be reconciled during this refactoring.

```typescript
async startSimulate(params: { operatorNames?: string } = {}): Promise<void> {
  // Operator-level behavior: look up by the project's stored type string.
  // project.project_type stores 'pyasc' for PyAsc, 'ascend' for AscendC, etc.
  // These match the plugin opType values, so the lookup is correct.
  const project = getProjectById(Number(ProjectManager.getInstance().projectId));
  const opPlugin = OperatorPluginRegistry.getOpPlugin(project?.project_type);
  const behavior = opPlugin.buildBehavior;

  // Active file check (replaces: isPyascType copy-paste)
  if (behavior.requiresActiveFileCheck && !params.operatorNames) {
    const ok = await this.ensureActiveFile(behavior.activeFileExtension!);
    if (!ok) return;
  }

  // Build phase (replaces: if (!isPyascType) { ... })
  if (behavior.requiresBuildBeforeAnalysis) {
    await this.runOpBuild(simulateConfigId, params.operatorNames);

    // STANDARD_CUSTOM example build (stays project-level — not in buildBehavior)
    if (await isRootStandardCustom()) {
      await this.runExampleBuild(exConfigId, params.operatorNames, `--simulator --soc=${soc_version}`);
    }
  }

  await this.runSimulate(simulateConfigId, exConfigId, params.operatorNames);
}
```

Adding a new operator type never touches this file.

### 4.8 Integration with V2 Execution Steps

Add `opPlugin` and `projectType` to `ExecutionContext` to make steps fully operator-aware:

```typescript
export interface ExecutionContext {
  primaryConfigId: number;
  buildConfigId: number;
  exampleConfigId: number;
  parameters?: Record<string, unknown>;
  executor: ICommandExecutor;
  previousResult?: unknown;
  opPlugin: IOperatorPlugin;                    // for command generation and build behavior
  projectType: OperatorProjectType | undefined; // for project-level decisions (STANDARD_CUSTOM)
}
```

Steps use both:

```typescript
export class BuildStep implements IExecutionStep {
  readonly name = 'Build';
  canSkip(context: ExecutionContext): boolean {
    return !context.opPlugin.buildBehavior.requiresBuildBeforeAnalysis; // false for pyasc
  }
  // ...
}

export class ActiveFileCheckStep implements IExecutionStep {
  readonly name = 'ActiveFileCheck';
  canSkip(context: ExecutionContext): boolean {
    return !context.opPlugin.buildBehavior.requiresActiveFileCheck; // true for non-pyasc
  }
  async execute(context: ExecutionContext): Promise<Result<unknown, Error>> {
    const ext = context.opPlugin.buildBehavior.activeFileExtension!;
    // check active editor for ext
  }
}

export class ExampleBuildStep implements IExecutionStep {
  readonly name = 'ExampleBuild';
  canSkip(context: ExecutionContext): boolean {
    // Project-level: only STANDARD_CUSTOM needs the example build before analysis.
    // requiresExampleBuildForAnalysis is NOT on IOperatorPlugin.buildBehavior —
    // it depends on project structure, not operator type.
    return context.projectType !== OperatorProjectType.STANDARD_CUSTOM;
  }
  // ...
}
```

`StandardSimulateStrategy`:

```typescript
export class StandardSimulateStrategy extends AbstractExecutionStrategy {
  readonly strategyName = 'standard-simulate';
  getSteps(): IExecutionStep[] {
    return [
      new ActiveFileCheckStep(),   // canSkip: non-pyasc
      new BuildStep(this.gen),     // canSkip: pyasc
      new ExampleBuildStep(this.gen), // canSkip: non-STANDARD_CUSTOM
      new SimulateStep(this.gen),
    ];
  }
}
```

The strategy is fully operator-agnostic. No new strategy class is needed when a new operator type is added.

---

## 5. Architecture Comparison

| Dimension | V1 | V2 | Proposed |
|---|---|---|---|
| **Adding a new op type** | 6–8 files, mixed patterns | Unchanged from V1 | 1 file, 2 registration calls |
| **Op-type dispatch** | 6 incompatible mechanisms | Delegates to V1 | `OperatorPluginRegistry.getOpPlugin()` |
| **Project type detection** | Monolithic 160-line method, 5 types | Unchanged from V1 | Each `IProjectDetector` owns its heuristic |
| **STANDARD_CUSTOM detection** | Hard-coded 2-path chain | Unchanged from V1 | `StandardCustomDetector` (both paths) |
| **TORCH_LIBRARY detection** | Hard-coded | Unchanged from V1 | `TorchLibraryDetector` |
| **Execution flow composition** | Copy-pasted in BuildService | Strategy + Step (good) ✅ | Keep V2; make steps plugin-aware |
| **isPyascType branching** | Copy-pasted in 3 methods | Partially in controller | `opPlugin.buildBehavior`, consistent across all 3 methods |
| **requiresExampleBuildForAnalysis** | Implicit `isRootStandardCustom()` | Unchanged | Kept as project-level check; `ExampleBuildStep.canSkip` uses `context.projectType` |
| **Initial config scripts** | 5 helpers + 2 ternaries in model.ts | Unchanged | `getInitialConfigScripts(op, workspaceRoot)` — 7 strings in one call |
| **Dual classification** | Mixed strings in project_type field | Unchanged | Explicitly separate: `IOperatorPlugin` (opType) + `IProjectDetector` (projectType) |
| **Testability** | Low — VS Code, globals | Improved ✅ | Plugin mock is trivial; detectors are testable in isolation |
| **Parallel codebase** | N/A | Two codebases | Not needed — refactor in-place with feature flags |

---

## 6. Adding a New Operator Type: Before vs After

### Before (e.g. adding `triton`)

1. `command-strategy/triton-strategy.ts` — **new file**: 9-method `CommandStrategy`
2. `command-strategy/factory.ts` — add to Map
3. `op-generator-factory.ts` — new generator class + new `if` branch
4. `utils/op-util.ts` — new `else if` in `getDefaultTarget()`
5. `services/operator-project-detector.ts` — new `OperatorProjectType` value + detection condition at correct priority
6. `service/build-service.ts` — if Triton has unusual pre-flight, copy-paste `isPyascType` block ×3
7. `domain/models/model.ts` — add Triton case to all 5 helpers + 2 inline ternaries

**Total: 6–8 files modified.**

### After (e.g. adding `triton`)

1. `domain/plugins/triton.plugin.ts` — **new file**: `TritonPlugin extends AbstractOperatorPlugin implements IProjectDetector`
   - `opType = 'triton'`
   - `projectType = OperatorProjectType.TRITON` (add enum value)
   - `commandStrategy = new TritonCommandStrategy()`
   - Override `getDefaultPaths()`, `getInitialConfigScripts()`, `createProjectGenerator()` if Triton differs
   - Override `buildBehavior` if Triton has special pre-flight (e.g. requires an open `.ttgir` file)
   - Override `detectProject()` with Triton's filesystem fingerprint
   - If behavior is cann-like: only 3–4 overrides needed; the rest inherit from `AbstractOperatorPlugin`

2. **Two lines** in `domain/plugins/index.ts`:
   ```typescript
   const triton = new TritonPlugin();
   OperatorPluginRegistry.registerOpPlugin(triton);
   OperatorPluginRegistry.registerDetector(triton); // if detection is needed
   ```

**Total: 1 new file, 2 lines added. No existing file changes.**

---

## 7. Refactoring Plan

### Phase 1 — Define Contracts (zero behavioral change)

Create the new directory and files; no consumers change.

- `domain/plugins/operator-plugin.interface.ts` — `IOperatorPlugin`, `OperatorBuildBehavior`, `OperatorDefaultPaths`, `OperatorConfigScripts`
- `domain/plugins/project-detector.interface.ts` — `IProjectDetector`
- `domain/plugins/operator-plugin.registry.ts` — `OperatorPluginRegistry` with empty maps
- `domain/plugins/abstract-operator-plugin.ts` — `AbstractOperatorPlugin`

**Risk:** Zero. Nothing wired.

---

### Phase 2 — Implement All Plugins and Detectors

- `ascend.plugin.ts` — implements `IOperatorPlugin` + `IProjectDetector` for ASCEND_C. Note: `getDefaultPaths()` must replicate the current `op-util.ts` behavior for ascend target path (`build_out/*.run`). `getInitialConfigScripts()` must include bisheng conditionals for all 7 script fields, including `onBoardScript` and `cpuDebugScript` (which V1 also branches on bisheng).
- `cann.plugin.ts` — implements `IOperatorPlugin` only (no detection needed).
- `pyasc.plugin.ts` — implements both.
- `standard-custom.detector.ts` — implements `IProjectDetector` only. Must replicate **both** detection paths from V1: Path 1 (build.sh content, `'definitive'`) and Path 2 (CMakeLists + path heuristics, `'heuristic'`).
- `torch-library.detector.ts` — implements `IProjectDetector` (CMakeLists + .py files).
- `domain/plugins/index.ts` — `registerOperatorPlugins()` with explicit ordering documented above.

Register from `extension.ts` at startup. Verify output of `getInitialConfigScripts()` against actual V1 script strings for all types.

**Risk:** Low — plugins are registered but no consumer calls them yet.

---

### Phase 3 — Migrate `getDefaultPath` in `op-util.ts`

Replace `getDefaultTarget()` if-else body with `OperatorPluginRegistry.getOpPlugin(op.op_type).getDefaultPaths(op)`.

**Files changed:** `domain/utils/op-util.ts` (~20 lines removed)
**Risk:** Low. Verify ascend paths (including `build_out/*.run` target), cann paths, pyasc paths.

---

### Phase 4 — Migrate `OpGeneratorFactory`

Replace factory body with `OperatorPluginRegistry.getOpPlugin(params.op_type).createProjectGenerator(...)`.

**Files changed:** `domain/services/op-generator-factory.ts` (~10 lines)
**Risk:** Low. Verify operator creation for each type.

---

### Phase 5 — Migrate `generateStructure` scripts (7 type-specific strings)

Replace all 5 helper functions AND both inline ternaries in `generateStructure()` with `plugin.getInitialConfigScripts(record, workspaceRoot)`. This requires `OperatorConfigScripts` to have a `sanitizerScript` field (for the sanitizer config's inline ternary — currently missing from any prior design).

Delete: `getNpuDebugScript`, `getCpuDebugScript`, `getSimulateScript`, `getOnBoardScript`, `getExampleScript`, both inline ternaries.

**Files changed:** `domain/models/model.ts` (~60 lines removed)
**Risk:** Medium. The generated script strings are used at operator creation time. Run creation + verification for ascend (with and without bisheng), cann, and pyasc. Pay attention to the sanitizer script (previously an unnoticed inline ternary).

---

### Phase 6 — Migrate `OperatorProjectDetector`

Replace `detectOperatorProject()` body with `OperatorPluginRegistry.detectProject(dirPath)`.

Update `isRootStandardCustom()` to call `OperatorPluginRegistry.detectProject(workspacePath)` and check `match?.projectType === OperatorProjectType.STANDARD_CUSTOM`.

Update `scanForOperatorProjects()` and `scanForStandardCustomOperatorProjects()` similarly.

**Key check:** `match.projectType` is the `IProjectDetector.projectType` field — this is the correct `OperatorProjectType` string, unlike `plugin.opType` which would be wrong.

**Files changed:** `domain/services/operator-project-detector.ts` (~150 → ~30 lines)
**Risk:** Medium. Detection priority is semantically meaningful. Test STANDARD_CUSTOM, ASCEND_C, TORCH_LIBRARY, PYASC, and the experimental sub-directory case (StandardCustomDetector Path 2).

---

### Phase 7 — Migrate `BuildService`

Replace the three `isPyascType` blocks with `opPlugin.buildBehavior` queries. Also reconcile the behavioral asymmetries between the three methods:
- Unify the `params.filePath` vs `params.operatorNames` skip condition (choose one)
- Unify `return` vs `throw` on active-file-check failure (choose one, consistently)
- Extract the active-file-check + config-patch block into `ensureActiveFile(behavior)`

The `isRootStandardCustom()` call stays and now routes through the registry (from Phase 6).

**Files changed:** `service/build-service.ts` — ~120 lines of duplicated blocks → ~20 lines
**Risk:** Medium-High. Test all 4 flows (build, run, simulate, onboard) for all operator types. Feature-flag gated if needed.

---

### Phase 8 — Update V2 Execution Steps

Add `opPlugin: IOperatorPlugin` and `projectType: OperatorProjectType | undefined` to `ExecutionContext`.

Implement `canSkip` in:
- `BuildStep`: `!context.opPlugin.buildBehavior.requiresBuildBeforeAnalysis`
- `ActiveFileCheckStep` (new): `!context.opPlugin.buildBehavior.requiresActiveFileCheck`
- `ExampleBuildStep` (new): `context.projectType !== OperatorProjectType.STANDARD_CUSTOM`

Update `StandardSimulateStrategy` and `StandardOnBoardStrategy` to include the new steps.

The V2 controller no longer needs pyasc-specific logic.

**Risk:** Low — additive. Existing steps still work.

---

### Phase 9 — Consolidate

- Delete `CommandStrategyFactory` if no longer referenced (the registry replaces it). Or keep as a deprecated shim calling the registry.
- Consider merging V2's DI container, `Result<T,E>`, and notification interfaces into `src` directly to eliminate the parallel codebase.
- Update `OperatorProjectType` enum to add any new type values introduced (e.g. `TRITON`).
- Archive or redirect `plugin/src-v2` documentation.

**Risk:** Low — cleanup only.

---

### Summary

| After Phase | New operator type needs |
|---|---|
| Start (V1) | 6–8 files |
| Phase 1 | 6–8 files (registry exists, unwired) |
| Phase 2 | **1 file + 2 lines** (registry wired, but old dispatch still runs) |
| Phase 3–7 | **1 file + 2 lines** (each phase migrates one dispatch location) |
| Phase 8–9 | **1 file + 2 lines**, V2 steps fully operator-agnostic |

Every phase is independently releasable and testable. Rollback is safe at any boundary.
