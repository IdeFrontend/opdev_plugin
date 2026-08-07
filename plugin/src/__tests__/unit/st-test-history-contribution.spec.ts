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
