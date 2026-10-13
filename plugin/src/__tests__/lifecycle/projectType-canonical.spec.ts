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
 * Lifecycle test: opening an imported workspace persists the
 * CANONICAL per-type `op-devtools.projectType` (the value the persisted
 * projects.json row carries) — the importer carries it through and openProject
 * never reclassifies it to 'standard-custom'.
 *
 * The per-type table is the canonical stored value (the projects.json row set
 * for each type).
 *
 * The assertion reads the REAL settings.json from disk (the harness snapshot
 * is normalized and not JSON-parseable).
 */
import * as fs from 'fs';
import * as path from 'path';

import { OPEN_CASES } from './fixtures';
import {
  requireFresh,
  runLifecycleCase,
  setupOpenCase,
} from './helpers';

/** Canonical per-type project_type values (persisted projects.json). */
const CANONICAL_TYPES: Record<string, string> = {
  cann: 'cann',
  ascend: 'ascend',
  pyasc: 'pyasc',
  triton: 'triton',
  torch_library: 'cann',
  standard_custom: 'ascend',
};

function projectDirFor(root: string, caseId: string): string {
  return path.join(root, caseId === 'standard_custom' ? 'op_collection' : 'op_project');
}

describe('open flow persists the canonical per-type projectType', () => {
  it.each(Object.keys(CANONICAL_TYPES))(
    'open %s leaves op-devtools.projectType = canonical "%s"',
    async (caseId) => {
      const expectedType = CANONICAL_TYPES[caseId];
      let projectDir: string | undefined;
      let settings: Record<string, unknown> | undefined;

      await runLifecycleCase({
        setup: (root) => setupOpenCase(root, caseId),
        workspaceFolder: (root) => projectDirFor(root, caseId),
        run: async (ctx) => {
          projectDir = projectDirFor(ctx.root, caseId);

          // The open flow: one-time import + workspace registration +
          // welcomeMethods.openProject (mirrors flows.runOpenFlow).
          const { importLegacyWorkspaceState } = requireFresh<{
            importLegacyWorkspaceState: (currentVersion: string, opts?: { targetProjectPath?: string })=> Promise<void>
          }>('@plugin/helpers/legacy-state-importer');
          const { WorkspaceDetectorService } = requireFresh<{
            WorkspaceDetectorService: {
              detectAndRegisterWorkspace: (workspacePath: string)=> Promise<void>
            }
          }>('@plugin/service/workspace-detector-service');
          const { welcomeMethods } = requireFresh<{
            welcomeMethods: {
              openProject: (params: { projectPath: string }, isFromSystem?: boolean)=> Promise<void>
            }
          }>('@plugin/controller/welcome-controller');

          await importLegacyWorkspaceState('1.1.78', { targetProjectPath: projectDir });
          await WorkspaceDetectorService.detectAndRegisterWorkspace(projectDir);
          await welcomeMethods.openProject({ projectPath: projectDir }, true);

          settings = JSON.parse(fs.readFileSync(path.join(projectDir, '.vscode', 'settings.json'), 'utf8')) as Record<string, unknown>;
        },
      });

      // Canonical per-type value: the open flow must NOT reclassify
      // imported workspaces to 'standard-custom', and the view-id
      // 'ascend' stays 'ascend'.
      expect(settings?.['op-devtools.projectType'])
        .toBe(expectedType);
    },
  );
});
