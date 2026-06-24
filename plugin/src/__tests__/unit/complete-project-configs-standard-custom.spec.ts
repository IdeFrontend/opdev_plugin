import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('@plugin/domain/models/config', () => {
  const defaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-cpc-default-'));

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

import { _resetConfigsForTest } from '@plugin/domain/models/config-model';
import {
  _resetOpsForTest,
  completeProjectConfigs,
} from '@plugin/domain/models/model';
import {
  _resetProjectsForTest,
  createProject,
} from '@plugin/domain/models/project-model';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { AscendPlugin } from '@plugin/domain/plugins/ascend.plugin';
import { CannPlugin } from '@plugin/domain/plugins/cann.plugin';

type StoredConfig = {
  project_id: number;
  config_type: string;
  op: string;
};

describe('completeProjectConfigs for scanned STANDARD_CUSTOM repos', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-cpc-'));
    (globalThis as Record<string, string>).__cfgUserDataDir = path.join(tmpRoot, 'user-data');
    (globalThis as Record<string, string>).__cfgWorkspaceDataDir = path.join(tmpRoot, 'workspace-op-devtools');
    _resetConfigsForTest();
    _resetOpsForTest();
    _resetProjectsForTest();
    OperatorPluginRegistry._reset();
    OperatorPluginRegistry.registerOpPlugin(new CannPlugin());
    OperatorPluginRegistry.registerOpPlugin(new AscendPlugin());
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

  function readConfigs(): StoredConfig[] {
    const storePath = path.join(tmpRoot, 'user-data', 'data', 'configs.json');

    if (!fs.existsSync(storePath)) {
      return [];
    }

    return (JSON.parse(fs.readFileSync(storePath, 'utf8')) as { configs: StoredConfig[] }).configs;
  }

  it('creates a root build_op config when operators exist only in ops_list (empty ops store)', async () => {
    const projectId = Number(await createProject({
      project_name: 'ops-math',
      project_path: '/repo/ops-math',
      project_type: 'ascend',
      ops_list: [
        {
          name: 'add',
          path: '/repo/ops-math/math/add',
        },
        {
          name: 'sub',
          path: '/repo/ops-math/math/sub',
        },
      ],
    }));

    await completeProjectConfigs(projectId);

    const buildOps = readConfigs()
      .filter((c) => c.project_id === projectId && c.config_type === 'build_op');

    expect(buildOps)
      .toHaveLength(1);
    expect(buildOps[0].op)
      .toBe('ops-math');
  });

  it('defaults op_type to ascend when the project record predates project_type (race scenario)', async () => {
    const projectId = Number(await createProject({
      project_name: 'ops-math',
      project_path: '/repo/ops-math',
      ops_list: [
        {
          name: 'add',
          path: '/repo/ops-math/math/add',
        },
      ],
    }));

    await completeProjectConfigs(projectId);

    const buildOps = readConfigs()
      .filter((c) => c.project_id === projectId && c.config_type === 'build_op');

    expect(buildOps)
      .toHaveLength(1);
  });

  it('does not create any build_op config for a project with no operators', async () => {
    const projectId = Number(await createProject({
      project_name: 'empty-proj',
      project_path: '/repo/empty',
      project_type: 'ascend',
    }));

    await completeProjectConfigs(projectId);

    expect(readConfigs()
      .filter((c) => c.config_type === 'build_op'))
      .toHaveLength(0);
  });

  it('uses the ops store (not a synthesized root) when the project has registered operators', async () => {
    const projectId = Number(await createProject({
      project_name: 'ops-math',
      project_path: '/repo/ops-math',
      project_type: 'ascend',
      ops_list: [
        {
          name: 'add',
          path: '/repo/ops-math/math/add',
        },
      ],
    }));

    const opsFile = path.join(tmpRoot, 'user-data', 'data', 'ops.json');

    fs.mkdirSync(path.dirname(opsFile), { recursive: true });
    fs.writeFileSync(
      opsFile,
      `${JSON.stringify({
        lastId: 1,
        ops: [
          {
            id: 1,
            project_id: projectId,
            op_name: 'add',
            op_type: 'ascend',
            op_path: '/repo/ops-math/math/add',
          },
        ],
      }, null, 2)}\n`,
      'utf8',
    );

    await completeProjectConfigs(projectId);

    const buildOps = readConfigs()
      .filter((c) => c.project_id === projectId && c.config_type === 'build_op');

    expect(buildOps)
      .toHaveLength(1);
    expect(buildOps[0].op)
      .toBe('add');
  });
});
