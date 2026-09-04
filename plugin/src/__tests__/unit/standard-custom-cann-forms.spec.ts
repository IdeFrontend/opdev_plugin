jest.mock('@plugin/domain/models/project-model', () => {
  const actual = jest.requireActual('@plugin/domain/models/project-model') as Record<string, unknown>;

  return {
    ...actual,
    getProjectByPath: jest.fn(),
  };
});

jest.mock('@plugin/service/config-service', () => ({
  ConfigService: {
    getBuildOpConfig: jest.fn(),
    readBuildOpDeployTargetFromWorkspace: jest.fn(),
    readBuildExampleTargetFromWorkspace: jest.fn(),
  },
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getProjectByPath } from '@plugin/domain/models/project-model';
import { ConfigService } from '@plugin/service/config-service';
import type { BuildOpConfig } from '@plugin/service/config-service';
import {
  getBuildOpCommand,
  getRunCommand,
  resolveBuildOpBaseContext,
} from '@plugin/domain/services/command';
import {
  CACHE_SCHEMA_VERSION,
  FolderScanState,
  getCacheFilePath,
} from '@plugin/helpers/workspace-cache';
import { normalizeProjectPath } from '@plugin/domain/models/project-model';

function buildOpConfig(overrides: Partial<BuildOpConfig> = {}): BuildOpConfig {
  return {
    script: '',
    cpuDebugScript: '',
    npuDebugScript: '',
    targetFile: null,
    ...overrides,
  };
}

describe('standard-custom collections build with the ascend ROOT forms', () => {
  let root: string;
  let add: string;

  beforeEach(() => {
    jest.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'op-devtools-stdcustom-forms-'));
    add = path.join(root, 'math', 'add');

    (getProjectByPath as jest.Mock).mockReturnValue({
      project_type: 'ascend',
      project_path: root,
    });
    (ConfigService.getBuildOpConfig as jest.Mock)
      .mockReturnValue(buildOpConfig({
        script: `bash ${root}/build.sh --pkg --soc={soc_version} --vendor_name=custom --ops={operatorNames}`,
        targetFile: 'build_out/*.run',
      }));
    (ConfigService.readBuildOpDeployTargetFromWorkspace as jest.Mock).mockReturnValue('build_out/*.run');
    (ConfigService.readBuildExampleTargetFromWorkspace as jest.Mock).mockReturnValue('');
  });

  afterEach(() => {
    fs.rmSync(root, {
      recursive: true,
      force: true,
    });
  });

  function writeFolderState(state: FolderScanState): void {
    fs.mkdirSync(path.dirname(getCacheFilePath(root)), { recursive: true });
    fs.writeFileSync(
      getCacheFilePath(root),
      JSON.stringify({
        schemaVersion: CACHE_SCHEMA_VERSION,
        folders: { [normalizeProjectPath(root)]: state },
      }),
      'utf8',
    );
  }

  it('build_op runs the ROOT script with the ascend deploy tail (base root-keyed model)', () => {
    writeFolderState({
      opsMeet: [],
      opsList: [
        {
          name: 'add',
          path: add,
          opType: 'cann',
        },
      ],
      experimentalOpsList: [],
    });

    // A standard-custom collection builds through ONE root operator: the
    // scanned 'add' row (and its opType) never drives the command paths —
    // the root record (op_path = project root, op_type 'ascend') wins, the
    // script is the root build.sh, and the deploy tail applies because the
    // build_op config carries the root targetFile.
    const build = getBuildOpCommand(resolveBuildOpBaseContext(root, 'add'));

    expect(build)
      .toContain(`cd ${root}`);
    expect(build)
      .toContain(`bash ${root}/build.sh --pkg`);
    expect(build)
      .toContain('RUN_FILE=$(find build_out/*.run)');

    const run = getRunCommand(resolveBuildOpBaseContext(root, 'add'));

    expect(run)
      .toContain(`cd ${root}`);
    expect(run)
      .not.toContain('mkdir -p');
    expect(run)
      .toContain('RUN_FILE=$(find build_out/*.run)');
  });
});
