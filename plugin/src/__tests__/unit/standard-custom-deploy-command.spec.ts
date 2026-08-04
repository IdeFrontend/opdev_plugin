jest.mock('@plugin/domain/services/configuration', () => ({
  getConfigById: jest.fn(),
  getConfig: jest.fn(),
}));

jest.mock('@plugin/domain', () => ({ getProjectById: jest.fn() }));

jest.mock('@plugin/domain/services/ops', () => ({ getOpByProjectIdAndOpName: jest.fn() }));

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    getRuntimeConfigById: jest.fn(),
    readBuildOpDeployTargetFromWorkspace: jest.fn(),
  },
}));

import { getConfig } from '@plugin/domain/services/configuration';
import { getProjectById } from '@plugin/domain';
import { getOpByProjectIdAndOpName } from '@plugin/domain/services/ops';
import { ConfigService } from '@plugin/service/config-service';
import { getStandardCustomDeployCommand } from '@plugin/domain/services/command';

describe('getStandardCustomDeployCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getConfig as jest.Mock).mockReturnValue([]);
  });

  it('defaults to build_out/*.run and probes --force support when target_file is not a .run package', () => {
    (ConfigService.getRuntimeConfigById as jest.Mock).mockReturnValue({
      id: 1,
      project_id: 10,
      op: 'add',
      config_type: 'build_op',
      target_file: 'build/add_custom',
      user_options: {
        script: './build.sh --pkg',
        target_file: 'build/add_custom',
      },
    });
    (getProjectById as jest.Mock).mockReturnValue({
      id: 10,
      project_path: '/repo',
      ascend_env_script: '/cann/setenv.bash',
    });
    (getOpByProjectIdAndOpName as jest.Mock).mockReturnValue({
      op_name: 'add',
      op_type: 'cann',
      op_path: '/repo/experimental/add',
    });

    const command = getStandardCustomDeployCommand(1);

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

  it('uses build_op target_file and probes --force support for its .run package', () => {
    (ConfigService.getRuntimeConfigById as jest.Mock).mockReturnValue({
      id: 2,
      project_id: 10,
      op: 'add',
      config_type: 'build_op',
      target_file: 'build_out/*.run',
      user_options: {
        script: './build.sh --pkg',
        target_file: 'build_out/*.run',
      },
    });
    (getProjectById as jest.Mock).mockReturnValue({
      id: 10,
      project_path: '/repo',
      ascend_env_script: '/cann/setenv.bash',
    });
    (getOpByProjectIdAndOpName as jest.Mock).mockReturnValue({
      op_name: 'add',
      op_type: 'cann',
      op_path: '/repo/experimental/add',
    });

    const command = getStandardCustomDeployCommand(2);

    expect(command)
      .toContain('RUN_FILE=$(find build_out/*.run)');
    expect(command)
      .toContain('"$RUN_FILE" --help');
    expect(command)
      .toContain('"$RUN_FILE" --force');
  });
});
