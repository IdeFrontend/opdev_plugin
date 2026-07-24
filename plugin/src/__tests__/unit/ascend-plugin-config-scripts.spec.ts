jest.mock(
  'vscode',
  () => ({
    env: { uriScheme: 'vscode' },
    workspace: { workspaceFolders: [] },
  }),
  { virtual: true },
);

jest.mock('@plugin/domain/utils/build-utils', () => ({ checkBuildShHasBishengConfig: jest.fn(() => false) }));

import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import type { OpRecord } from '@plugin/domain/models/model';
import type { ConfigRecord } from '@plugin/domain/models/types';

function expectNeutralDefaultsAndRuntimeDebug(
  plugin: AscendPlugin | CannPlugin,
  op: OpRecord,
): void {
  const directOp = {
    ...op,
    op_path: '.',
  } as OpRecord;
  const scripts = plugin.getInitialConfigScripts(directOp, '.');
  const debugScripts = [
    {
      field: 'cpu_debug_script',
      script: scripts.cpuDebugScript,
    },
    {
      field: 'npu_debug_script',
      script: scripts.npuDebugScript,
    },
  ] as const;

  for (const {
    field, script,
  } of debugScripts) {
    expect(script).not.toContain('--build-type');

    const command = plugin.commandStrategy.buildOpCommand({
      config: {
        id: 1,
        project_id: 1,
        op: directOp.op_name,
        config_type: 'build_op',
        user_options: { [field]: script },
      } as ConfigRecord,
      operator: directOp,
      sourceCannCmd: '',
      cdCmd: 'cd /repo',
      scriptField: field,
      operatorNames: directOp.op_name,
    });

    expect(command.match(/--build-type=Debug/g))
      .toHaveLength(1);
  }
}

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
      expect(script)
        .toContain('--ops={operatorNames}');
    }

    expect(scripts.exampleScript).not.toContain('--ops={operatorNames}');
  });

  it('keeps generated defaults neutral and applies Debug at runtime', () => {
    expectNeutralDefaultsAndRuntimeDebug(plugin, op);
  });

  it('puts --cpudebug before --simulator in the default CPU debug script', () => {
    const scripts = plugin.getInitialConfigScripts(op, '/repo');

    expect(scripts.cpuDebugScript)
      .toMatch(/--cpudebug\b.*--simulator \{simulator_type\}/);
  });
});

describe('CannPlugin getInitialConfigScripts', () => {
  const plugin = new CannPlugin();
  const op = {
    id: 1,
    project_id: 1,
    op_name: 'add',
    op_type: 'cann',
    op_path: '/repo/math/add',
  } as OpRecord;

  it('keeps generated defaults neutral and applies Debug at runtime', () => {
    expectNeutralDefaultsAndRuntimeDebug(plugin, op);
  });

  it('puts --cpudebug before --simulator in the default CPU debug script', () => {
    const scripts = plugin.getInitialConfigScripts(op, '/repo');

    expect(scripts.cpuDebugScript)
      .toMatch(/--cpudebug\b.*--simulator \{simulator_type\}/);
  });
});
