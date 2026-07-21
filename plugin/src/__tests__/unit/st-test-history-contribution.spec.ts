import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const ST_TEST_HISTORY_VIEW = 'opdevtoolsStTestHistoryTree';

type ViewContribution = {
  id?: string;
  name?: string;
  when?: string;
};

describe('ST test history view contribution', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
    contributes: {
      views: Record<string, ViewContribution[]>;
    };
  };

  it('contributes the localized native view only in the standard-custom context', () => {
    const views = manifest.contributes.views['mindstudio-opssuite-vscode-plugin'];

    expect(views.find((entry) => entry.id === ST_TEST_HISTORY_VIEW))
      .toEqual({
        id: ST_TEST_HISTORY_VIEW,
        name: '%view.stTestHistoryTree.name%',
        when: 'opDevtools.showStTestHistory',
      });
  });
});
