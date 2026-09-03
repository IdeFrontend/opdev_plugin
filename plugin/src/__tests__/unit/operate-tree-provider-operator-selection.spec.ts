import {
  CONTEXT_PREFIX,
  treeItemContextKey,
} from '@shared/flavor';

const mockSetSelectedOperators = jest.fn();

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
    },
    env: {
      language: 'en',
      clipboard: {
        writeText: jest.fn()
          .mockResolvedValue(undefined),
      },
    },
    window: {
      activeColorTheme: { kind: 2 },
      onDidChangeActiveColorTheme: jest.fn(),
      showErrorMessage: jest.fn(),
      showInformationMessage: jest.fn(),
      showTextDocument: jest.fn()
        .mockResolvedValue(undefined),
    },
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: jest.fn(() => ({ get: jest.fn() })),
      openTextDocument: jest.fn()
        .mockResolvedValue({}),
    },
  };
});

jest.mock('@plugin/controller/home-controller', () => ({ homeMethods: { setSelectedOperators: (...args: unknown[]) => mockSetSelectedOperators(...args) } }));
jest.mock('@plugin/service/settings-loader', () => ({ SettingsLoader: {} }));
jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: {} }));
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
import { COMMAND_SIDEBAR_TOGGLE_OPERATOR } from '../../constants';
import {
  OperateNode, OperateTreeProvider,
} from '@plugin/class/operate-tree-provider';

type OperatorRecord = {
  id: number;
  name: string;
  hasEx: boolean;
  isCompiled: boolean;
};

type StateHarness = {
  state: {
    hasDevtoolConfig: boolean;
    hasMultipleOperators: boolean;
    isStandardCustom: boolean;
    operators: OperatorRecord[];
    searchKeyword: string;
    selectedOperatorIds: number[];
    projectType: string;
    projectTemplateName: string;
    sanitizer: {
      reports: unknown[];
      sortOrder: 'asc' | 'desc';
      markedOnly: boolean;
      selectedReportPath?: string;
      selectedReportTitle?: string;
      selectedMessages: unknown[];
      resultsGroupBy: 'class' | 'severity' | 'type' | 'file';
      hideDuplicates: boolean;
      reportRevision: number;
      manualReports: unknown[];
    };
    performance: {
      reports: unknown[];
      sortOrder: 'asc' | 'desc';
      markedOnly: boolean;
      selectedReportKey?: string;
    };
  };
};

const operator = (id: number, name: string, options: Partial<OperatorRecord> = {}): OperatorRecord => ({
  id,
  name,
  hasEx: false,
  isCompiled: true,
  ...options,
});

const createState = (): StateHarness['state'] => ({
  hasDevtoolConfig: true,
  hasMultipleOperators: true,
  isStandardCustom: true,
  operators: [],
  searchKeyword: '',
  selectedOperatorIds: [],
  projectType: 'unknown',
  projectTemplateName: '',
  sanitizer: {
    reports: [],
    sortOrder: 'desc',
    markedOnly: false,
    selectedMessages: [],
    resultsGroupBy: 'class',
    hideDuplicates: false,
    reportRevision: 0,
    manualReports: [],
  },
  performance: {
    reports: [],
    sortOrder: 'desc',
    markedOnly: false,
  },
});

const createProvider = (kind: 'flow' | 'operatorProjects' = 'operatorProjects'): OperateTreeProvider => {
  const provider = new OperateTreeProvider(vscode.Uri.file('/extension'), kind);

  (provider as unknown as StateHarness).state = createState();

  return provider;
};

describe('OperateTreeProvider operator project tree root', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
  });

  it('hides the tree when neither multi-operator nor standard-custom context applies', () => {
    harness.state.hasMultipleOperators = false;
    harness.state.isStandardCustom = false;
    harness.state.operators = [operator(1, 'op-a')];

    expect(provider.getChildren())
      .toEqual([]);
  });

  it('lists operators as flat rows, non-ex first, then by name', () => {
    harness.state.operators = [
      operator(1, 'zeta', { hasEx: true }),
      operator(2, 'alpha'),
      operator(3, 'beta'),
    ];

    const nodes = provider.getChildren() as OperateNode[];

    expect(nodes.map((node) => node.label))
      .toEqual([
        'alpha',
        'beta',
        'zeta',
      ]);
    expect(nodes[0].nodeId)
      .toBe('operatorItem');
    expect(nodes[0].command)
      .toEqual({
        command: COMMAND_SIDEBAR_TOGGLE_OPERATOR,
        title: 'alpha',
        arguments: [2],
      });
    expect(nodes[0].id)
      .toBe('operator-2');
    expect(nodes[0].collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.None);
  });

  it('marks selected rows with a check icon and disables opposite-type rows', () => {
    harness.state.operators = [
      operator(1, 'ex-op', { hasEx: true }),
      operator(2, 'non-ex-op'),
    ];
    harness.state.selectedOperatorIds = [1];

    const nodes = provider.getChildren() as OperateNode[];

    // nodes[0] is the selected-count header; flat rows start at nodes[1].
    expect((nodes[1].iconPath as vscode.ThemeIcon).id)
      .toBe('circle-slash');
    expect(nodes[1].command)
      .toBeUndefined();
    expect(nodes[1].tooltip)
      .toBe('web.operate.operatorsDisabledWhenExampleSelected');
    expect((nodes[2].iconPath as vscode.ThemeIcon).id)
      .toBe('check');
    expect(nodes[2].command)
      .toEqual({
        command: COMMAND_SIDEBAR_TOGGLE_OPERATOR,
        title: 'ex-op',
        arguments: [1],
      });
    expect(nodes[2].tooltip)
      .toBeUndefined();
  });

  it('hints every disabled example row to clear the operator selection', () => {
    harness.state.operators = [
      operator(1, 'ex-op', { hasEx: true }),
      operator(2, 'non-ex-op'),
    ];
    harness.state.selectedOperatorIds = [2];

    const nodes = provider.getChildren() as OperateNode[];

    // nodes[0] is the selected-count header; non-ex rows come first.
    expect(nodes[1].label)
      .toBe('non-ex-op');
    expect(nodes[1].tooltip)
      .toBeUndefined();
    expect((nodes[2].iconPath as vscode.ThemeIcon).id)
      .toBe('circle-slash');
    expect(nodes[2].command)
      .toBeUndefined();
    expect(nodes[2].tooltip)
      .toBe('web.operate.examplesDisabledWhenOperatorSelected');
  });

  it('filters rows by the search keyword', () => {
    harness.state.operators = [
      operator(1, 'Matrix Kernel'),
      operator(2, 'Vector Kernel'),
    ];
    provider.setSearchKeyword('vector');

    const nodes = provider.getChildren() as OperateNode[];

    expect(nodes.map((node) => node.label))
      .toEqual(['Vector Kernel']);
  });

  it('adds a selected-count header when at least one operator is selected', () => {
    harness.state.operators = [operator(1, 'op-a')];
    harness.state.selectedOperatorIds = [1];

    const nodes = provider.getChildren() as OperateNode[];

    expect(nodes[0].label)
      .toBe('web.operate.selectedCount');
    expect(nodes[0].nodeId)
      .toBe('selectedOperators');
    expect(nodes[0].collapsibleState)
      .toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(nodes[0].contextValue)
      .toBe('operator-projects-selected');
  });

  it('expands the selected-count header into checked operator rows', () => {
    harness.state.operators = [
      operator(1, 'first'),
      operator(2, 'second'),
    ];
    harness.state.selectedOperatorIds = [
      2,
      1,
    ];

    const header = {
      nodeId: 'selectedOperators',
      id: 'operator-projects-selected',
    } as OperateNode;
    const nodes = provider.getChildren(header) as OperateNode[];

    expect(nodes.map((node) => node.label))
      .toEqual([
        'second',
        'first',
      ]);
    expect(nodes[0].id)
      .toBe('selected-operator-2');
    expect((nodes[0].iconPath as vscode.ThemeIcon).id)
      .toBe('check');
    expect(nodes[0].command)
      .toEqual({
        command: COMMAND_SIDEBAR_TOGGLE_OPERATOR,
        title: 'second',
        arguments: [2],
      });
  });

  it('skips selected rows whose operator no longer exists', () => {
    harness.state.operators = [operator(1, 'first')];
    harness.state.selectedOperatorIds = [
      1,
      9,
    ];

    const header = {
      nodeId: 'selectedOperators',
      id: 'operator-projects-selected',
    } as OperateNode;

    expect(provider.getChildren(header) as OperateNode[])
      .toHaveLength(1);
  });

  it('shows the tree when only the standard-custom context applies', () => {
    harness.state.hasMultipleOperators = false;
    harness.state.operators = [operator(1, 'op-a')];

    expect(provider.getChildren() as OperateNode[])
      .toHaveLength(1);
  });

  it('returns an empty selected list without a selection', () => {
    const header = {
      nodeId: 'selectedOperators',
      id: 'operator-projects-selected',
    } as OperateNode;

    expect(provider.getChildren(header))
      .toEqual([]);
  });
});

describe('OperateTreeProvider operator toggling', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
    mockSetSelectedOperators.mockReset();
    mockSetSelectedOperators.mockResolvedValue(undefined);
  });

  it('ignores toggling an unknown operator id', async () => {
    await provider.toggleOperator(99);

    expect(mockSetSelectedOperators)
      .not
      .toHaveBeenCalled();
  });

  it('selects an unselected operator and persists the new list', async () => {
    harness.state.operators = [
      operator(1, 'first'),
      operator(2, 'second'),
    ];
    harness.state.selectedOperatorIds = [1];
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    )
      .mockClear();

    await provider.toggleOperator(2);

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({
        operatorIds: [
          1,
          2,
        ],
      });
    expect(harness.state.selectedOperatorIds)
      .toEqual([
        1,
        2,
      ]);
    expect(fire)
      .toHaveBeenCalledTimes(1);
  });

  it('deselects a selected operator', async () => {
    harness.state.operators = [
      operator(1, 'first'),
      operator(2, 'second'),
    ];
    harness.state.selectedOperatorIds = [
      1,
      2,
    ];

    await provider.toggleOperator(1);

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({ operatorIds: [2] });
    expect(harness.state.selectedOperatorIds)
      .toEqual([2]);
  });

  it('refuses to select an operator of the opposite type', async () => {
    harness.state.operators = [
      operator(1, 'ex-op', { hasEx: true }),
      operator(2, 'non-ex-op'),
    ];
    harness.state.selectedOperatorIds = [2];

    await provider.toggleOperator(1);

    expect(mockSetSelectedOperators)
      .not
      .toHaveBeenCalled();
    expect(harness.state.selectedOperatorIds)
      .toEqual([2]);
  });

  it('reports a mixed-type selection as disabled', async () => {
    harness.state.operators = [
      operator(1, 'ex-op', { hasEx: true }),
      operator(2, 'non-ex-op'),
    ];
    const isDisabled = (provider as unknown as {
      isOperatorDisabled(op: { hasEx: boolean }): boolean;
    }).isOperatorDisabled;

    expect(isDisabled.call(provider, { hasEx: true }))
      .toBe(false);

    harness.state.selectedOperatorIds = [2];
    expect(isDisabled.call(provider, { hasEx: true }))
      .toBe(true);
    expect(isDisabled.call(provider, { hasEx: false }))
      .toBe(false);

    harness.state.selectedOperatorIds = [1];
    expect(isDisabled.call(provider, { hasEx: false }))
      .toBe(true);
  });
});

describe('OperateTreeProvider compiled/prepared bulk toggles', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
    mockSetSelectedOperators.mockReset();
    mockSetSelectedOperators.mockResolvedValue(undefined);
  });

  let isCompiledAllSelected: ()=> boolean;
  let isPreparedAllSelected: ()=> boolean;
  let getSelectedType: ()=> 'ex' | 'nonEx' | null;

  beforeEach(() => {
    harness.state.operators = [
      operator(1, 'compiled-a'),
      operator(2, 'compiled-b', { hasEx: true }),
      operator(3, 'prepared-a', { isCompiled: false }),
      operator(4, 'prepared-b', {
        hasEx: true,
        isCompiled: false,
      }),
    ];
    isCompiledAllSelected = (provider as unknown as {
      isCompiledAllSelected(): boolean;
    }).isCompiledAllSelected;
    isPreparedAllSelected = (provider as unknown as {
      isPreparedAllSelected(): boolean;
    }).isPreparedAllSelected;
    getSelectedType = (provider as unknown as {
      getSelectedType(): 'ex' | 'nonEx' | null;
    }).getSelectedType;
  });

  it('does nothing without a selection type', async () => {
    await provider.toggleCompiledAll();

    expect(mockSetSelectedOperators)
      .not
      .toHaveBeenCalled();
    expect(getSelectedType.call(provider))
      .toBeNull();
  });

  it('does nothing without a selection type for the prepared toggle', async () => {
    await provider.togglePreparedAll();

    expect(mockSetSelectedOperators)
      .not
      .toHaveBeenCalled();
  });

  it('does nothing when only the opposite-type compiled operators exist', async () => {
    harness.state.operators = [
      operator(2, 'compiled-ex', { hasEx: true }),
      operator(3, 'prepared-a', { isCompiled: false }),
    ];
    harness.state.selectedOperatorIds = [3];

    await provider.toggleCompiledAll();

    expect(mockSetSelectedOperators)
      .not
      .toHaveBeenCalled();
  });

  it('does nothing when no prepared operators exist', async () => {
    harness.state.operators = [
      operator(1, 'compiled-a'),
      operator(2, 'compiled-b', { hasEx: true }),
    ];
    harness.state.selectedOperatorIds = [1];

    await provider.togglePreparedAll();

    expect(mockSetSelectedOperators)
      .not
      .toHaveBeenCalled();
  });

  it('does nothing when only the opposite-type prepared operators exist', async () => {
    harness.state.operators = [
      operator(1, 'compiled-a'),
      operator(4, 'prepared-ex', {
        hasEx: true,
        isCompiled: false,
      }),
    ];
    harness.state.selectedOperatorIds = [1];

    await provider.togglePreparedAll();

    expect(mockSetSelectedOperators)
      .not
      .toHaveBeenCalled();
  });

  it('filters compiled operators by the search keyword', () => {
    harness.state.operators = [
      operator(1, 'Matrix Kernel'),
      operator(2, 'Vector Kernel', { hasEx: true }),
      operator(3, 'Unrelated', { isCompiled: false }),
    ];
    harness.state.searchKeyword = 'kernel';
    const filtered = (provider as unknown as {
      getFilteredCompiledOperators(): OperatorRecord[];
    }).getFilteredCompiledOperators;

    expect(filtered.call(provider)
      .map((op) => op.id))
      .toEqual([
        1,
        2,
      ]);
  });

  it('filters prepared operators by the search keyword', () => {
    harness.state.operators = [
      operator(1, 'Matrix Kernel'),
      operator(2, 'Unrelated'),
      operator(3, 'Vector Kernel', { isCompiled: false }),
    ];
    harness.state.searchKeyword = 'kernel';
    const filtered = (provider as unknown as {
      getFilteredPreparedOperators(): OperatorRecord[];
    }).getFilteredPreparedOperators;

    expect(filtered.call(provider)
      .map((op) => op.id))
      .toEqual([3]);
  });

  it('selects every compiled operator of the current type', async () => {
    harness.state.selectedOperatorIds = [3];

    await provider.toggleCompiledAll();

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({
        operatorIds: [
          3,
          1,
        ],
      });
    expect(harness.state.selectedOperatorIds)
      .toEqual([
        3,
        1,
      ]);
    expect(getSelectedType.call(provider))
      .toBe('nonEx');
  });

  it('deselects compiled operators when all of them are selected', async () => {
    harness.state.selectedOperatorIds = [
      1,
      3,
    ];

    await provider.toggleCompiledAll();

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({ operatorIds: [3] });
  });

  it('does nothing when no compiled operators match the type', async () => {
    harness.state.operators = [operator(3, 'prepared-a', { isCompiled: false })];
    harness.state.selectedOperatorIds = [3];

    await provider.toggleCompiledAll();

    expect(mockSetSelectedOperators)
      .not
      .toHaveBeenCalled();
  });

  it('reports whether all compiled operators of the type are selected', async () => {
    expect(isCompiledAllSelected.call(provider))
      .toBe(false);

    harness.state.selectedOperatorIds = [
      1,
      2,
    ];
    expect(isCompiledAllSelected.call(provider))
      .toBe(false);

    harness.state.selectedOperatorIds = [
      1,
      3,
    ];
    expect(isCompiledAllSelected.call(provider))
      .toBe(true);
  });

  it('selects every prepared operator of the current type', async () => {
    harness.state.selectedOperatorIds = [1];

    await provider.togglePreparedAll();

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({
        operatorIds: [
          1,
          3,
        ],
      });
    expect(harness.state.selectedOperatorIds)
      .toEqual([
        1,
        3,
      ]);
  });

  it('deselects prepared operators when all of them are selected', async () => {
    harness.state.selectedOperatorIds = [
      1,
      3,
    ];

    await provider.togglePreparedAll();

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({ operatorIds: [1] });
  });

  it('reports whether all prepared operators of the type are selected', async () => {
    expect(isPreparedAllSelected.call(provider))
      .toBe(false);
    expect(provider.getPreparedAllSelected())
      .toBe(false);

    harness.state.selectedOperatorIds = [3];
    expect(isPreparedAllSelected.call(provider))
      .toBe(true);
  });
});

describe('OperateTreeProvider select-all operators', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
    mockSetSelectedOperators.mockReset();
    mockSetSelectedOperators.mockResolvedValue(undefined);
    harness.state.operators = [
      operator(1, 'alpha'),
      operator(2, 'beta', { hasEx: true }),
      operator(3, 'gamma', { isCompiled: false }),
    ];
  });

  it('reports no selection without a single-type selection', () => {
    expect(provider.getAllOperatorsSelected())
      .toBe(false);

    harness.state.selectedOperatorIds = [
      1,
      2,
    ];
    expect(provider.getAllOperatorsSelected())
      .toBe(false);
  });

  it('reports true when every operator of the current type is selected', () => {
    harness.state.selectedOperatorIds = [
      1,
      3,
    ];
    expect(provider.getAllOperatorsSelected())
      .toBe(true);

    harness.state.selectedOperatorIds = [2];
    expect(provider.getAllOperatorsSelected())
      .toBe(true);
  });

  it('reports the all-selected state for the search-filtered operators', () => {
    harness.state.selectedOperatorIds = [1];
    harness.state.searchKeyword = 'alpha';

    expect(provider.getAllOperatorsSelected())
      .toBe(true);

    harness.state.searchKeyword = 'beta';
    expect(provider.getAllOperatorsSelected())
      .toBe(false);
  });

  it('selects non-ex operators when the list mixes both types', async () => {
    await provider.selectAllOperators();

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({
        operatorIds: [
          1,
          3,
        ],
      });
  });

  it('selects every operator when none is non-ex', async () => {
    harness.state.operators = [
      operator(1, 'alpha', { hasEx: true }),
      operator(2, 'beta', { hasEx: true }),
    ];

    await provider.selectAllOperators();

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({
        operatorIds: [
          1,
          2,
        ],
      });
  });

  it('keeps the current type when a single type is selected', async () => {
    harness.state.selectedOperatorIds = [2];

    await provider.selectAllOperators();

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({ operatorIds: [2] });
  });

  it('selects only the search-filtered operators', async () => {
    provider.setSearchKeyword('alpha');

    await provider.selectAllOperators();

    expect(mockSetSelectedOperators)
      .toHaveBeenCalledWith({ operatorIds: [1] });
  });

  it('does nothing when the filtered list is empty', async () => {
    provider.setSearchKeyword('ghost');

    await provider.selectAllOperators();

    expect(mockSetSelectedOperators)
      .not
      .toHaveBeenCalled();
  });
});

describe('OperateTreeProvider operator search and row descriptions', () => {
  let provider: OperateTreeProvider;
  let harness: StateHarness;

  beforeEach(() => {
    provider = createProvider();
    harness = provider as unknown as StateHarness;
  });

  it('sets the search keyword and fires the change event', () => {
    const fire = jest.spyOn(
      (provider as unknown as { onDidChangeTreeDataEmitter: { fire: jest.Mock } }).onDidChangeTreeDataEmitter,
      'fire',
    )
      .mockClear();

    provider.setSearchKeyword('kernel');
    expect(provider.getSearchKeyword())
      .toBe('kernel');
    expect(fire)
      .toHaveBeenCalledTimes(1);

    provider.setSearchKeyword(null as unknown as string);
    expect(provider.getSearchKeyword())
      .toBe('');
  });

  it('builds row descriptions from ex and compiled flags', () => {
    harness.state.operators = [
      operator(1, 'plain', { isCompiled: false }),
      operator(2, 'ex-only', { hasEx: true }),
      operator(3, 'compiled-only'),
      operator(4, 'both', { hasEx: true }),
    ];

    const nodes = provider.getChildren() as OperateNode[];

    expect(nodes.find((node) => node.label === 'plain')?.description)
      .toBeUndefined();
    expect(nodes.find((node) => node.label === 'ex-only')?.description)
      .toBe('ex · ⚑');
    expect(nodes.find((node) => node.label === 'compiled-only')?.description)
      .toBe('⚑');
    expect(nodes.find((node) => node.label === 'both')?.description)
      .toBe('ex · ⚑');
  });

  it('keeps ex rows at the bottom of the flat list', () => {
    harness.state.operators = [
      operator(1, 'zeta', { hasEx: true }),
      operator(2, 'alpha', { hasEx: true }),
      operator(3, 'non-ex'),
    ];

    const nodes = provider.getChildren() as OperateNode[];

    expect(nodes.map((node) => node.label))
      .toEqual([
        'non-ex',
        'alpha',
        'zeta',
      ]);
  });

  it('applies the search filter within the flat rows', () => {
    harness.state.operators = [
      operator(1, 'Matrix Kernel'),
      operator(2, 'Vector Kernel', { hasEx: true }),
      operator(3, 'Unrelated'),
    ];
    provider.setSearchKeyword('kernel');

    const nodes = provider.getChildren() as OperateNode[];

    expect(nodes.map((node) => node.label))
      .toEqual([
        'Matrix Kernel',
        'Vector Kernel',
      ]);
  });

  it('returns no rows when the operator tree context is absent', () => {
    harness.state.hasMultipleOperators = false;
    harness.state.isStandardCustom = false;
    harness.state.operators = [operator(1, 'alpha')];

    expect(provider.getChildren())
      .toEqual([]);
  });

  it('returns no selector children when the context flags are absent', () => {
    harness.state.hasMultipleOperators = false;
    harness.state.isStandardCustom = false;
    const children = (provider as unknown as {
      getOperatorSelectorChildren(): OperateNode[];
    }).getOperatorSelectorChildren;

    expect(children.call(provider))
      .toEqual([]);
  });
});
