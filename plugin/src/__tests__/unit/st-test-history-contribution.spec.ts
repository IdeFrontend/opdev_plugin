/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  CONTEXT_PREFIX,
  TREE_VIEW_ST_TEST_HISTORY,
  VIEW_CONTAINER_ID,
} from '@shared/flavor';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

type ViewContribution = {
  id?: string;
  name?: string;
  when?: string;
};

type MenuContribution = {
  command?: string;
  when?: string;
};

describe('ST test history view contribution', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
    contributes: {
      menus: Record<string, MenuContribution[] | undefined>;
      views: Record<string, ViewContribution[]>;
    };
  };

  it('contributes the localized native view in the active flavor sidebar', () => {
    const views = manifest.contributes.views[VIEW_CONTAINER_ID];

    expect(views.find((entry) => entry.id === TREE_VIEW_ST_TEST_HISTORY))
      .toEqual({
        id: TREE_VIEW_ST_TEST_HISTORY,
        name: '%view.stTestHistoryTree.name%',
        when: `${CONTEXT_PREFIX}.showStTestHistory`,
      });
  });

  it('does not contribute expand or collapse title actions for the native history view', () => {
    const stHistoryTitleItems = (manifest.contributes.menus['view/title'] ?? [])
      .filter((entry) => entry.when?.includes(`view == ${TREE_VIEW_ST_TEST_HISTORY}`));

    expect(stHistoryTitleItems)
      .toEqual([]);
  });

  it('creates the native history view without the built-in collapse-all action', () => {
    const extensionSource = fs.readFileSync(path.join(REPO_ROOT, 'plugin/src/extension.ts'), 'utf8');

    expect(extensionSource)
      .toMatch(/createTreeView\(TREE_VIEW_ST_TEST_HISTORY[\s\S]*?showCollapseAll:\s*false/u);
  });
});
