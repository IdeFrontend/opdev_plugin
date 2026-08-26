jest.mock(
  'vscode',
  () => ({
    env: { uriScheme: 'vscode' },
    workspace: {
      workspaceFolders: [],
      getConfiguration: jest.fn(() => ({
        inspect: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
      })),
    },
  }),
  { virtual: true },
);

jest.mock('@plugin/domain/utils/build-utils', () => ({ checkBuildShHasBishengConfig: jest.fn(() => false) }));

import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';
import type { OpRecord } from '@plugin/domain/models/op-record';
import type { BuildOpConfig } from '@plugin/service/config-service';

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
      daoKey: 'cpuDebugScript',
      script: scripts.cpuDebugScript,
    },
    {
      field: 'npu_debug_script',
      daoKey: 'npuDebugScript',
      script: scripts.npuDebugScript,
    },
  ] as const;

  for (const {
    field, daoKey, script,
  } of debugScripts) {
    expect(script).not.toContain('--build-type');

    const config: BuildOpConfig = {
      script: '',
      cpuDebugScript: '',
      npuDebugScript: '',
      targetFile: null,
      [daoKey]: script,
    };
    const command = plugin.commandStrategy.buildOpCommand({
      config,
      sourceCannCmd: '',
      cdCmd: 'cd /repo',
      scriptField: field,
      operatorNames: directOp.op_name,
      op: directOp.op_name,
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

describe('AscendPlugin bisheng build.sh variants', () => {
  const plugin = new AscendPlugin();
  const op = {
    id: 1,
    project_id: 1,
    op_name: 'add',
    op_type: 'ascend',
    op_path: '/repo/math/add',
  } as OpRecord;
  const buildUtils = jest.requireMock('@plugin/domain/utils/build-utils') as {
    checkBuildShHasBishengConfig: jest.Mock;
  };

  afterEach(() => {
    buildUtils.checkBuildShHasBishengConfig.mockReturnValue(false);
  });

  it('switches the run-mode scripts to bisheng flags when build.sh exposes bisheng config', () => {
    buildUtils.checkBuildShHasBishengConfig.mockReturnValue(true);

    const scripts = plugin.getInitialConfigScripts(op, '/repo');

    expect(scripts.simulateScript)
      .toContain('--bisheng_flags=ccec_g');
    expect(scripts.onBoardScript)
      .toContain('--bisheng_flags=ccec_g');
    expect(scripts.cpuDebugScript)
      .toContain('--bisheng_flags=ccec_g');
    expect(scripts.npuDebugScript)
      .toContain('--bisheng_flags=ccec_O0,ccec_g');
    // The scripts without a bisheng variant stay neutral.
    expect(scripts.buildScript)
      .not.toContain('bisheng');
    expect(scripts.sanitizerScript)
      .not.toContain('bisheng');
    expect(scripts.utTestScript)
      .not.toContain('bisheng');
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

  it('the default CPU debug script carries --cpudebug without a simulator suffix', () => {
    const scripts = plugin.getInitialConfigScripts(op, '/repo');

    expect(scripts.cpuDebugScript)
      .toMatch(/--cpudebug\b/);
    expect(scripts.cpuDebugScript)
      .not.toMatch(/--simulator \{simulator_type\}/);
  });
});
