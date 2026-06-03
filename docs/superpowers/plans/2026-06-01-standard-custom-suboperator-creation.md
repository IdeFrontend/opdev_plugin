# Standard-custom Sub-operator Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When creating an operator inside a standard-custom collection (e.g. `ops-math`), keep the user in the collection window, create the operator at the specified path attached to the collection, and never register a phantom standalone `ascend` project — so the operator is no longer mis-typed.

**Architecture:** Scaffold the new operator under the **parent collection's** `project_id` with an explicit `op_path = subOpDir` (Approach B from the spec), thread an explicit output path through the prototype/structure generators so no per-operator project record is created, drop the "open in current/new window" prompt + folder switch for this case, and harden `StandardCustomDetector` so a folder nested inside a `build.sh --genop` collection is typed `STANDARD_CUSTOM` definitively.

**Tech Stack:** TypeScript, VS Code extension API, Jest (ts-jest), pnpm.

**Spec:** `docs/superpowers/specs/2026-06-01-standard-custom-suboperator-creation-design.md`

**Test command (from repo root):**
`npx jest --config plugin/jest.config.js <pathOrPattern>`
(There is no root `test` npm script; jest config lives at `plugin/jest.config.js`, which mocks `vscode` and maps `@plugin/*`, `@shared/*`.)

---

## File Structure

**Modify:**
- `plugin/src/domain/plugins/standard-custom.detector.ts` — add a definitive "nested in a `--genop` collection" path.
- `plugin/src/domain/services/ops-prototype.ts` — `generateOpsPrototype` gains an explicit output-path arg.
- `shared/api-types/ops.d.ts` — extend `CreateOpsParams` / `CreateOpsByPrototypeParams` with optional `outputPath` / `projectId` / `opPath`.
- `plugin/src/service/project-service.ts` — `createOps` / `createOpsByPrototype` honor the new optional fields.
- `plugin/src/class/webview-message-list.ts` — STANDARD_CUSTOM branch uses an optional sub-operator context instead of `ProjectManager`.
- `plugin/src/controller/welcome-controller.ts` — gate sub-operator creation, skip `init`, scaffold via collection id + explicit path, drop the prompt/open, refresh + reveal.

**Create:**
- `plugin/src/domain/utils/sub-operator-creation.ts` — pure, testable gating helper.
- `plugin/src/__tests__/unit/standard-custom-detector-nested.spec.ts`
- `plugin/src/__tests__/unit/generate-ops-prototype-output-path.spec.ts`
- `plugin/src/__tests__/unit/sub-operator-creation.spec.ts`

---

## Task 1: Verify remaining spec §9 assumptions (no code)

This task is read-only confirmation. It guards the assumptions the implementation tasks rely on. Record findings in the PR description.

**Files:**
- Read: `plugin/src/controller/welcome-controller.ts:351-490` (`openProject`)
- Read: `plugin/src/service/workspace-detector-service.ts` (`scanOpsMeetAndOpsLists`, `scanStandardCustomOperators`)
- Read: `plugin/src/service/build-service.ts:189-320`

- [ ] **Step 1: Confirm the collection is registered before sub-operator creation (§9.2)**

Read `openProject` (`welcome-controller.ts:351-490`). Confirm that opening a standard-custom
collection calls `projectService.init(...)` (registers the collection record) and
`updateStandardCustomOperators(...)`. 
Expected: the collection has a `project.json` record (and thus a `project_id`) whenever the
user is working inside it.
Decision gate: if a collection can be the active workspace **without** a record (e.g. folder
restored on startup, no `openProject`), Task 6 must implement `ensureCollectionRegistered`
(register the collection via `projectService.init` before scaffolding). Otherwise, Task 6 may
rely on `getContainingStandardCustomProject` returning the record.

- [ ] **Step 2: Confirm collection build/run is op-aware (§9.1)**

Read `build-service.ts:189-320`. Confirm `getBuildConfigsList` is an aggregation (lists all
configs under the collection `project_id`) and that the actual build/deploy dispatches by a
specific `config_id` (`getStandardCustomDeployCommand(buildConfigId)` at ~line 307).
Expected: per-operator build/deploy is op-aware via `config_id`; multiple operators under one
collection `project_id` is the established model.
Decision gate: if any collection-operator build/run path resolves config op-agnostically and
takes `[0]` under the collection `project_id`, expand scope to pass `op` there. (Strong prior
evidence it is already op-aware — confirm, don't assume.)

- [ ] **Step 3: Confirm op-record surfacing (§9.3/§9.4)**

Read `scanOpsMeetAndOpsLists` / `scanStandardCustomOperators` in
`workspace-detector-service.ts`. Confirm the collection sidebar populates operators by scanning
the collection directory on disk (→ `ops_list`), not by reading per-operator `project.json`
records. 
Expected: removing the phantom per-operator record does not hide the operator in the sidebar.

- [ ] **Step 4: Commit findings**

No code changed. Record the three confirmations (and any scope additions) in the PR description.
If any decision gate triggered a scope addition, note it here before proceeding.

---

## Task 2: Harden `StandardCustomDetector` — nested-in-collection ⇒ definitive

**Files:**
- Modify: `plugin/src/domain/plugins/standard-custom.detector.ts`
- Test: `plugin/src/__tests__/unit/standard-custom-detector-nested.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `plugin/src/__tests__/unit/standard-custom-detector-nested.spec.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StandardCustomDetector } from '@plugin/domain/plugins/standard-custom.detector';
import { OperatorProjectType } from '@plugin/domain/models/operator-project-type';

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sc-detect-'));
}

describe('StandardCustomDetector — nested-in-collection hardening', () => {
  it('types a sub-operator folder (even with .asc files) inside a --genop collection as definitive', async () => {
    const root = mkTmp();
    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n./cmake.sh --genop\n');
    const subOp = path.join(root, 'add_custom');
    fs.mkdirSync(subOp);
    fs.writeFileSync(path.join(subOp, 'CMakeLists.txt'), '');
    fs.writeFileSync(path.join(subOp, 'add_custom.asc'), ''); // .asc would otherwise route to AscendPlugin

    const result = await new StandardCustomDetector().detectProject(subOp);

    expect(result).toEqual({ isMatch: true, confidence: 'definitive' });
  });

  it('does not match an unrelated folder with no --genop ancestor', async () => {
    const root = mkTmp();
    const lone = path.join(root, 'lone_op');
    fs.mkdirSync(lone);
    fs.writeFileSync(path.join(lone, 'CMakeLists.txt'), '');
    fs.writeFileSync(path.join(lone, 'lone.asc'), '');

    const result = await new StandardCustomDetector().detectProject(lone);

    expect(result.isMatch).toBe(false);
  });

  // Sanity: the collection root itself stays definitive via the existing build.sh path.
  it('keeps the collection root definitive', async () => {
    const root = mkTmp();
    fs.writeFileSync(path.join(root, 'build.sh'), '#!/bin/bash\n./cmake.sh --genop\n');

    const result = await new StandardCustomDetector().detectProject(root);

    expect(result).toEqual({ isMatch: true, confidence: 'definitive' });
  });

  it('exposes STANDARD_CUSTOM as its projectType', () => {
    expect(new StandardCustomDetector().projectType).toBe(OperatorProjectType.STANDARD_CUSTOM);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config plugin/jest.config.js standard-custom-detector-nested`
Expected: the first test FAILS (`isMatch: false` today, because `.asc` files defeat Path 2).

- [ ] **Step 3: Implement the definitive nested-collection path**

In `plugin/src/domain/plugins/standard-custom.detector.ts`, inside `detectProject`, immediately
after the Path 1 (`build.sh` in `dirPath` with `--genop`) block and before the Path 2 heuristic
block, insert:

```typescript
    // Path 1.5: definitive — a folder nested inside a standard-custom collection.
    // If an ancestor (within 3 levels) has build.sh with --genop, this directory belongs to
    // that collection regardless of its own .asc/.py/CMake contents.
    if (hasAncestorBuildShWithGenop(dirPath)) {
      return {
        isMatch: true,
        confidence: 'definitive',
      };
    }
```

`hasAncestorBuildShWithGenop` is already imported at the top of the file (from
`./detection-utils`). No new import needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config plugin/jest.config.js standard-custom-detector-nested`
Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/plugins/standard-custom.detector.ts plugin/src/__tests__/unit/standard-custom-detector-nested.spec.ts
git commit -m "fix(detector): type folders nested in a --genop collection as definitive standard-custom"
```

---

## Task 3: `generateOpsPrototype` accepts an explicit output path

**Files:**
- Modify: `plugin/src/domain/services/ops-prototype.ts:65-83`
- Test: `plugin/src/__tests__/unit/generate-ops-prototype-output-path.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `plugin/src/__tests__/unit/generate-ops-prototype-output-path.spec.ts`:

```typescript
jest.mock('@plugin/domain', () => ({
  getProjectById: jest.fn(),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getProjectById } from '@plugin/domain';
import { generateOpsPrototype } from '@plugin/domain/services/ops-prototype';

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('generateOpsPrototype output-path override', () => {
  it('writes <opName>.json into the explicit outputPath, not the project path', async () => {
    const projectPath = mkTmp('proj-');
    const outputPath = mkTmp('subop-');
    const extensionPath = mkTmp('ext-');

    // Minimal prototype template the function reads from the extension dir.
    const tplDir = path.join(extensionPath, 'out/templates/ops_prototype');
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'add_custom.json'), JSON.stringify([{ op: 'placeholder' }]));

    (getProjectById as jest.Mock).mockReturnValue({ id: 7, project_path: projectPath });

    const written = await generateOpsPrototype(7, 'my_op', 'add_custom', extensionPath, outputPath);

    expect(written).toBe(path.join(outputPath, 'my_op.json'));
    expect(fs.existsSync(path.join(outputPath, 'my_op.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, 'my_op.json'))).toBe(false);
  });

  it('falls back to the project path when no outputPath is given', async () => {
    const projectPath = mkTmp('proj-');
    const extensionPath = mkTmp('ext-');
    const tplDir = path.join(extensionPath, 'out/templates/ops_prototype');
    fs.mkdirSync(tplDir, { recursive: true });
    fs.writeFileSync(path.join(tplDir, 'add_custom.json'), JSON.stringify([{ op: 'placeholder' }]));

    (getProjectById as jest.Mock).mockReturnValue({ id: 8, project_path: projectPath });

    const written = await generateOpsPrototype(8, 'fallback_op', 'add_custom', extensionPath);

    expect(written).toBe(path.join(projectPath, 'fallback_op.json'));
    expect(fs.existsSync(path.join(projectPath, 'fallback_op.json'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config plugin/jest.config.js generate-ops-prototype-output-path`
Expected: the first test FAILS — `generateOpsPrototype` currently ignores a 5th argument and
writes into `projectPath`.

- [ ] **Step 3: Implement the output-path parameter**

In `plugin/src/domain/services/ops-prototype.ts`, change `generateOpsPrototype` (currently lines
65-83) to:

```typescript
export async function generateOpsPrototype(
  project_id: number,
  op_name = 'default_op',
  prototype_name = 'add_custom',
  extensionPath: string,
  outputPath?: string,
): Promise<string> {
  const project = getProjectById(project_id);

  if (!project) {
    throw Object.assign(new Error('project not found'), { name: 'InvalidRequest' });
  }

  return generateOpsPrototypeJson(
    outputPath ?? project.project_path,
    op_name,
    prototype_name,
    extensionPath,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config plugin/jest.config.js generate-ops-prototype-output-path`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/services/ops-prototype.ts plugin/src/__tests__/unit/generate-ops-prototype-output-path.spec.ts
git commit -m "feat(ops-prototype): support explicit output path in generateOpsPrototype"
```

---

## Task 4: Thread output path / project id / op path through the service wrappers

**Files:**
- Modify: `shared/api-types/ops.d.ts` (add optional fields to `CreateOpsParams`, `CreateOpsByPrototypeParams`)
- Modify: `plugin/src/service/project-service.ts:45-75` (`createOps`) and `80-131` (`createOpsByPrototype`)

This task has no standalone unit test (the service is VS Code-coupled); it is exercised end-to-end
by Task 5/6 and the manual verification in Task 7. Keep the edits minimal and type-safe.

- [ ] **Step 1: Extend the shared param types**

In `shared/api-types/ops.d.ts`, find `CreateOpsParams` and add an optional field:

```typescript
  /** When set, write the prototype JSON here instead of the project record's path. */
  outputPath?: string;
```

Find `CreateOpsByPrototypeParams` and add two optional fields:

```typescript
  /** Override the project id used for scaffolding (e.g. the parent collection id). */
  projectId?: string | number;
  /** Override the operator output directory passed to generateStructure as op_path. */
  opPath?: string;
```

(If `CreateOpsParams` already has `projectId`/`projectName`, leave them; only add what is missing.)

- [ ] **Step 2: Pass `outputPath` through `createOps`**

In `plugin/src/service/project-service.ts`, in `createOps` (around line 45-68), change the
`generateOpsPrototype` call to forward `params.outputPath`:

```typescript
      const result = await generateOpsPrototype(
        Number(project_id),
        op_name,
        prototype_name,
        context.extensionPath,
        params.outputPath,
      );
```

- [ ] **Step 3: Honor `projectId` / `opPath` in `createOpsByPrototype`**

In `createOpsByPrototype` (lines 80-111), replace the `projectId` resolution and the
`generateStructure` call:

```typescript
      const projectId = params.projectId !== undefined
        ? Number(params.projectId)
        : Number(pm.projectId);

      if (!projectId || isNaN(projectId)) {
        throw new Error(t('project.invalidProjectId', { projectId: params.projectId ?? pm.projectId }));
      }

      const resolvedOpName =
        params.opName?.trim()
        || pm.getProjectName()?.trim()
        || undefined;
      const result = await generateStructure(
        {
          ops_prototype_file: params.opsPrototypeFile,
          project_id: projectId,
          op_type: params.opType || 'ascend',
          template_name: params.templateName,
          ...(resolvedOpName ? { op_name: resolvedOpName } : {}),
          ...(params.opPath ? { op_path: params.opPath } : {}),
        },
        context.extensionPath,
      );
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p plugin` (or `pnpm run type-check`)
Expected: no type errors introduced by the new optional fields.

- [ ] **Step 5: Commit**

```bash
git add shared/api-types/ops.d.ts plugin/src/service/project-service.ts
git commit -m "feat(project-service): thread explicit project id, op path and output path through op creation"
```

---

## Task 5: STANDARD_CUSTOM handler honors a sub-operator context

**Files:**
- Modify: `plugin/src/class/webview-message-list.ts:107-271` (`handleOperatorProjectDirectoryFile`)
- Modify: `plugin/src/extension.ts:1790-1805` (`createDictory` command — payload type only)

- [ ] **Step 1: Extend the message type**

In `plugin/src/class/webview-message-list.ts`, change the `message` parameter type of
`handleOperatorProjectDirectoryFile` (line 108) to allow an optional sub-operator context:

```typescript
  message:
    | {
        createOperatorProjectDirectoryFileType: OperatorProjectViewIdValue;
        subOperatorContext?: {
          parentProjectId: number;
          opName: string;
          outputPath: string;
        };
      }
    | undefined,
```

- [ ] **Step 2: Use the context in the STANDARD_CUSTOM branch**

Replace the STANDARD_CUSTOM branch body (lines 238-271) so it prefers the sub-operator context
over `ProjectManager` when present:

```typescript
      if (message.createOperatorProjectDirectoryFileType === OperatorProjectViewId.STANDARD_CUSTOM) {
        console.log('Start creating operator (type 2)...');
        const pm = ProjectManager.getInstance();
        const ctx = message.subOperatorContext;

        if (!ctx && !pm.projectId) {
          console.log('projectId not set, trying to initialize project...');
          await pm.ensureProjectId();
        }

        const projectIdForScaffold = ctx ? ctx.parentProjectId : Number(pm.projectId);
        const opName = ctx ? ctx.opName : pm.getProjectName();

        const opsPrototypeFilePath = await welcomeMethods.createOps(
          ctx
            ? { projectId: String(ctx.parentProjectId), projectName: ctx.opName, outputPath: ctx.outputPath }
            : {},
        );

        console.log('Operator prototype file path:', opsPrototypeFilePath);

        if (opsPrototypeFilePath) {
          await welcomeMethods.createOpsByPrototype({
            opsPrototypeFile: opsPrototypeFilePath,
            opType: 'ascend',
            opName,
            ...(ctx ? { projectId: ctx.parentProjectId, opPath: ctx.outputPath } : {}),
          });
        }
        else {
          throw new Error(t('webview.createPrototypeFailedEmptyPath'));
        }

        // In the in-place sub-operator flow there is no separate editor to close.
        if (!ctx) {
          await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
      }
```

- [ ] **Step 3: Extend the `createDictory` command payload type**

In `plugin/src/extension.ts` (lines 1790-1805), widen the `data` parameter type of the
`COMMAND_CREATE_DIRECTORY` handler and forward the context:

```typescript
    async (
      data: {
        createOperatorProjectDirectoryFileType: OperatorProjectViewIdValue;
        subOperatorContext?: {
          parentProjectId: number;
          opName: string;
          outputPath: string;
        };
      },
      progress: vscode.Progress<{
        message?: string;
        increment?: number
      }>,
    ) => {
      await handleOperatorProjectDirectoryFile(
        data,
        createOpsProvider,
        progress,
      );
    },
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p plugin`
Expected: no errors. (The caller in Task 6 will start passing `subOperatorContext`.)

- [ ] **Step 5: Commit**

```bash
git add plugin/src/class/webview-message-list.ts plugin/src/extension.ts
git commit -m "feat(webview): honor a sub-operator context when scaffolding standard-custom operators"
```

---

## Task 6: Gate sub-operator creation and run the in-place flow

**Files:**
- Create: `plugin/src/domain/utils/sub-operator-creation.ts`
- Test: `plugin/src/__tests__/unit/sub-operator-creation.spec.ts`
- Modify: `plugin/src/controller/welcome-controller.ts:96-345` (`createdProject`)

### 6a. Pure gating helper (TDD)

- [ ] **Step 1: Write the failing test**

Create `plugin/src/__tests__/unit/sub-operator-creation.spec.ts`:

```typescript
import { isSubOperatorCreation } from '@plugin/domain/utils/sub-operator-creation';

describe('isSubOperatorCreation', () => {
  const base = {
    subOpDir: '/repo/experimental/add',
    isStandardCustomViewId: true,
    hasAncestorGenop: () => true,
  };

  it('is true for a standard-custom view id nested under a --genop collection', () => {
    expect(isSubOperatorCreation(base)).toBe(true);
  });

  it('is false when the requested view id is not standard-custom', () => {
    expect(isSubOperatorCreation({ ...base, isStandardCustomViewId: false })).toBe(false);
  });

  it('is false when there is no --genop ancestor collection', () => {
    expect(isSubOperatorCreation({ ...base, hasAncestorGenop: () => false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config plugin/jest.config.js sub-operator-creation`
Expected: FAIL — module `sub-operator-creation` does not exist yet.

- [ ] **Step 3: Implement the helper**

Create `plugin/src/domain/utils/sub-operator-creation.ts`:

```typescript
/**
 * Decide whether a "create operator" request targets a sub-operator inside an existing
 * standard-custom collection (as opposed to creating a brand-new standalone project).
 *
 * Pure and side-effect free so it can be unit-tested without the filesystem or VS Code.
 * The caller injects the filesystem signal via `hasAncestorGenop`.
 */
export function isSubOperatorCreation(params: {
  /** Absolute path of the operator directory being created. */
  subOpDir: string;
  /** True when the requested project view id is the standard-custom one. */
  isStandardCustomViewId: boolean;
  /** True when an ancestor of subOpDir has build.sh containing --genop. */
  hasAncestorGenop: (dir: string) => boolean;
}): boolean {
  return params.isStandardCustomViewId && params.hasAncestorGenop(params.subOpDir);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config plugin/jest.config.js sub-operator-creation`
Expected: all three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/domain/utils/sub-operator-creation.ts plugin/src/__tests__/unit/sub-operator-creation.spec.ts
git commit -m "feat(utils): add pure isSubOperatorCreation gating helper"
```

### 6b. Wire `createdProject` to the in-place flow

- [ ] **Step 6: Add imports to `welcome-controller.ts`**

At the top of `plugin/src/controller/welcome-controller.ts`, add:

```typescript
import { isSubOperatorCreation } from '@plugin/domain/utils/sub-operator-creation';
import { hasAncestorBuildShWithGenop } from '@plugin/domain/plugins/detection-utils';
import {
  getContainingStandardCustomProject,
} from '@plugin/domain/models/project-model';
```

(`getProjectByPath`, `createProject` are already imported from `project-model`; add
`getContainingStandardCustomProject` to that existing import if it is the same module path.)

- [ ] **Step 7: Compute the gate near the top of `createdProject`**

In `createdProject`, right after `const projectDir = path.join(params.projectPath, params.projectName);`
is created (the dir is made around lines 132-136), compute:

```typescript
      const subOpDir = path.join(params.projectPath, params.projectName);
      const isStandardCustomViewId =
        viewIdToProjectType(params.createOperatorProjectDictoryFileType) === 'ascend'
        && hasAncestorBuildShWithGenop(subOpDir);
      const isSubOp = isSubOperatorCreation({
        subOpDir,
        isStandardCustomViewId,
        hasAncestorGenop: hasAncestorBuildShWithGenop,
      });
      const parentCollection = isSubOp ? getContainingStandardCustomProject(subOpDir) : undefined;
```

Note: `viewIdToProjectType(STANDARD_CUSTOM) === 'ascend'` (see `project-utils.ts:162`); the
`hasAncestorBuildShWithGenop` check distinguishes a sub-operator from a brand-new top-level
standard-custom collection (whose own `build.sh` is created later, not yet present at an
ancestor).

- [ ] **Step 8: Branch the registration + scaffolding for sub-operators**

Replace the existing `projectType === 'ascend'` metadata block (lines 156-235) and the
`projectService.init(...)` call (lines 237-249) with a branch:

```typescript
      if (isSubOp) {
        // Sub-operator inside a standard-custom collection. We must have the collection's
        // record to scaffold under its project_id. Task 1 §9.2 verifies the collection is
        // registered whenever the user works inside it. If that gate found it can be missing,
        // implement ensureCollectionRegistered (Task 1) and assign parentCollection here.
        // Never fall through to the standalone init below — that is the phantom-record bug.
        if (!parentCollection) {
          throw new Error(t('welcome.initOperatorProjectFailed', {
            error: 'standard-custom collection is not registered (see plan Task 1 §9.2)',
          }));
        }
        // Attach to the parent collection's ops list (regular vs experimental by path).
        const newSubOperator: SubOperatorInfo = {
          name: params.projectName,
          path: subOpDir,
          isCompiled: false,
        };
        const isExperimental = subOpDir.toLowerCase().includes('experimental');
        await createProject({
          project_name: parentCollection.project_name,
          project_path: parentCollection.project_path,
          ...(isExperimental
            ? { experimental_ops_list: [ ...(parentCollection.experimental_ops_list || []), newSubOperator ] }
            : { ops_list: [ ...(parentCollection.ops_list || []), newSubOperator ] }),
        });
        // No projectService.init here: do NOT create a standalone record for the sub-operator.
      }
      else {
        // Existing standalone-project flow (new top-level project of any type).
        try {
          await projectService.init({
            ascendEnvScript: params.projectSH,
            projectPath: params.projectPath,
            projectName: params.projectName,
            templateName: params.templateName,
            projectType: viewIdToProjectType(params.createOperatorProjectDictoryFileType),
          });
        }
        catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          throw new Error(t('welcome.initOperatorProjectFailed', { error: msg }));
        }
      }
```

- [ ] **Step 9: Pass the sub-operator context to `createDictory`**

In the `withProgress` block that runs `huawei-op-devtools.createDictory` (lines 304-311), pass the
context when `isSubOp`:

```typescript
            const result = await vscode.commands.executeCommand(
              'huawei-op-devtools.createDictory',
              {
                createOperatorProjectDirectoryFileType:
                  params.createOperatorProjectDictoryFileType,
                ...(isSubOp && parentCollection
                  ? {
                    subOperatorContext: {
                      parentProjectId: Number(parentCollection.id),
                      opName: params.projectName,
                      outputPath: subOpDir,
                    },
                  }
                  : {}),
              },
              progress,
            );
```

- [ ] **Step 10: Stay in place instead of prompting/opening**

Replace the final prompt + open block (lines 325-336) with:

```typescript
      if (isSubOp) {
        // Stay in the collection window: refresh the sidebar and reveal the new operator.
        await requestSidebarContextsRefresh();
        try {
          await vscode.commands.executeCommand('revealInExplorer', localUri);
        }
        catch (error) {
          console.warn(`Failed to reveal in explorer: ${error instanceof Error ? error.message : String(error)}`);
        }
        return;
      }

      const forceNewWindow = await promptForceNewWindowForOpenFolder();
      if (forceNewWindow === undefined) {
        return;
      }

      try {
        await vscode.commands.executeCommand('vscode.openFolder', localUri, { forceNewWindow });
        vscode.window.showInformationMessage(t('welcome.openProjectDirSuccess'));
      }
      catch (e) {
        vscode.window.showErrorMessage(t('welcome.openProjectDirFailed', { error: e instanceof Error ? e.message : String(e) }));
      }
```

(`requestSidebarContextsRefresh` is already imported at the top of the file.)

- [ ] **Step 11: Type-check the controller**

Run: `npx tsc --noEmit -p plugin`
Expected: no type errors.

- [ ] **Step 12: Commit**

```bash
git add plugin/src/controller/welcome-controller.ts
git commit -m "fix(welcome): create standard-custom sub-operators in place without a phantom project"
```

---

## Task 7: Regression, lint, and manual smoke test

**Files:**
- Run: full unit suite, lint
- Manual: VS Code Extension Host

- [ ] **Step 1: Run the full unit suite**

Run: `npx jest --config plugin/jest.config.js`
Expected: the new specs pass; pre-existing failures match `HEAD` (the repo baseline is not green —
lint + one Jest suite fail on a clean checkout). Compare against a clean `HEAD` run; do not
attribute pre-existing failures to this change.

- [ ] **Step 2: Lint the changed files**

Run: `pnpm run lint`
Expected: no new lint errors in the files touched by this change (baseline lint failures may exist;
confirm none are newly introduced by diffing against `HEAD`).

- [ ] **Step 3: Manual smoke test (Extension Host)**

1. Open an existing standard-custom collection (a folder whose root `build.sh` contains `--genop`,
   e.g. an `ops-math`-style project).
2. Create a new standard-custom operator at a path inside the collection.
3. Expected:
   - **No** "open in current/new window" prompt appears.
   - The window stays on the collection; the new operator appears in the Operator Development
     sidebar under the collection, and is revealed in Explorer.
   - `project.json` gains **no** new standalone record for the sub-operator path; the operator is
     in the parent collection's `ops_list` (or `experimental_ops_list`).
   - The operator's files (op_host/op_kernel, `<opName>.json` prototype, `.vscode/`) are created in
     the sub-operator directory.
4. Build the new operator via the collection workflow; confirm it builds (op-aware via `config_id`).
5. Separately, open the sub-operator folder standalone (File → Open Folder); confirm it is detected
   as `STANDARD_CUSTOM` (not `ascend`).

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "test: regression and manual verification for standard-custom sub-operator creation"
```

---

## Notes for the implementer

- **Do Task 1 first.** If a decision gate triggers (collection not registered at create time, or a
  collection build path that is op-agnostic), add the scoped task it describes before continuing.
- **op_type stays `ascend`.** This change stops creating a standalone *project* of type `ascend`; it
  does not change the operator's `op_type`.
- **No phantom record = nothing to clean up on failure.** If scaffolding fails, the directory exists
  (warn, as today) but no standalone record was created.
- **Experimental routing** is decided by the path containing `experimental` (Step 8), matching the
  existing `createdProject` logic.
