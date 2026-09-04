import path from 'node:path';

import { AbstractOperatorPlugin } from '@plugin/domain/plugins/abstract-operator-plugin';
import type { CommandStrategy } from '@plugin/domain/services/command-strategy/types';
import type { OperatorOpType } from '@shared/operator-op-type';
import type { OpRecord } from '@plugin/domain/models/op-record';

class TestPlugin extends AbstractOperatorPlugin {
  readonly opType: OperatorOpType = 'cann';
  readonly displayName = 'Test';
  readonly commandStrategy: CommandStrategy = {} as CommandStrategy;
}

describe('AbstractOperatorPlugin defaults', () => {
  const plugin = new TestPlugin();
  const op = {
    id: 1,
    project_id: 1,
    op_name: 'add',
    op_type: 'cann',
    op_path: path.join('repo', 'math', 'add'),
  } as OpRecord;

  it('exposes the default build behavior for cann-like operators', () => {
    expect(plugin.buildBehavior)
      .toEqual({
        requiresBuildBeforeAnalysis: true,
        requiresActiveFileCheck: false,
        supportsSanitizer: true,
        supportsSimulate: true,
        supportsOnBoard: true,
        supportsCpuDebug: true,
        supportsNpuDebug: true,
        supportsNpuPythonDebug: false,
      });
  });

  it('returns the build/<op_name> default paths', () => {
    const buildPath = path.join(op.op_path, 'build', op.op_name);

    expect(plugin.getDefaultPaths(op))
      .toEqual({
        opScriptPath:      path.join(op.op_path, 'build.sh'),
        exampleScriptPath: path.join(op.op_path, 'build.sh'),
        targetDir:         path.resolve(op.op_path, 'build_out'),
        targetOpFile:      buildPath,
        targetExampleFile: buildPath,
      });
  });

  it('returns plain bash build.sh invocations for every config script', () => {
    const script = path.join(op.op_path, 'build.sh');

    expect(plugin.getInitialConfigScripts(op, '/workspace'))
      .toEqual({
        buildScript:     `bash ${script}`,
        exampleScript:   `bash ${script}`,
        simulateScript:  `bash ${script} --simulator`,
        onBoardScript:   `bash ${script} --onboard`,
        sanitizerScript: `bash ${script} --mssanitizer`,
        cpuDebugScript:  `bash ${script} --cpudebug`,
        npuDebugScript:  `bash ${script} --debug`,
        utTestScript:    `bash ${script} -u`,
      });
  });

  it('exports no spawn environment keys and patches nothing by default', () => {
    expect(plugin.getSpawnEnvExportKeys())
      .toEqual([]);

    expect(() => plugin.patchGeneratedProject(op.op_path, { soc_version: 'ascend910b' }))
      .not.toThrow();
  });

  it('throws when a plugin does not implement createProjectGenerator', () => {
    expect(() => plugin.createProjectGenerator(
      { op_path: op.op_path },
      { project_path: op.op_path },
      '/extension',
    ))
      .toThrow(`createProjectGenerator not implemented for opType '${plugin.opType}'`);
  });
});
