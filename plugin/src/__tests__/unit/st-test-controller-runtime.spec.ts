jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('vscode', () => ({
  workspace: {
    getWorkspaceFolder: jest.fn(),
    getConfiguration: jest.fn(() => ({ inspect: jest.fn(() => undefined) })),
  },
  Uri: { file: jest.fn((fsPath: string) => ({ fsPath })) },
}));

jest.mock('@plugin/controller/home-controller', () => ({ homeMethods: { getSelectedOperatorEntries: jest.fn() } }));

jest.mock('@plugin/helpers/task-method-dispatch', () => ({ dispatchStTestFromWebview: jest.fn() }));

jest.mock('@plugin/service/config-service', () => ({ ConfigService: { writeOpDevtoolsDottedSettings: jest.fn() } }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import {
  StTestController,
  stTestMethods,
  registerStTestControllerContext,
  registerStTestOptionsPanelCloser,
  ST_TEST_ARGUMENTS_SETTING,
  ST_TEST_SELECTED_MODES_SETTING,
} from '@plugin/controller/st-test-controller';
import { homeMethods } from '@plugin/controller/home-controller';
import { dispatchStTestFromWebview } from '@plugin/helpers/task-method-dispatch';
import { ConfigService } from '@plugin/service/config-service';

const getSelectedOperatorEntries = homeMethods.getSelectedOperatorEntries as jest.Mock;
const getWorkspaceFolder = vscode.workspace.getWorkspaceFolder as jest.Mock;
const getConfiguration = vscode.workspace.getConfiguration as jest.Mock;
const writeOpDevtoolsDottedSettings = ConfigService.writeOpDevtoolsDottedSettings as jest.Mock;
const dispatchStTestFromWebviewMock = dispatchStTestFromWebview as jest.Mock;

function writeCsv(operatorPath: string, name: string, content: string): void {
  const inputDir = path.join(operatorPath, 'tests', 'st', 'arch35');

  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(path.join(inputDir, name), content, 'utf8');
}

describe('resolveCurrentContext (default dependencies)', () => {
  let tmpRoot: string;
  let operatorPath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-ctrl-'));
    operatorPath = path.join(tmpRoot, 'add_custom');
    fs.mkdirSync(operatorPath, { recursive: true });
    getWorkspaceFolder.mockReturnValue({ uri: { fsPath: tmpRoot } });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('throws oneOperatorRequired without an explicit selection', async () => {
    getSelectedOperatorEntries.mockResolvedValue([]);

    await expect(stTestMethods.loadOptions())
      .rejects
      .toThrow('stTest.oneOperatorRequired');
  });

  it('throws oneOperatorRequired when the selection spans multiple operators', async () => {
    getSelectedOperatorEntries.mockResolvedValue([
      {
        name: 'a',
        path: path.join(tmpRoot, 'a'),
      },
      {
        name: 'b',
        path: path.join(tmpRoot, 'b'),
      },
    ]);

    await expect(stTestMethods.loadOptions())
      .rejects
      .toThrow('stTest.oneOperatorRequired');
  });

  it('throws noWorkspace when the operator is not inside any workspace folder', async () => {
    getSelectedOperatorEntries.mockResolvedValue([
      {
        name: 'add_custom',
        path: operatorPath,
      },
    ]);
    getWorkspaceFolder.mockReturnValue(undefined);

    await expect(stTestMethods.loadOptions())
      .rejects
      .toThrow('stTest.noWorkspace');
  });

  it('wraps validation failures in stTest.discoveryFailed', async () => {
    getSelectedOperatorEntries.mockResolvedValue([
      {
        name: 'add_custom',
        path: path.join(tmpRoot, 'missing_op'),
      },
    ]);

    await expect(stTestMethods.loadOptions())
      .rejects
      .toThrow('stTest.discoveryFailed');
  });

  it('loads the available modes from the discovered input CSVs', async () => {
    getSelectedOperatorEntries.mockResolvedValue([
      {
        name: 'add_custom',
        path: operatorPath,
      },
    ]);
    // kernel: no api_name header.
    writeCsv(operatorPath, 'kernel_cases.csv', 'case_id,input\n1,2\n');
    // aclnn: api_name header with an aclnn value.
    writeCsv(operatorPath, 'aclnn_cases.csv', 'api_name,case_id\naclnnAdd,1\n');
    // e2e: api_name header with another value.
    writeCsv(operatorPath, 'e2e_cases.csv', 'api_name,case_id\nmatmul_run,1\n');

    const result = await stTestMethods.loadOptions();

    expect(result.operatorName)
      .toBe('add_custom');
    expect(result.availableModes)
      .toEqual([
        'kernel',
        'aclnn',
        'e2e',
      ]);
    expect(result.selectedModes)
      .toEqual(['kernel']);
    expect(result.contextToken)
      .toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports noAvailableCsv from ensureOptionsAvailable when the input dir is empty', async () => {
    getSelectedOperatorEntries.mockResolvedValue([
      {
        name: 'add_custom',
        path: operatorPath,
      },
    ]);

    await expect(stTestMethods.ensureOptionsAvailable())
      .rejects
      .toThrow('stTest.noAvailableCsv');
  });
});

describe('default read/persist/dispatch/closer wiring', () => {
  let tmpRoot: string;
  let operatorPath: string;
  let extensionContext: { extensionPath: string };
  let closer: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mstt-st-ctrl-'));
    operatorPath = path.join(tmpRoot, 'add_custom');
    fs.mkdirSync(path.join(operatorPath, 'tests', 'st', 'arch35'), { recursive: true });
    fs.writeFileSync(path.join(operatorPath, 'tests', 'st', 'arch35', 'cases.csv'), 'case_id,input\n1,2\n', 'utf8');
    getWorkspaceFolder.mockReturnValue({ uri: { fsPath: tmpRoot } });
    getSelectedOperatorEntries.mockResolvedValue([
      {
        name: 'add_custom',
        path: operatorPath,
      },
    ]);
    writeOpDevtoolsDottedSettings.mockResolvedValue(true);
    dispatchStTestFromWebviewMock.mockResolvedValue(true);
    extensionContext = { extensionPath: '/extension' };
    closer = jest.fn();
    registerStTestControllerContext(extensionContext as never);
    registerStTestOptionsPanelCloser(closer);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  it('runs through the default pipeline: read, persist, dispatch, and close', async () => {
    const options = await stTestMethods.loadOptions();

    await stTestMethods.runOptions({
      contextToken: options.contextToken,
      selectedModes: ['kernel'],
      argumentsByMode: { kernel: ['--repeat=2'] },
    });

    expect(writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith({
        'stTest.selectedModes': ['kernel'],
        'stTest.kernel.arguments': ['--repeat=2'],
      }, tmpRoot);
    expect(dispatchStTestFromWebviewMock)
      .toHaveBeenCalledWith(
        extensionContext,
        expect.objectContaining({
          workspaceRoot: tmpRoot,
          operatorName: 'add_custom',
          operatorPath,
          modes: ['kernel'],
        }),
      );
    expect(closer)
      .toHaveBeenCalledTimes(1);
  });

  it('reads the explicit workspace setting for the arguments fallback', async () => {
    getConfiguration.mockReturnValue({
      inspect: jest.fn((key: string) => {
        if (key === ST_TEST_ARGUMENTS_SETTING.kernel) {
          return {
            workspaceFolderValue: [
              '--from-setting',
              'value',
            ],
            workspaceValue: undefined,
          };
        }

        return undefined;
      }),
    });

    const options = await stTestMethods.loadOptions();

    expect(options.argumentsByMode.kernel)
      .toEqual([
        '--from-setting',
        'value',
      ]);
  });

  it('throws saveFailed when the settings write fails', async () => {
    writeOpDevtoolsDottedSettings.mockResolvedValue(false);
    const options = await stTestMethods.loadOptions();

    await expect(stTestMethods.runOptions({
      contextToken: options.contextToken,
      selectedModes: ['kernel'],
      argumentsByMode: { kernel: [] },
    }))
      .rejects
      .toThrow('stTest.options.saveFailed');
    expect(dispatchStTestFromWebviewMock)
      .not
      .toHaveBeenCalled();
  });

  it('throws notStarted when the queue rejects the run', async () => {
    dispatchStTestFromWebviewMock.mockResolvedValue(false);
    const options = await stTestMethods.loadOptions();

    await expect(stTestMethods.runOptions({
      contextToken: options.contextToken,
      selectedModes: ['kernel'],
      argumentsByMode: { kernel: [] },
    }))
      .rejects
      .toThrow('stTest.options.notStarted');
    expect(closer)
      .not
      .toHaveBeenCalled();
  });

  it('throws not_array when argumentsByMode is not an object', async () => {
    const options = await stTestMethods.loadOptions();

    await expect(stTestMethods.runOptions({
      contextToken: options.contextToken,
      selectedModes: ['kernel'],
      argumentsByMode: 'kernel' as never,
    }))
      .rejects
      .toThrow('stTest.options.validation.not_array');
    expect(writeOpDevtoolsDottedSettings)
      .not
      .toHaveBeenCalled();
  });

  it('throws a mode validation error when argumentsByMode is an array', async () => {
    const options = await stTestMethods.loadOptions();

    await expect(stTestMethods.runOptions({
      contextToken: options.contextToken,
      selectedModes: ['kernel'],
      argumentsByMode: ['kernel'] as never,
    }))
      .rejects
      .toThrow('stTest.options.validation.not_array');
  });

  it('throws the uninitialized error when no extension context was registered', async () => {
    registerStTestControllerContext(undefined as never);
    const options = await stTestMethods.loadOptions();

    await expect(stTestMethods.runOptions({
      contextToken: options.contextToken,
      selectedModes: ['kernel'],
      argumentsByMode: { kernel: [] },
    }))
      .rejects
      .toThrow('ST test controller is not initialized');
  });
});

describe('StTestController validation branches', () => {
  const workspaceRoot = '/workspace';
  const context = {
    workspaceRoot,
    operatorName: 'add',
    operatorPath: '/workspace/add',
    availableModes: [
      'kernel',
      'aclnn',
    ] as Array<'kernel' | 'aclnn' | 'e2e'>,
  };

  function createController(overrides: Partial<{
    readWorkspaceSetting: jest.Mock;
    persistWorkspaceSettings: jest.Mock;
    dispatch: jest.Mock;
    closeOptionsPanel: jest.Mock;
  }> = {}): StTestController {
    return new StTestController({
      resolveContext: async () => context,
      readWorkspaceSetting: overrides.readWorkspaceSetting ?? jest.fn(),
      persistWorkspaceSettings: overrides.persistWorkspaceSettings ?? jest.fn(async () => true),
      createContextToken: (value) => `${value.workspaceRoot}:${value.operatorPath}`,
      dispatch: overrides.dispatch ?? jest.fn(async () => true),
      closeOptionsPanel: overrides.closeOptionsPanel ?? jest.fn(),
    });
  }

  it('proceeds when the write is a no-op because the settings are already on disk', async () => {
    let written: Record<string, unknown> = {};
    const readWorkspaceSetting = jest.fn((_root: string, key: string) => written[key]);
    const persistWorkspaceSettings = jest.fn(async (writes: Record<string, unknown>) => {
      written = writes;

      return false;
    });
    const dispatch = jest.fn(async () => true);
    const controller = createController({
      readWorkspaceSetting,
      persistWorkspaceSettings,
      dispatch,
    });

    await expect(controller.runOptions({
      contextToken: '/workspace:/workspace/add',
      selectedModes: ['kernel'],
      argumentsByMode: { kernel: [] },
    }))
      .resolves
      .toBeUndefined();
    expect(dispatch)
      .toHaveBeenCalled();
  });

  it('throws saveFailed when the settings write fails and the disk does not hold them', async () => {
    const persistWorkspaceSettings = jest.fn(async () => false);
    const dispatch = jest.fn(async () => true);
    const controller = createController({
      readWorkspaceSetting: jest.fn(),
      persistWorkspaceSettings,
      dispatch,
    });

    await expect(controller.runOptions({
      contextToken: '/workspace:/workspace/add',
      selectedModes: ['kernel'],
      argumentsByMode: { kernel: [] },
    }))
      .rejects
      .toThrow('stTest.options.saveFailed');
    expect(dispatch)
      .not
      .toHaveBeenCalled();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a non-array selectedModes value', async () => {
    await expect(createController()
      .runOptions({
        contextToken: '/workspace:/workspace/add',
        selectedModes: 'kernel' as never,
        argumentsByMode: {},
      }))
      .rejects
      .toThrow('stTest.options.validation.modes');
  });

  it('rejects an empty selectedModes array after normalization', async () => {
    await expect(createController()
      .runOptions({
        contextToken: '/workspace:/workspace/add',
        selectedModes: [] as never,
        argumentsByMode: {},
      }))
      .rejects
      .toThrow('stTest.options.validation.modes');
  });

  it('rejects a selected mode that is not a supported ST mode', async () => {
    await expect(createController()
      .runOptions({
        contextToken: '/workspace:/workspace/add',
        selectedModes: ['debug'] as never,
        argumentsByMode: {},
      }))
      .rejects
      .toThrow('stTest.options.validation.unavailableMode');
  });

  it('rejects a supported mode that is not available for the operator', async () => {
    await expect(createController()
      .runOptions({
        contextToken: '/workspace:/workspace/add',
        selectedModes: ['e2e'],
        argumentsByMode: {},
      }))
      .rejects
      .toThrow('stTest.options.validation.unavailableMode');
  });

  it('rejects a persisted argument token for a mode', async () => {
    const readWorkspaceSetting = jest.fn()
      .mockReturnValue(['--output=/tmp/escape.csv']);

    await expect(createController({ readWorkspaceSetting })
      .runOptions({
        contextToken: '/workspace:/workspace/add',
        selectedModes: ['kernel'],
        argumentsByMode: {},
      }))
      .rejects
      .toThrow('stTest.options.validation.reserved');
  });

  it('falls back to the first available mode when kernel is not available', async () => {
    const controller = new StTestController({
      resolveContext: async () => ({
        ...context,
        availableModes: ['aclnn'],
      }),
      readWorkspaceSetting: jest.fn(),
      persistWorkspaceSettings: jest.fn(async () => true),
      createContextToken: (value) => `${value.workspaceRoot}:${value.operatorPath}`,
      dispatch: jest.fn(async () => true),
      closeOptionsPanel: jest.fn(),
    });

    const result = await controller.loadOptions();

    expect(result.selectedModes)
      .toEqual(['aclnn']);
  });

  it('reports no selection when no mode is available at all', async () => {
    const controller = new StTestController({
      resolveContext: async () => ({
        ...context,
        availableModes: [],
      }),
      readWorkspaceSetting: jest.fn(),
      persistWorkspaceSettings: jest.fn(async () => true),
      createContextToken: (value) => `${value.workspaceRoot}:${value.operatorPath}`,
      dispatch: jest.fn(async () => true),
      closeOptionsPanel: jest.fn(),
    });

    const result = await controller.loadOptions();

    expect(result.selectedModes)
      .toEqual([]);
    expect(result.availableModes)
      .toEqual([]);
  });
});
