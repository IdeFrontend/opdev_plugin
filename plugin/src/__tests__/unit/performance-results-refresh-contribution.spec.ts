import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const REFRESH_COMMAND = 'huawei-op-devtools.flashPerformanceRunData';
const PERFORMANCE_RESULTS_VIEW = 'opdevtoolsPerformanceResultsTree';

type CommandContribution = {
  command?: string;
  icon?: string;
};

type MenuContribution = {
  command?: string;
  when?: string;
  group?: string;
};

describe('performance results refresh contribution', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
    contributes: {
      commands: CommandContribution[];
      menus: { 'view/title': MenuContribution[] };
    };
  };

  it('shows the existing refresh command in the Performance Results title bar', () => {
    const command = manifest.contributes.commands.find((entry) => entry.command === REFRESH_COMMAND);
    const titleItem = manifest.contributes.menus['view/title'].find((entry) => entry.command === REFRESH_COMMAND);

    expect(command?.icon)
      .toBe('$(refresh)');
    expect(titleItem)
      .toEqual({
        command: REFRESH_COMMAND,
        when: `view == ${PERFORMANCE_RESULTS_VIEW}`,
        group: 'navigation@4',
      });
  });
});
