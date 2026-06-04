jest.mock(
  'vscode',
  () => ({
    workspace: { workspaceFolders: [] },
  }),
  { virtual: true },
);

jest.mock('@plugin/domain/utils/build-utils', () => ({
  checkBuildShHasBishengConfig: jest.fn(() => false),
}));

jest.mock('@plugin/domain/services/command-strategy/ascend-strategy', () => ({
  AscendCommandStrategy: class AscendCommandStrategy {},
}));

import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import type { OpRecord } from '@plugin/domain/models/model';

describe('AscendPlugin getInitialConfigScripts', () => {
  const plugin = new AscendPlugin();
  const op = {
    id: 1,
    project_id: 1,
    op_name: 'add',
    op_type: 'ascend',
    op_path: '/repo/math/add',
  } as OpRecord;

  it('includes --ops={operatorNames} in all compile-related default scripts', () => {
    const scripts = plugin.getInitialConfigScripts(op, '/repo');

    const compileScripts = [
      scripts.buildScript,
      scripts.simulateScript,
      scripts.onBoardScript,
      scripts.sanitizerScript,
      scripts.cpuDebugScript,
      scripts.npuDebugScript,
      scripts.utTestScript,
    ];

    for (const script of compileScripts) {
      expect(script).toContain('--ops={operatorNames}');
    }

    expect(scripts.exampleScript).not.toContain('--ops={operatorNames}');
  });
});
