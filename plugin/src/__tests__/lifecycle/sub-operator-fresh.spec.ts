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
 * Lifecycle test: sub-operator creation on a FRESH standard-custom workspace.
 *
 * The workspace root is a real standard-custom collection (build.sh --help
 * advertises --genop — the definitive detector criterion) with NO source
 * stores, NO cache.json, NO workspace settings. The flow must register the
 * collection (cache scan state) on the fly and append the sub-operator into
 * `cache.folders[rootKey].opsList`.
 *
 * The cache.json assertions read the REAL file from disk inside the run
 * callback: the harness snapshot normalizes root paths into `<root>`, which
 * leaves JSON-escaped backslashes dangling (`<root>/\add`) and unparseable.
 */
import * as fs from 'fs';
import * as path from 'path';

import {
  runLifecycleCase,
  requireFresh,
} from './helpers';
import type { CreatedProjectParams } from '@shared/api-types';

describe('sub-operator creation on a fresh standard-custom workspace', () => {
  it('registers the collection in cache.json and appends the operator (no source stores)', async () => {
    let cache: Record<string, unknown> | undefined;
    let rootPath: string | undefined;

    const snapshot = await runLifecycleCase({
      setup: (root) => {
        fs.writeFileSync(
          path.join(root, 'build.sh'),
          '#!/bin/bash\necho "Usage: build.sh [--pkg] [--genop]"\n',
          'utf8',
        );
        fs.writeFileSync(
          path.join(root, 'CMakeLists.txt'),
          'cmake_minimum_required(VERSION 3.16)\nproject(op_collection)\n',
          'utf8',
        );
      },
      run: async (ctx) => {
        rootPath = ctx.root;

        const { welcomeMethods } = requireFresh<{
          welcomeMethods: {
            createdProject: (params: CreatedProjectParams)=> Promise<void>
          }
        }>('@plugin/controller/welcome-controller');

        await welcomeMethods.createdProject({
          projectPath: ctx.root,
          projectName: 'add',
          createOperatorProjectDictoryFileType: 2,
        });

        // Read the real cache before the harness cleans the temp root.
        const cachePath = path.join(ctx.root, '.vscode', 'cache.json');

        if (fs.existsSync(cachePath)) {
          cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as Record<string, unknown>;
        }
      },
    });

    // The source stores are never touched by the fresh flow.
    expect(snapshot.files['data/projects.json'])
      .toBeUndefined();
    expect(snapshot.files['data/configs.json'])
      .toBeUndefined();
    expect(snapshot.files['data/ops.json'])
      .toBeUndefined();

    // The collection scan state exists in the workspace cache and carries
    // the appended sub-operator ("collection is not registered" must not be
    // thrown on a fresh workspace).
    expect(cache)
      .toBeDefined();
    const folders = (cache as Record<string, unknown>).folders as Record<string, {
      opsMeet: unknown[];
      opsList: Array<{ name: string;
        path: string;
        isCompiled?: boolean }>;
      experimentalOpsList: unknown[];
    }>;
    const rootKey = path.normalize(rootPath as string)
      .replace(/\\/g, '/')
      .toLowerCase();

    expect(folders[rootKey])
      .toBeDefined();
    expect(folders[rootKey].opsList)
      .toContainEqual(expect.objectContaining({
        name: 'add',
        path: path.join(rootPath as string, 'add'),
      }));

    // issue #83: 新创建的子算子自动被选中，并去除其它已选算子。
    // selectedOperatorPaths 以 PATHS 形式持久化，与 opsList 中 path 同源。
    const project = (cache as Record<string, unknown>).project as
      | { selectedOperatorPaths?: string[] }
      | undefined;

    expect(project?.selectedOperatorPaths)
      .toEqual([path.join(rootPath as string, 'add')]);
  });

  it('mirrors the registered root type into the workspace projectType setting', async () => {
    const snapshot = await runLifecycleCase({
      setup: (root) => {
        fs.writeFileSync(
          path.join(root, 'build.sh'),
          '#!/bin/bash\necho "Usage: build.sh [--pkg] [--genop]"\n',
          'utf8',
        );
      },
      run: async (ctx) => {
        const { welcomeMethods } = requireFresh<{
          welcomeMethods: {
            createdProject: (params: CreatedProjectParams)=> Promise<void>
          }
        }>('@plugin/controller/welcome-controller');

        await welcomeMethods.createdProject({
          projectPath: ctx.root,
          projectName: 'add',
          createOperatorProjectDictoryFileType: 2,
        });
      },
    });

    // Normalized content: the key and value stay parseable as plain text even
    // though path values inside the file carry `<root>` replacements.
    const settings = snapshot.files['.vscode/settings.json'] as string;

    expect(settings)
      .toBeDefined();
    expect(settings)
      .toContain('"op-devtools.projectType"');
    expect(settings)
      .toContain('ascend');
  });
});
