jest.mock('@plugin/domain/models/project-model', () => ({ getProjectByPath: jest.fn() }));

jest.mock('@plugin/domain/models/op-record', () => ({
  ...jest.requireActual('@plugin/domain/models/op-record'),
  resolveOpRecord: jest.fn(),
}));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    getBuildOpConfig: jest.fn(),
    readBuildOpDeployTargetFromWorkspace: jest.fn(),
  },
}));

import { getProjectByPath } from '@plugin/domain/models/project-model';
import { resolveOpRecord } from '@plugin/domain/models/op-record';
import { ConfigService } from '@plugin/service/config-service';
import type { BuildOpConfig } from '@plugin/service/config-service';
import {
  getStandardCustomDeployCommand,
  resolveBuildOpBaseContext,
} from '@plugin/domain/services/command';

const CONFIG: BuildOpConfig = {
  script: './build.sh --pkg',
  cpuDebugScript: '',
  npuDebugScript: '',
  targetFile: 'build/add_custom',
};

describe('getStandardCustomDeployCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getProjectByPath as jest.Mock).mockReturnValue({
      id: 10,
      project_path: '/repo',
      ascend_env_script: '/cann/setenv.bash',
    });
    (resolveOpRecord as jest.Mock).mockReturnValue({
      op_name: 'add',
      op_type: 'ascend',
      op_path: '/repo/experimental/add',
    });
    (ConfigService.getBuildOpConfig as jest.Mock).mockReturnValue(CONFIG);
  });

  it('defaults to build_out/*.run and probes --force support when the deploy target is not a .run package', () => {
    (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue(undefined);

    const command = getStandardCustomDeployCommand(resolveBuildOpBaseContext('/repo', 'add'));

    expect(command)
      .toContain('. /cann/setenv.bash');
    expect(command)
      .toContain('cd /repo/experimental/add');
    expect(command)
      .toContain('RUN_FILE=$(find build_out/*.run)');
    expect(command)
      .toContain('"$RUN_FILE" --help');
    expect(command)
      .toContain('"$RUN_FILE" --force');
  });

  it('uses the workspace deploy target when it is a .run package and probes --force support', () => {
    (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue('build_out/*.run');

    const command = getStandardCustomDeployCommand(resolveBuildOpBaseContext('/repo', 'add'));

    expect(command)
      .toContain('RUN_FILE=$(find build_out/*.run)');
    expect(command)
      .toContain('"$RUN_FILE" --help');
    expect(command)
      .toContain('"$RUN_FILE" --force');
  });
});
