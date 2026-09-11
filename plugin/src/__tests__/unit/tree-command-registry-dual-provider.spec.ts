/**
 * GC-86 part 2 regression: refreshState runs for BOTH provider kinds, and the
 * per-operator toggle registry is shared code. Real VS Code THROWS on a
 * duplicate command registration ('Command with id ... already exists'); the
 * jest vscode mock used by the other specs silently accepted duplicates, so
 * this class of breakage was invisible. This spec emulates the real behavior:
 * registerCommand throws on a duplicate id — two provider refreshes over the
 * same operator list must NOT throw, and the toggle command must be
 * registered exactly once.
 */
import { COMMAND_SIDEBAR_TOGGLE_OPERATOR } from '../../constants';
import { stableCommandId } from '@plugin/domain/utils/command-utils';

const mockGetProjectType = jest.fn();
const mockCheckMultipleOperators = jest.fn();
const mockGetSelectedOperatorIds = jest.fn();
const mockSetSelectedOperators = jest.fn();
const mockSettingsRead = jest.fn();
const mockIsProjectTypeSupported = jest.fn(() => true);

const registeredCommandIds = new Set<string>();

jest.mock('i18next', () => ({ t: (key: string) => key }));

jest.mock('vscode', () => {
  class EventEmitter<T> {
    readonly event = jest.fn();
    readonly fire = jest.fn((_value?: T) => undefined);
    readonly dispose = jest.fn();
  }

  class TreeItem {
    id?: string;
    command?: unknown;
    contextValue?: string;
    iconPath?: unknown;
    description?: string;
    tooltip?: unknown;

    constructor(
      public label: string,
      public collapsibleState: number,
    ) {}
  }

  class ThemeIcon {
    constructor(public id: string) {}
  }

  class ThemeColor {
    constructor(public id: string) {}
  }

  return {
    ColorThemeKind: {
      Light: 1,
      Dark: 2,
      HighContrast: 3,
      HighContrastLight: 4,
    },
    EventEmitter,
    ThemeColor,
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (uri: { fsPath: string }, ...segments: string[]) => ({
        fsPath: [
          uri.fsPath,
          ...segments,
        ].join('/'),
      }),
    },
    ViewColumn: { One: 1 },
    commands: {
      executeCommand: jest.fn()
        .mockResolvedValue(undefined),
      // Real VS Code semantics: a duplicate registration rejects.
      registerCommand: jest.fn((id: string) => {
        if (registeredCommandIds.has(id)) {
          throw new Error(`Command with id '${id}' already exists`);
        }

        registeredCommandIds.add(id);

        return {
          dispose: () => {
            registeredCommandIds.delete(id);
          },
        };
      }),
    },
    env: { language: 'en' },
    window: {
      activeColorTheme: { kind: 2 },
      showErrorMessage: jest.fn(),
      showInformationMessage: jest.fn(),
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: '/c/root' } }],
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
    },
  };
});

jest.mock('@plugin/controller/home-controller', () => ({
  homeMethods: {
    getProjectType: (...args: unknown[]) => mockGetProjectType(...args),
    checkMultipleOperators: (...args: unknown[]) => mockCheckMultipleOperators(...args),
    getSelectedOperatorIds: (...args: unknown[]) => mockGetSelectedOperatorIds(...args),
    setSelectedOperators: (...args: unknown[]) => mockSetSelectedOperators(...args),
  },
}));
jest.mock('@plugin/service/settings-loader', () => ({ SettingsLoader: { read: (...args: unknown[]) => mockSettingsRead(...args) } }));
jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: { isProjectTypeSupported: (...args: unknown[]) => mockIsProjectTypeSupported(...args) } }));
jest.mock('@plugin/controller/performance-controller', () => ({ performanceDataMethods: {} }));
jest.mock('@plugin/controller/performance-data-controller', () => ({ performanceMethods: {} }));
jest.mock('@plugin/service/view-service', () => ({ viewService: {} }));
jest.mock('@plugin/helpers/environment-script-guard', () => ({ ensureEnvironmentScriptForOperateAction: jest.fn() }));
jest.mock('@plugin/helpers/output-channel', () => ({ appendLog: jest.fn() }));
jest.mock('@plugin/service/sanitizer-diagnostics.service', () => ({ sanitizerDiagnosticsService: {} }));
jest.mock('@plugin/service/run-data-service', () => ({ runDataService: {} }));
jest.mock('@plugin/helpers/st-test-action', () => ({
  getStTestSelectionState: jest.fn(() => 'none'),
  shouldShowStTestAction: jest.fn(() => false),
}));

import * as vscode from 'vscode';
import { OperateTreeProvider } from '@plugin/class/operate-tree-provider';
import { normalizeProjectPath } from '@plugin/domain/models/project-model';

const OPERATORS = [
  {
    id: 0,
    name: 'first_op',
    path: '/c/root/first_op',
    isExperimental: false,
    isCompiled: true,
  },
  {
    id: 1,
    name: 'second_op',
    path: '/c/root/second_op',
    isExperimental: false,
    isCompiled: false,
  },
];

const configureMocks = (): void => {
  mockCheckMultipleOperators.mockResolvedValue({
    hasMultiple: true,
    isStandardCustom: true,
    operators: OPERATORS,
    supportsSanitizerAndTuning: true,
  });
  mockGetProjectType.mockResolvedValue({
    projectType: 'ascend',
    projectTemplateName: '',
  });
  mockGetSelectedOperatorIds.mockResolvedValue(undefined);
  mockSettingsRead.mockReturnValue(true);
};

describe('per-operator toggle command registry across provider kinds', () => {
  beforeEach(() => {
    registeredCommandIds.clear();
    jest.clearAllMocks();
    configureMocks();
  });

  it('registers each operator toggle command exactly once across both provider kinds', async () => {
    const flow = new OperateTreeProvider(vscode.Uri.file('/extension'), 'flow');
    const projects = new OperateTreeProvider(vscode.Uri.file('/extension'), 'operatorProjects');

    projects.registerOperatorToggleCommands(async () => undefined);

    await flow.refreshState(true);
    await projects.refreshState(true);

    for (const operator of OPERATORS) {
      const id = stableCommandId(COMMAND_SIDEBAR_TOGGLE_OPERATOR, normalizeProjectPath(operator.path));

      expect(registeredCommandIds.has(id))
        .toBe(true);
    }

    expect(vscode.commands.registerCommand)
      .toHaveBeenCalledTimes(OPERATORS.length);
  });

  it('disposes the toggle command of an operator that left the list', async () => {
    const projects = new OperateTreeProvider(vscode.Uri.file('/extension'), 'operatorProjects');

    projects.registerOperatorToggleCommands(async () => undefined);
    await projects.refreshState(true);

    const removedId = stableCommandId(
      COMMAND_SIDEBAR_TOGGLE_OPERATOR,
      normalizeProjectPath(OPERATORS[1].path),
    );

    expect(registeredCommandIds.has(removedId))
      .toBe(true);

    mockCheckMultipleOperators.mockResolvedValue({
      hasMultiple: true,
      isStandardCustom: true,
      operators: OPERATORS.slice(0, 1),
      supportsSanitizerAndTuning: true,
    });

    await projects.refreshState(true);

    expect(registeredCommandIds.has(removedId))
      .toBe(false);
  });
});
