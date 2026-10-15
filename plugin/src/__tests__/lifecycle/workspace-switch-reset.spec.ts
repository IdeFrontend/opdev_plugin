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
 * Workspace switch resets the cached project context.
 *
 * Promise: switching `workspaceFolders` re-reads the project context from the NEW
 * path —
 * commands and project type resolve from the new root, the old workspace's
 * cache does NOT leak.
 *
 * The reset is guarded by `path.normalize(primaryPath) !==
 * pm.getProjectInfo()?.path`; the equivalent here is the `pm.projectPath`
 * guard at extension.ts:2599-2604. The handler wiring below mirrors
 * extension.ts:2584-2608 and calls the SAME real production functions
 * (ProjectManager.resetCachedProject + WorkspaceDetectorService.
 * detectAndRegisterWorkspace); `refreshSidebarContexts` is a UI-only closure
 * inside activate() and is intentionally not replicated.
 *
 * The test runs against REAL modules (real fs, real workspace cache, real
 * project-model/op-record resolution) with only the vscode API mocked, in a
 * fresh temp root per case (hermetic — no writes outside tmp).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as vscode from 'vscode';

import { ProjectManager } from '@plugin/core/project/project-manager';
import { homeMethods } from '@plugin/controller/home-controller';
import { WorkspaceDetectorService } from '@plugin/service/workspace-detector-service';
import { readWorkspaceCache } from '@plugin/helpers/workspace-cache';
import { normalizeProjectPath } from '@plugin/domain/models/project-model';
import { resolveOpRecord } from '@plugin/domain/models/op-record';
import {
  COMMAND_FLASH_MS_SANITIZER_RUN_DATA,
  COMMAND_FLASH_PERFORMANCE_RUN_DATA,
  COMMAND_FLASH_DUMP_TENSOR_DATA,
} from '@plugin/constants';

/** Live config backed by a workspace settings.json file (real I/O, like VS Code). */
function makeSettingsConfiguration(settingsFile: string): {
  get: (key: string, def?: unknown)=> unknown;
  inspect: (key: string)=> { key: string;
    workspaceFolderValue: unknown } | undefined;
  update: ()=> Promise<void>;
} {
  const readLive = (): Record<string, unknown> => {
    if (!fs.existsSync(settingsFile)) {
      return {};
    }

    try {
      return JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as Record<string, unknown>;
    }
    catch {
      return {};
    }
  };

  const lookup = (store: Record<string, unknown>, key: string): unknown | undefined => {
    if (key in store) {
      return store[key];
    }

    const dotted = `op-devtools.${key}`;

    return dotted in store ? store[dotted] : undefined;
  };

  return {
    get: (key: string, def?: unknown) => lookup(readLive(), key) ?? def,
    inspect: (key: string) => {
      const value = lookup(readLive(), key);

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

type SwitchHandler = ()=> Promise<void>;

describe('workspace switch re-reads project context from the new root', () => {
  let rootA: string;
  let rootB: string;
  let switchHandler: SwitchHandler | undefined;

  const settingsFileOf = (root: string): string => path.join(root, '.vscode', 'settings.json');

  /** Seed an operator root: type marker in settings + scan state in cache.json. */
  function seedRoot(root: string, projectType: string, opName: string): void {
    const ideDir = path.join(root, '.vscode');

    fs.mkdirSync(ideDir, { recursive: true });
    fs.writeFileSync(settingsFileOf(root), `${JSON.stringify({ 'op-devtools.projectType': projectType }, null, 2)}\n`, 'utf8');

    const key = normalizeProjectPath(root);

    fs.writeFileSync(path.join(ideDir, 'cache.json'), `${JSON.stringify({
      schemaVersion: 1,
      folders: {
        [key]: {
          opsMeet: [],
          opsList: [
            {
              name: opName,
              path: path.join(root, opName),
              isCompiled: false,
            },
          ],
          experimentalOpsList: [],
        },
      },
    }, null, 2)}\n`, 'utf8');
  }

  /**
   * Wire the vscode mock exactly like extension.ts:2584-2608: workspaceFolders
   * drives every read (settings config follows the CURRENT primary folder) and
   * onDidChangeWorkspaceFolders captures the real extension handler for the
   * test to fire.
   */
  function wireVscode(): void {
    const currentPrimary = (): string | undefined => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    vscode.workspace.getConfiguration = jest.fn(() =>
      makeSettingsConfiguration(currentPrimary()
        ? settingsFileOf(currentPrimary() as string)
        : ''));

    (vscode.workspace as unknown as Record<string, unknown>).onDidChangeWorkspaceFolders =
      jest.fn((handler: SwitchHandler) => {
        switchHandler = handler;

        return { dispose: jest.fn() };
      });
  }

  /** Register the extension handler (mirrors extension.ts:2584-2608, incl. the base-fix guard). */
  function registerExtensionHandler(): void {
    const handler: SwitchHandler = async () => {
      vscode.commands.executeCommand(COMMAND_FLASH_MS_SANITIZER_RUN_DATA);
      vscode.commands.executeCommand(COMMAND_FLASH_PERFORMANCE_RUN_DATA);
      vscode.commands.executeCommand(COMMAND_FLASH_DUMP_TENSOR_DATA);

      // Detect operator projects in the workspace
      const workspaceFolders = vscode.workspace.workspaceFolders;

      // Discard stale project cache when the primary workspace folder no longer
      // matches the cached path (base fix 262868bbb; branch form extension.ts:2599).
      const pm = ProjectManager.getInstance();
      const primaryPath = workspaceFolders?.[0]?.uri.fsPath;

      if (primaryPath && path.normalize(primaryPath) !== pm.projectPath) {
        pm.resetCachedProject();
      }

      if (workspaceFolders && workspaceFolders.length > 0) {
        for (const folder of workspaceFolders) {
          await WorkspaceDetectorService.detectAndRegisterWorkspace(folder.uri.fsPath)
            .catch((error) => {
              console.error('Failed to detect workspace operator project:', error);
            });
        }
      }
    };

    (vscode.workspace.onDidChangeWorkspaceFolders as jest.Mock)(handler);
  }

  async function fireSwitch(folder: string): Promise<void> {
    (vscode.workspace as { workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined })
      .workspaceFolders = [{ uri: { fsPath: folder } }];

    expect(switchHandler)
      .toBeDefined();
    await switchHandler!();
  }

  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@plugin/domain/plugins')
      .registerOperatorPlugins();
  });

  beforeEach(() => {
    rootA = fs.mkdtempSync(path.join(os.tmpdir(), 'opdevtools-switch-a-'));
    rootB = fs.mkdtempSync(path.join(os.tmpdir(), 'opdevtools-switch-b-'));
    seedRoot(rootA, 'triton', 'op_a');
    seedRoot(rootB, 'pyasc', 'op_b');

    ProjectManager.getInstance()
      .resetCachedProject();
    (vscode.workspace as { workspaceFolders: Array<{ uri: { fsPath: string } }> | undefined })
      .workspaceFolders = [{ uri: { fsPath: rootA } }];

    wireVscode();
    registerExtensionHandler();
  });

  afterEach(() => {
    delete (vscode.workspace as unknown as Record<string, unknown>).onDidChangeWorkspaceFolders;
    switchHandler = undefined;
    fs.rmSync(rootA, {
      recursive: true,
      force: true,
    });
    fs.rmSync(rootB, {
      recursive: true,
      force: true,
    });
  });

  it('switch A→B: cached project context is reset and the project type is re-read from the new root', async () => {
    // Simulate an active project context in workspace A.
    ProjectManager.getInstance()
      .setProjectContext(rootA, 'proj_a');

    expect(ProjectManager.getInstance()
      .projectPath)
      .toBe(rootA);
    // Pre-switch reads resolve from A.
    expect(await homeMethods.getProjectType())
      .toMatchObject({ projectType: 'triton' });

    await fireSwitch(rootB);

    // The stale cached path is discarded; the getter then falls back to the
    // live workspace root, so projectPath resolves from B — never from A.
    expect(ProjectManager.getInstance()
      .projectPath)
      .toBe(rootB);
    // Post-switch reads resolve from the NEW root, never from A.
    expect(await homeMethods.getProjectType())
      .toMatchObject({ projectType: 'pyasc' });

    const opRecordB = resolveOpRecord(rootB, 'op_b');

    expect(opRecordB?.op_path)
      .toBe(path.join(rootB, 'op_b'));
    expect(opRecordB?.op_type)
      .toBe('pyasc');
  });

  it('guard: a primary folder still matching the cached path keeps the cached context (no reset)', async () => {
    ProjectManager.getInstance()
      .setProjectContext(rootA, 'proj_a');

    await fireSwitch(rootA);

    // primary === cached path → the reset guard must NOT fire.
    expect(ProjectManager.getInstance()
      .projectPath)
      .toBe(rootA);
    expect(await homeMethods.getProjectType())
      .toMatchObject({ projectType: 'triton' });
  });

  it('old workspace cache does not leak into the new root', async () => {
    ProjectManager.getInstance()
      .setProjectContext(rootA, 'proj_a');

    await fireSwitch(rootB);

    // B's cache on disk: only the B key, only B-rooted operator paths.
    const cacheB = JSON.parse(fs.readFileSync(path.join(rootB, '.vscode', 'cache.json'), 'utf8')) as {
      folders: Record<string, { opsList: Array<{ name: string;
        path: string }> }>;
    };

    expect(Object.keys(cacheB.folders))
      .toEqual([normalizeProjectPath(rootB)]);
    expect(cacheB.folders[normalizeProjectPath(rootB)].opsList[0].path)
      .toBe(path.join(rootB, 'op_b'));

    // A's cache is untouched by the switch.
    const cacheA = JSON.parse(fs.readFileSync(path.join(rootA, '.vscode', 'cache.json'), 'utf8')) as {
      folders: Record<string, { opsList: Array<{ name: string;
        path: string }> }>;
    };

    expect(cacheA.folders[normalizeProjectPath(rootA)].opsList[0].path)
      .toBe(path.join(rootA, 'op_a'));

    // Operator resolution from B never reaches A's operator: the stale name
    // falls back to the B root itself instead of A's scanned entry.
    expect(readWorkspaceCache(rootB).folders?.[normalizeProjectPath(rootA)])
      .toBeUndefined();
    expect(resolveOpRecord(rootB, 'op_a')?.op_path)
      .toBe(rootB);
  });
});
