# Plugin V2: Architecture, Features, and Design Goals

This document describes the architecture, features, and design goals of the **src-v2** implementation of the MSTT VS Code plugin. V2 runs alongside V1 and is toggled via feature flags.

---

## 1. Design Goals

### 1.1 Why V2 Exists

V1 (plugin/src) had grown with:

- **Scattered responsibilities** – controllers, services, and domain logic mixed together.
- **Inconsistent error handling** – ad-hoc try/catch and different patterns per flow.
- **Tight coupling to VSCode** – services calling `vscode.window` and other APIs directly, making tests and reuse hard.
- **Heavy branching** – execution flows (build → simulate, build → onboard, build → sanitizer) implemented as separate methods with duplicated structure; adding a new flow meant more copy-paste or more conditionals.
- **Weak typing** – frequent type assertions and loose types.

V2 was started to:

1. **Reduce branching on execution flow** – support different flows (simulate, onboard, sanitizer) via composable strategies and steps instead of separate methods and if/else.
2. **Improve testability** – clear layers, interfaces, and dependency injection so that domain and application logic can be unit-tested without VSCode.
3. **Improve maintainability** – consistent error handling (Result type), explicit dependencies, and a single execution algorithm (strategy.execute) instead of many similar methods.
4. **Stay safe** – coexist with V1 behind feature flags so the team can roll out and roll back without big-bang replacement.

### 1.2 Non-Goals (Current Scope)

- **Replacing operator-type branching** – Command and script generation still use the existing domain (`getBuildOpCommand`, etc.) and thus still branch on `op_type` (ascend, pyasc, cann). Adding a new operator type (e.g. Triton) still requires changes in model, op-util, build-service, and other V1 code paths that V2 calls into.
- **Replacing project detection** – Operator/project type detection remains in `OperatorProjectDetector`; V2 does not redefine or replace it.
- **Full migration** – Config management, project management (initOps, createOps, etc.), and other features are still on V1; migration is incremental.

---

## 2. Architecture

### 2.1 Layered Structure (DDD-style)

V2 is organized into four layers plus a small DI (dependency injection) setup:

| Layer | Role | Key contents |
|-------|------|----------------|
| **Presentation** | Handle API requests and UI | `BuildControllerV2` – startBuild, startRun, startSimulate, startOnBoard, runSanitizer, stopTask. Delegates to application layer and shows notifications via `INotificationService`. |
| **Application** | Orchestrate use cases | `BuildApplicationService` – resolves config IDs, calls orchestrator (build, run, buildExample, simulate, onBoard, sanitizer). Returns `Result<T, E>`. |
| **Domain** | Core business rules and types | Operator entities, value objects, execution strategies and steps, `BuildOrchestratorService`, `CommandGeneratorService`, strategy config types. No VSCode or I/O here. |
| **Infrastructure** | Concrete implementations | `ConfigRepositoryImpl`, `CommandExecutorAdapter`, `VscodeNotificationService` – implement interfaces defined in application/domain. |
| **DI** | Wire dependencies | `createContainer()`, `DI_TOKENS` – register implementations and resolve controllers/services. |

Dependencies point inward: presentation → application → domain; infrastructure implements interfaces used by application/domain.

### 2.2 Strategy Pattern for Execution Flows

Execution flows (e.g. “build then simulate” or “build then onboard”) are not implemented as separate methods with duplicated logic. Instead:

- **Steps** – `IExecutionStep`: single-responsibility units (e.g. `BuildStep`, `SimulateStep`, `OnBoardStep`). Each has `execute(context)` and optional `canSkip(context)`.
- **Strategies** – `IExecutionStrategy`: define an ordered list of steps (e.g. `StandardSimulateStrategy` → [BuildWithSimulatorStep, SimulateStep]). The base class runs them in a loop and short-circuits on first error.
- **Factory** – `ExecutionStrategyFactory`: creates a strategy from `TaskType` (simulate, onBoard, sanitizer, build, run) and `StrategyVariant` (standard, fast, with-validation, custom). New flows or variants = new strategy class + registration; no new branches in the orchestrator.

The orchestrator exposes both legacy methods (`simulate()`, `onBoard()`, `sanitizer()`) and strategy-based methods (`simulateWithStrategy()`, `onBoardWithStrategy()`, `sanitizerWithStrategy()`). Controllers can call either; the strategy-based path is the one without flow-type branching.

### 2.3 Dependency Injection

A small container in `di/` provides:

- **Tokens** – `DI_TOKENS` for ProjectManager, NotificationService, CommandExecutor, ConfigRepository, CommandGenerator, BuildOrchestrator, BuildApplicationService, BuildController.
- **Registration** – singletons or factory functions; `CommandExecutor` is derived from `ProjectManager.getExecutor()` so it stays aligned with the current project context.
- **Resolution** – controllers and services are obtained from the container when wiring the plugin, so tests can inject mocks (e.g. fake notification, fake executor).

This keeps presentation and application code free of direct VSCode or global singletons for the parts that are in V2.

### 2.4 Error Handling: Result Type

Functions that can fail return `Result<T, E>` (ok/error discriminant) instead of throwing. This gives:

- Explicit error types (e.g. `BuildFailedError`, `ConfigNotFoundError`).
- A single pattern for “success or failure” and easier composition in the orchestrator and application layer.
- No hidden control flow from exceptions in the core logic.

### 2.5 Integration with V1

- **Commands and scripts** – V2’s `CommandGeneratorService` delegates to the existing domain (`getBuildOpCommand`, `getSimulateCommand`, etc.). So all operator-type-specific branching and script generation remain in V1 code paths.
- **Feature flags** – In `plugin/src/feature-flags.ts`, flags like `USE_V2_BUILD`, `USE_V2_SIMULATE` control whether the API routes call V2 or V1 implementations. Default is false (V1).
- **Routing** – `plugin/src/api-routes.ts` chooses `taskMethodsV2.*` or `taskMethods.*` per operation based on flags.

---

## 3. Features

### 3.1 Implemented in V2

| Feature | Description |
|--------|--------------|
| **startBuild** | Resolve build_op config, call orchestrator.build(); optional compileOption, operatorNames. |
| **startRun** | Resolve build_example config, call orchestrator.run(). Includes PyAsc-specific logic (e.g. require .py file) in the controller. |
| **startBuildExample** | Resolve build_example config, call orchestrator.buildExample(). |
| **startSimulate** | Resolve configs, call orchestrator.simulate() or simulateWithStrategy() with context (buildConfigId, simulateConfigId, exampleConfigId, simulatorType). |
| **startOnBoard** | Resolve configs, call orchestrator.onBoard() or onBoardWithStrategy(). |
| **runSanitizer** | Resolve configs, call orchestrator.sanitizer() or sanitizerWithStrategy(). |
| **stopTask** | Stop the current task via the executor reference held by the controller when any V2 flow is active. |

Strategy-based entry points (e.g. `simulateWithStrategy(..., variant)`) allow choosing a strategy variant (standard, fast, with-validation) without adding new conditionals in the orchestrator.

### 3.2 Test Coverage

- Unit tests for domain (e.g. BuildOrchestrator, strategies), application (BuildApplicationService), infrastructure (ConfigRepository, CommandExecutor adapter), and presentation (BuildController).
- Jest is configured; tests live under `__tests__/` next to the code. Target coverage for V2 code is 80%+.

### 3.3 What Remains on V1

- Config management (getConfigData, saveBuildConfig, saveConfig).
- Project/operator management (initOps, createOps, createOpsByPrototype).
- All other API routes and UI flows not listed above.
- Command and script generation (and thus all operator-type branching).
- Project/operator type detection.

---

## 4. Document Map

| Document | Purpose |
|----------|---------|
| **README.md** | V2 overview, directory tree, feature flags, how to enable V2, migration status, FAQ. |
| **QUICKSTART.md** | Short steps to enable V2 (e.g. toggle script, compile, F5) and verify. |
| **STRATEGY_PATTERN_GUIDE.md** | How to define steps and strategies, use the factory, and add custom strategies. |
| **REFACTORING_SUMMARY.md** | Completed refactor items, design patterns used, code stats, before/after examples. |
| **ARCHITECTURE_AND_GOALS.md** | This document – design goals, architecture, and features in one place. |

---

## 5. Summary

- **Design goals:** Clear layers, less branching on execution flow, testability, consistent errors, and safe rollout via feature flags. Operator-type handling is intentionally unchanged in this phase.
- **Architecture:** DDD-style layers (presentation → application → domain, infrastructure implementing interfaces), strategy pattern for execution flows, small DI container, Result-based errors, and deliberate reuse of V1 for commands and scripts.
- **Features:** Build, run, buildExample, simulate, onBoard, sanitizer, and stopTask are implemented in V2; strategy variants allow new flows without new branches in the orchestrator. Config/project management and operator-type-specific logic remain in V1.
