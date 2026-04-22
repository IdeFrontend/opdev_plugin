# Operator Type Architecture: Problem, V2 Approach, and Refactoring Proposal

This document analyzes why adding new operator types in `plugin/src` is complicated, how `plugin/src-v2` addresses part of the problem, and proposes a unified refactoring strategy for `plugin/src` to make new operator types easy to support.

---

## 1. The Original Problem in `plugin/src`

### 1.1 Two parallel “operator kind” concepts

The codebase uses two related but distinct notions of “operator kind”:

| Concept | Where | Values | Purpose |
|--------|--------|--------|---------|
| **`op_type`** | Domain (ops, configs) | `'ascend'`, `'cann'`, `'pyasc'` | Command/script generation, paths, templates |
| **`OperatorProjectType`** | Detection / UI | `STANDARD_CUSTOM`, `ASCEND_C`, `TORCH_LIBRARY`, `PYASC`, `MULTI_PROJECT` | Project detection, context menus, feature availability |

They are related (e.g. ASCEND_C/TORCH_LIBRARY → `op_type = 'ascend'`, PYASC → `'pyasc'`, STANDARD_CUSTOM → `'cann'`) but the mapping is **repeated in multiple places** and many call sites branch on both.

### 1.2 Scattered branching and duplicated logic

Adding a new operator type (e.g. a new backend like “triton”) today requires touching many unrelated modules and adding new `if`/`switch` branches in each.

#### Command generation (strategy per `op_type`)

- **`domain/services/command-strategy/factory.ts`**  
  `CommandStrategyFactory.getStrategy(opType)` returns a strategy for ascend/cann/pyasc (default cann).  
  Adding a type = new strategy class + `factory.register('triton', new TritonCommandStrategy())`.
- **`domain/services/command.ts`**  
  Every command helper calls `CommandStrategyFactory.getStrategy(baseContext.operator?.op_type)` and then uses the strategy. This part is **already centralized** and extensible; the pain is elsewhere.

#### Paths and default targets

- **`domain/utils/op-util.ts`**  
  `getDefaultTarget()` branches on `op.op_type`:
  - `ascend` → run package path + `test_aclnn_*` example path  
  - `pyasc` → `python3 ./${op.op_name}.py`  
  - else (cann) → `build/op_name`  
  No shared abstraction; adding a type means adding another `if (op.op_type === 'triton')` block.

#### Op (template) generation

- **`domain/services/op-generator-factory.ts`**  
  `OpGeneratorFactory.getGenerator()` uses `if (opType === 'cann')` / `if (opType === 'pyasc')` / else Ascend.  
  New type = new generator class + new branch in the factory.

#### Script generation (build, debug, simulate, onboard, example)

- **`domain/models/model.ts`**  
  Multiple helpers branch on `type` (i.e. `op_type`):
  - `getNpuDebugScript(type, scriptPath)` — ascend vs else  
  - `getCpuDebugScript(type, scriptPath)` — ascend vs else  
  - `getSimulateScript(type, scriptPath)` — ascend vs else  
  - `getOnBoardScript(type, scriptPath)` — ascend vs else  
  - `getExampleScript(type, scriptPath)` — ascend vs else  
  `generateStructure()` uses `record.op_type` for script choice (e.g. `record.op_type === 'ascend'` for package/sanitizer scripts).  
  New operator type = new branches in each of these functions.

#### Project detection → `op_type` mapping

- **`service/folder-context-menu-service.ts`**  
  A large `switch (detection.projectType)` maps `OperatorProjectType` → `opType` + template (e.g. PYASC → `pyasc` + `pyasc_temple`, STANDARD_CUSTOM → `cann`).  
  The same file repeats:
  - `isAscendLikeOperator(operatorType)` in many places  
  - `operatorType === OperatorProjectType.PYASC`  
  - `OperatorProjectType.STANDARD_CUSTOM`  
  for feature support and warnings. Dozens of call sites.

#### Build and task logic

- **`service/build-service.ts`**  
  Uses `project?.project_type === 'pyasc'` and `OperatorProjectType.PYASC` for PyAsc-specific behavior (e.g. operatorNames requirement).
- **`controller/task-controller.ts`**  
  Branches on `OperatorProjectType.PYASC` for task handling.
- **`controller/home-controller.ts`**, **`controller/welcome-controller.ts`**  
  Branch on `OperatorProjectType` for UI and template selection.

#### Summary of touch points for one new operator type

| Area | Files | Change |
|------|--------|--------|
| Commands | command-strategy (new strategy + register) | Already clean |
| Paths | op-util.ts | New `if (op.op_type === 'new')` in `getDefaultTarget()` |
| Op generation | op-generator-factory.ts | New generator class + branch in `getGenerator()` |
| Scripts | model.ts | New branches in 5+ script helpers and in `generateStructure()` |
| Project → op_type | folder-context-menu-service.ts | New case in switch + possibly new `isXxxOperator()` and branches |
| Build/task/UI | build-service, task-controller, home-controller, welcome-controller | New checks for project type / op_type |

So the **core architectural problem** is: **operator-type-specific behavior is not centralized**. There is no single “operator type descriptor” that defines paths, scripts, templates, and command behavior. Instead, each layer re-implements branching on `op_type` or `OperatorProjectType`, which makes adding a new type costly and error-prone.

---

## 2. How `plugin/src-v2` Tries to Solve It

### 2.1 What V2 actually improves

V2 introduces a **task-centric strategy pattern** for **execution flows** (simulate, onboard, sanitizer, build, run):

- **Steps** (`IExecutionStep`): atomic actions (BuildStep, SimulateStep, OnBoardStep, etc.).
- **Strategies** (`IExecutionStrategy`): ordered lists of steps (e.g. StandardSimulateStrategy = build-for-simulator + simulate).
- **Factory**: `ExecutionStrategyFactory` creates strategies by **TaskType** (SIMULATE, ON_BOARD, SANITIZER, BUILD, RUN) and **StrategyVariant** (STANDARD, FAST, WITH_VALIDATION, CUSTOM).

Effects:

- **Execution flow** branching is removed from the orchestrator: new flows = new strategy + steps + registration; no new conditionals in the orchestrator.
- **Layers and testability**: DDD-style layers, DI, Result-based errors.
- **Config-driven strategy selection**: e.g. project type → strategy variant for onboard (e.g. CUSTOM → WITH_VALIDATION).

So V2 successfully **generalizes “how we run a task”** (steps + strategies) and avoids duplicated “if simulate / if onboard / if sanitizer” logic.

### 2.2 What V2 does not change

V2 **explicitly does not** replace operator-type branching:

- **Commands and scripts** still come from V1: `CommandGeneratorService` in V2 delegates to `getBuildOpCommand`, `getSimulateCommand`, etc. from `@plugin/domain`. All `op_type`-specific command and script logic remains in `plugin/src`.
- **Project/operator type detection** stays in V1’s `OperatorProjectDetector`; V2 uses it (e.g. in BuildController for PyAsc-specific behavior) but does not redefine it.
- **Paths, templates, script generation, context menus** are unchanged; they still rely on scattered `op_type` and `OperatorProjectType` checks in `plugin/src`.

So: **V2 solves “different execution flows” (task + variant), but not “different operator types” (ascend/cann/pyasc/…).** Adding a new operator type still requires the same multi-file changes in `plugin/src` as before.

---

## 3. Proposed Direction: Unify Operator Type in `plugin/src`

The goal is to make **one new operator type** require **one new module (or config)** and **one registration**, instead of many `if`/`switch` branches across the codebase.

### 3.1 Single source of truth per operator type

Introduce an **operator type descriptor** (or small registry) that defines everything that today is scattered:

- **Command strategy** (already exists: `CommandStrategy`).
- **Default paths / targets** (today in `op-util.ts`): target op file, target example file, run path.
- **Scripts** (today in `model.ts`): build, npu_debug, cpu_debug, simulate, onboard, example (and any special cases like ascend `--pkg`, `--mssanitizer`).
- **Op generator** (today in `op-generator-factory.ts`): template name, template path, parseMeta/executeGeneration behavior.
- **Project-type mapping**: which `OperatorProjectType`(s) map to this `op_type` (for detection and context menus).

Concretely, define an interface, e.g.:

```ts
// Example shape (conceptual)
interface OperatorTypeDescriptor {
  readonly opType: string;  // 'ascend' | 'cann' | 'pyasc' | ...

  getCommandStrategy(): CommandStrategy;
  getOpGenerator(params: Params, project: Project, extensionPath: string): BaseOpGenerator;

  getDefaultTarget(op: Op, opRunPath: string): { targetDir; targetOpFile; targetExampleFile };
  getRunPath(op: Op, config?: ConfigRecord): string;

  getBuildScript?(record: OpRecord, opScriptPath: string, socVersion: string): string;
  getNpuDebugScript?(scriptPath: string, socVersion: string): string;
  getCpuDebugScript?(scriptPath: string, socVersion: string): string;
  getSimulateScript?(scriptPath: string, socVersion: string): string;
  getOnBoardScript?(scriptPath: string, socVersion: string): string;
  getExampleScript?(scriptPath: string): string;
  getSanitizerScript?(record: OpRecord, opScriptPath: string, socVersion: string): string;

  /** OperatorProjectType(s) that map to this op_type (for detection → op_type) */
  projectTypes: OperatorProjectType[];
}
```

Then:

- **One place** holds the registry: `OperatorTypeRegistry.get(opType): OperatorTypeDescriptor`.
- **One place** maps `OperatorProjectType` → `op_type`: e.g. registry or a small map derived from descriptors (each descriptor declares its `projectTypes`).

All current call sites that branch on `op_type` or `OperatorProjectType` for paths, scripts, commands, or generators would instead:

- Resolve `op_type` from config/operator or from `OperatorProjectType` (via the single mapping).
- Call the descriptor (or strategy/generator obtained from it) for paths, scripts, commands, and op generation.

No more ad-hoc `if (op.op_type === 'ascend')` in `op-util`, or repeated `getNpuDebugScript(type, ...)` branches in `model.ts`; the descriptor implements the behavior for that type.

### 3.2 Refactor steps (incremental)

1. **Introduce `OperatorTypeDescriptor` and registry**  
   - Add the interface and a registry (e.g. `OperatorTypeRegistry`).  
   - Implement one descriptor per existing type (ascend, cann, pyasc), moving logic out of `op-util`, `model.ts`, and `op-generator-factory` into these descriptors (or small helpers used by them).  
   - Keep existing public APIs (e.g. `getDefaultPath(op)`, `getBuildOpCommand(...)`) but implement them by delegating to the registry + descriptor.

2. **Unify project type → op_type mapping**  
   - Derive the mapping from descriptors (each descriptor’s `projectTypes`).  
   - Use this single mapping in `folder-context-menu-service` and anywhere else that currently has a switch/case from `OperatorProjectType` to `opType`/template.  
   - Optionally, move “template name for project type” into the descriptor so “create ops by template” uses the descriptor as well.

3. **Replace direct op_type branching**  
   - In `op-util.ts`: `getDefaultTarget` / `getDefaultPath` call `OperatorTypeRegistry.get(op.op_type).getDefaultTarget(...)` (or equivalent).  
   - In `model.ts`: replace every `getNpuDebugScript(type, ...)`-style function with a call to the descriptor for the given `op_type`.  
   - In `op-generator-factory.ts`: `getGenerator` becomes “get descriptor by op_type, then return descriptor.getOpGenerator(...)”.  
   - Command layer already uses `CommandStrategyFactory`; optionally make the descriptor return the same strategy so the strategy is owned by the descriptor and the factory just looks up by op_type (or the registry returns both descriptor and strategy).

4. **Reduce `OperatorProjectType` branching in services and controllers**  
   - Where the only question is “which op_type / which behavior?”, use the registry + descriptor.  
   - Where the question is “is this project type supported for this action?” (e.g. “ascend-like not supported for mark-as-operator”), keep a small set of rules or a capability matrix, ideally derived from descriptors (e.g. “mark as operator” supported only for certain project types that map to certain op_types).  
   - Aim to have a single place that knows “for this OperatorProjectType, op_type is X and descriptor is Y,” and the rest of the code uses X/Y.

5. **Adding a new operator type**  
   - Implement `OperatorTypeDescriptor` for the new type (and a `CommandStrategy` if needed).  
   - Register the descriptor (and optionally the command strategy) in the registry.  
   - No new branches in `op-util`, `model.ts`, `op-generator-factory`, or in the large switch in `folder-context-menu-service`; only one new module and one registration.

### 3.3 Relation to V2

- **Keep V2’s execution strategy pattern** for task flows (simulate, onboard, sanitizer, etc.). It solves a different axis (flow composition) and works well.
- **Let V2 keep delegating commands to V1**; after refactoring, V1’s command layer will still be the single place that implements command generation, but internally it will be driven by the operator-type descriptor/registry, making it easier to add new types without touching V2.
- Optionally, V2 could later resolve “operator type” through a small facade that uses the same registry, so that any future V2-specific behavior per operator type also goes through one abstraction.

### 3.4 Benefits

- **One place per operator type**: paths, scripts, commands, generators, and project-type mapping live in (or behind) the descriptor and registry.  
- **No duplicated conditionals**: call sites use “get descriptor for this op_type/project type, then call descriptor” instead of many `if (op_type === 'ascend')` / `if (projectType === PYASC)` blocks.  
- **Adding a new type** = implement one descriptor (+ command strategy if needed) + register; no need to hunt through `op-util`, `model`, `op-generator-factory`, `folder-context-menu-service`, build-service, and controllers.  
- **V2 unchanged in spirit**: it continues to own execution flow composition; V1 owns operator-type semantics and becomes easier to extend.

---

## 4. Summary

| Topic | Summary |
|-------|--------|
| **Original problem** | Operator-type-specific behavior is scattered across many files (`op-util`, `model`, `op-generator-factory`, `folder-context-menu-service`, build-service, controllers). Two parallel concepts (`op_type` and `OperatorProjectType`) and repeated if/switch branches make adding a new operator type costly and error-prone. |
| **V2 approach** | V2 introduces a task+variant strategy pattern for **execution flows** (simulate, onboard, sanitizer), removing flow-level branching and improving testability. It **does not** replace operator-type logic; commands and scripts still come from V1, so adding a new operator type still requires the same multi-file changes in `plugin/src`. |
| **Proposal** | Introduce a single **operator type descriptor** (and registry) in `plugin/src` that owns paths, scripts, command strategy, op generator, and project-type mapping. Refactor call sites to use the registry instead of branching on `op_type`/`OperatorProjectType`. Adding a new type then becomes: one descriptor implementation + one registration, with no scattered conditionals. Keep V2’s execution strategy pattern for flows; V1 becomes the single, extensible place for operator-type behavior. |
