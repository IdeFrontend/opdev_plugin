import {
  _resetConfigsForTest,
  getConfigById,
  postConfig,
} from '@plugin/domain/models/config-model';

describe('config-model.postConfig', () => {
  beforeEach(() => {
    _resetConfigsForTest();
  });

  it('preserves script and target_file columns on update (does not mirror user_options)', async () => {
    const [created] = await postConfig('build_op', [{
      project_id: 1,
      user_options: {
        config_name: 'build_op',
        op: 'myop',
        script: 'bash build.sh',
        target_file: 'python run.py',
      },
    }]) as Array<{ config_id: number; status: string }>;

    expect(created.status).toBe('success');
    const configId = created.config_id;

    await postConfig('build_op', [{
      config_id: configId,
      project_id: 1,
      user_options: {
        config_name: 'build_op',
        op: 'myop',
        script: 'stale-from-user-options',
        target_file: 'stale-target',
        fileMapList: [{ filePath: '/tmp/report', reportTime: 1 }],
      },
    }]);

    const row = getConfigById(configId) as {
      script: string;
      target_file: string | null;
      user_options: Record<string, unknown>;
    };
    expect(row.script).toBe('bash build.sh');
    expect(row.target_file).toBe('python run.py');
    expect(row.user_options.script).toBe('stale-from-user-options');
    expect(row.user_options.fileMapList).toHaveLength(1);
  });
});
