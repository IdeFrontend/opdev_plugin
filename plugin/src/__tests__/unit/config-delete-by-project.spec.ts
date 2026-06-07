import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('@plugin/domain/models/config', () => {
  const defaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-delete-default-'));
  (globalThis as Record<string, string>).__cfgUserDataDir = defaultDir;
  (globalThis as Record<string, string>).__cfgWorkspaceDataDir = path.join(defaultDir, 'workspace-op-devtools');

  return {
    __esModule: true,
    default: {
      get user_data_dir() {
        return (globalThis as Record<string, string>).__cfgUserDataDir;
      },
      get workspace_data_dir() {
        return (globalThis as Record<string, string>).__cfgWorkspaceDataDir;
      },
    },
  };
});

import {
  _resetConfigsForTest,
  deleteConfigsByProjectId,
  deleteLegacyWorkspaceConfigsByProjectId,
  postConfig,
} from '@plugin/domain/models/config-model';
import {
  _resetOpsForTest,
  deleteOpsByProjectId,
} from '@plugin/domain/models/model';
import { _resetProjectsForTest } from '@plugin/domain/models/project-model';

describe('project-scoped delete helpers', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-delete-'));
    (globalThis as Record<string, string>).__cfgUserDataDir = path.join(tmpRoot, 'user-data');
    (globalThis as Record<string, string>).__cfgWorkspaceDataDir = path.join(tmpRoot, 'workspace-op-devtools');
    _resetConfigsForTest();
    _resetOpsForTest();
    _resetProjectsForTest();
  });

  afterEach(() => {
    _resetConfigsForTest();
    _resetOpsForTest();
    _resetProjectsForTest();
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('deleteConfigsByProjectId removes only matching project rows', async () => {
    await postConfig('build_op', [{
      project_id: 1,
      user_options: {
        config_name: 'build_op',
        op: 'op1',
        script: 'bash build.sh',
      },
    }]);
    await postConfig('build_op', [{
      project_id: 2,
      user_options: {
        config_name: 'build_op',
        op: 'op2',
        script: 'bash build.sh',
      },
    }]);

    deleteConfigsByProjectId(1);

    const storePath = path.join(tmpRoot, 'user-data', 'data', 'configs.json');
    const store = JSON.parse(fs.readFileSync(storePath, 'utf8')) as {
      configs: Array<{ project_id: number }>;
    };
    expect(store.configs).toHaveLength(1);
    expect(store.configs[0].project_id).toBe(2);
  });

  it('deleteLegacyWorkspaceConfigsByProjectId removes rows from old workspace configs file', async () => {
    const legacyDir = path.join(tmpRoot, 'workspace', '.vscode', 'op_devtools', 'data');
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacyFile = path.join(legacyDir, 'configs.json');
    fs.writeFileSync(
      legacyFile,
      `${JSON.stringify({
        lastId: 2,
        configs: [
          {
            id: 1,
            project_id: 1,
            config_type: 'build_op',
            op: 'a',
          },
          {
            id: 2,
            project_id: 2,
            config_type: 'build_op',
            op: 'b',
          },
        ],
      }, null, 2)}\n`,
      'utf8',
    );

    deleteLegacyWorkspaceConfigsByProjectId(1, path.join(tmpRoot, 'workspace'));

    const parsed = JSON.parse(fs.readFileSync(legacyFile, 'utf8')) as {
      configs: Array<{ project_id: number }>;
    };
    expect(parsed.configs).toHaveLength(1);
    expect(parsed.configs[0].project_id).toBe(2);
  });

  it('deleteOpsByProjectId removes only matching project rows', async () => {
    const opsFile = path.join(tmpRoot, 'user-data', 'data', 'ops.json');
    fs.mkdirSync(path.dirname(opsFile), { recursive: true });
    fs.writeFileSync(
      opsFile,
      `${JSON.stringify({
        lastId: 2,
        ops: [
          {
            id: 1,
            project_id: 1,
            op_name: 'a',
            op_type: 'ascend',
            op_path: '/a',
          },
          {
            id: 2,
            project_id: 2,
            op_name: 'b',
            op_type: 'ascend',
            op_path: '/b',
          },
        ],
      }, null, 2)}\n`,
      'utf8',
    );

    deleteOpsByProjectId(1);

    const store = JSON.parse(fs.readFileSync(opsFile, 'utf8')) as {
      ops: Array<{ project_id: number }>;
    };
    expect(store.ops).toHaveLength(1);
    expect(store.ops[0].project_id).toBe(2);
  });
});
