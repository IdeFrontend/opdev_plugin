/**
 * Unit coverage for the extension entry point (src/extension.ts).
 *
 * Strategy: mock every heavy production module with light jest.fn doubles and
 * build a rich spec-local `vscode` mock that captures registered command
 * handlers, tree views, watchers and event subscriptions. Tests call
 * `activate()` with a fake ExtensionContext and then exercise the captured
 * handlers and event callbacks directly.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockCommandHandlers = new Map<string, (...args: unknown[])=> unknown>();
const mockWorkspaceFoldersHandlers: Array<()=> Promise<void>> = [];
const mockColorThemeHandlers: Array<()=> Promise<void>> = [];
const mockWatcherState = {
  create: [] as Array<(uri: { fsPath: string })=> Promise<void>>,
  change: [] as Array<(uri: { fsPath: string })=> Promise<void>>,
  delete: [] as Array<(uri: { fsPath: string })=> Promise<void>>,
};
const mockGateUiHandlers: Array<(state: unknown)=> void> = [];
const mockFlowPreemptHandlers: Array<()=> void> = [];
const mockDumpTensorWebview = { postMessage: jest.fn(async () => undefined) };

type MockTreeViewState = {
  viewId: string;
  options: unknown;
  selectionHandlers: Array<(event: { selection: unknown[] })=> unknown>;
  dispose: jest.Mock;
};
const mockTreeViews = new Map<string, MockTreeViewState>();

jest.mock('vscode', () => {
  class MockUri {
    fsPath: string;
    scheme: string;

    constructor(fsPath: string, scheme: string) {
      this.fsPath = fsPath;
      this.scheme = scheme;
    }

    static file(fsPath: string): MockUri {
      return new MockUri(fsPath, 'file');
    }

    static parse(value: string): MockUri {
      return new MockUri(value, 'https');
    }
  }

  return {
    env: {
      language: 'en',
      uriScheme: 'vscode',
      openExternal: jest.fn(async () => true),
    },
    workspace: {
      workspaceFolders: [
        {
          uri: { fsPath: '/workspace' },
          name: 'ws',
        },
      ],
      getConfiguration: jest.fn(() => ({
        get: jest.fn(),
        inspect: jest.fn(),
        update: jest.fn(),
      })),
      onDidChangeConfiguration: jest.fn(() => ({ dispose: jest.fn() })),
      onDidChangeWorkspaceFolders: jest.fn((cb: ()=> Promise<void>) => {
        mockWorkspaceFoldersHandlers.push(cb);

        return { dispose: jest.fn() };
      }),
      createFileSystemWatcher: jest.fn(() => {
        const watcher = {
          createHandlers: [] as Array<(uri: { fsPath: string })=> Promise<void>>,
          changeHandlers: [] as Array<(uri: { fsPath: string })=> Promise<void>>,
          deleteHandlers: [] as Array<(uri: { fsPath: string })=> Promise<void>>,
          onDidCreate: jest.fn((cb: (uri: { fsPath: string })=> Promise<void>) => {
            watcher.createHandlers.push(cb);

            return { dispose: jest.fn() };
          }),
          onDidChange: jest.fn((cb: (uri: { fsPath: string })=> Promise<void>) => {
            watcher.changeHandlers.push(cb);

            return { dispose: jest.fn() };
          }),
          onDidDelete: jest.fn((cb: (uri: { fsPath: string })=> Promise<void>) => {
            watcher.deleteHandlers.push(cb);

            return { dispose: jest.fn() };
          }),
          dispose: jest.fn(),
        };

        return watcher;
      }),
    },
    window: {
      createTreeView: jest.fn((viewId: string, options: unknown) => {
        const view: MockTreeViewState = {
          viewId,
          options,
          selectionHandlers: [],
          dispose: jest.fn(),
        };

        view.selectionHandlers = [];
        const onDidChangeSelection = jest.fn((cb: (event: { selection: unknown[] })=> unknown) => {
          view.selectionHandlers.push(cb);

          return { dispose: jest.fn() };
        });

        mockTreeViews.set(viewId, view);

        return {
          ...view,
          onDidChangeSelection,
        };
      }),
      registerCustomEditorProvider: jest.fn(() => ({ dispose: jest.fn() })),
      showInformationMessage: jest.fn(async () => undefined),
      showWarningMessage: jest.fn(async () => undefined),
      showErrorMessage: jest.fn(async () => undefined),
      showInputBox: jest.fn(async () => undefined),
      showOpenDialog: jest.fn(async () => undefined),
      showQuickPick: jest.fn(async () => undefined),
      withProgress: jest.fn(async (_options: unknown, cb: (progress: { report: jest.Mock })=> unknown) => cb({ report: jest.fn() })),
      onDidChangeActiveColorTheme: jest.fn((cb: ()=> Promise<void>) => {
        mockColorThemeHandlers.push(cb);

        return { dispose: jest.fn() };
      }),
    },
    commands: {
      registerCommand: jest.fn((id: string, handler: (...args: unknown[])=> unknown) => {
        mockCommandHandlers.set(id, handler);

        return { dispose: jest.fn() };
      }),
      executeCommand: jest.fn(async (id: string, ...args: unknown[]) => {
        const handler = mockCommandHandlers.get(id);

        if (handler) {
          return handler(...args);
        }

        return undefined;
      }),
      getCommands: jest.fn(async () => []),
    },
    Uri: MockUri,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    QuickPickItemKind: {
      Separator: 0,
      Default: 1,
    },
    ConfigurationTarget: {
      Global: 1,
      Workspace: 2,
      WorkspaceFolder: 3,
    },
  };
});

jest.mock('@plugin/class/webview-provider', () => {
  class MockWebviewProvider {
    static instances: MockWebviewProvider[] = [];
    show = jest.fn(async () => undefined);
    postMessage = jest.fn(async () => undefined);
    dispose = jest.fn();

    constructor(public context: unknown, public apiServer: unknown) {
      MockWebviewProvider.instances.push(this);
    }
  }

  return { WebviewProvider: MockWebviewProvider };
});

jest.mock('@plugin/class/webview-message-list', () => ({ handleOperatorProjectDirectoryFile: jest.fn(async () => undefined) }));

jest.mock('@plugin/class/csv-editor-provider', () => ({
  CsvEditorProvider: class MockCsvEditorProvider {
    static viewType = 'test.csvEditor';
  },
}));

jest.mock('@plugin/class/npu-rep-editor-provider', () => ({
  NpuRepEditorProvider: class MockNpuRepEditorProvider {
    static viewType = 'test.npuRepEditor';
  },
}));

jest.mock('@plugin/class/home-tree-provider', () => ({
  HomeTreeProvider: class MockHomeTreeProvider {
    refresh = jest.fn();
  },
}));

jest.mock('@plugin/class/st-test-results-panel', () => ({
  StTestResultsPanel: class MockStTestResultsPanel {
    static setHistoryTreeProvider = jest.fn();
    static createOrShowHistorical = jest.fn(async () => undefined);
  },
}));

jest.mock('@plugin/class/st-test-run-history-tree-provider', () => {
  class MockStTestRunHistoryTreeProvider {
    static instances: MockStTestRunHistoryTreeProvider[] = [];
    getRecord = jest.fn(() => undefined);
    refresh = jest.fn();
    clear = jest.fn();
    setTreeView = jest.fn();
    dispose = jest.fn();

    constructor(public getWorkspaces: unknown) {
      MockStTestRunHistoryTreeProvider.instances.push(this);
    }
  }

  return { StTestRunHistoryTreeProvider: MockStTestRunHistoryTreeProvider };
});

jest.mock('@plugin/class/operate-tree-provider', () => {
  class MockOperateTreeProvider {
    static instances: MockOperateTreeProvider[] = [];
    static registerOperateFlowTreeProvider = jest.fn();
    refreshState = jest.fn(async () => ({
      showOperatorSearch: false,
      showOperatorProjects: false,
    }));
    isStandardCustomContext = jest.fn(() => false);
    hasMultipleOperators = jest.fn(() => false);
    getSearchKeyword = jest.fn(() => '');
    getAllOperatorsSelected = jest.fn(() => false);
    getPreparedAllSelected = jest.fn(() => false);
    setQueuedFlowStates = jest.fn();
    setCompileRunGateUiState = jest.fn();
    clearFlowExecutionState = jest.fn();
    setSanitizerResultsTreeView = jest.fn();
    setPerformanceResultsTreeView = jest.fn();
    onDidChangeTreeData = jest.fn(() => ({ dispose: jest.fn() }));
    onDidChangePerformanceTreeData = jest.fn(() => ({ dispose: jest.fn() }));
    getTreeItem = jest.fn((element: unknown) => element);
    getSanitizerTreeParent = jest.fn(() => undefined);
    getPerformanceTreeParent = jest.fn(() => undefined);
    resolveTreeItem = jest.fn(async (item: unknown) => item);
    getSanitizerResultsPanelNodes = jest.fn(() => []);
    getPerformanceResultsPanelNodes = jest.fn(() => []);
    getChildren = jest.fn(() => []);
    runFlowAction = jest.fn(async (_action: string, fn: ()=> Promise<void>) => {
      await fn();
    });
    selectPerformanceReport = jest.fn();
    getSelectedPerformanceReport = jest.fn(() => undefined);
    getSanitizerReportByPath = jest.fn(() => undefined);
    toggleSanitizerReportMark = jest.fn();
    isSanitizerMarkedOnlyEnabled = jest.fn(() => false);
    isSanitizerHideDuplicatesEnabled = jest.fn(() => false);
    isPerformanceMarkedOnlyEnabled = jest.fn(() => false);
    getSanitizerResultsGroupBy = jest.fn(() => 'type');
    selectSanitizerReport = jest.fn(async () => undefined);
    copySanitizerReportPath = jest.fn(async () => undefined);
    toggleSanitizerSortOrder = jest.fn();
    setSanitizerMarkedOnly = jest.fn();
    addSanitizerReportFromPath = jest.fn(async () => undefined);
    jumpToSanitizerMessage = jest.fn(async () => undefined);
    getSanitizerMessageAiFixIndex = jest.fn(() => undefined);
    setSanitizerResultsGroupBy = jest.fn();
    setSanitizerHideDuplicates = jest.fn();
    openSanitizerResultGroupFile = jest.fn(async () => undefined);
    flashSanitizerRunData = jest.fn(async () => undefined);
    refreshPerformanceReports = jest.fn(async () => undefined);
    copyPerformanceReportPath = jest.fn(async () => undefined);
    downloadPerformanceReport = jest.fn(async () => undefined);
    getPerformanceReportByKey = jest.fn(() => undefined);
    togglePerformanceReportMark = jest.fn(async () => undefined);
    setPerformanceMarkedOnly = jest.fn();
    openPerformanceFile = jest.fn(async () => undefined);
    togglePerformanceSortOrder = jest.fn();
    setSearchKeyword = jest.fn();
    toggleOperator = jest.fn(async () => undefined);
    selectAllOperators = jest.fn(async () => undefined);
    toggleCompiledAll = jest.fn(async () => undefined);
    togglePreparedAll = jest.fn(async () => undefined);

    constructor(public extensionUri: unknown, public mode: string, public context: unknown) {
      MockOperateTreeProvider.instances.push(this);
    }
  }

  return { OperateTreeProvider: MockOperateTreeProvider };
});

jest.mock('@plugin/core/api-server', () => {
  class MockApiServer {
    static instances: MockApiServer[] = [];
    addWebview = jest.fn();
    removeWebview = jest.fn();
    dispose = jest.fn();

    constructor(public apis: unknown) {
      MockApiServer.instances.push(this);
    }
  }

  return { ApiServer: MockApiServer };
});

jest.mock('@plugin/core/view/view-server', () => {
  class MockViewServer {
    static instances: MockViewServer[] = [];
    onViewActivated = jest.fn();
    onViewDisposed = jest.fn();
    dispose = jest.fn();

    constructor(public routes: unknown, public context: unknown) {
      MockViewServer.instances.push(this);
    }
  }

  return { ViewServer: MockViewServer };
});

jest.mock('@plugin/routes', () => ({ routes: [] }));

jest.mock('@plugin/api-routes', () => ({ apis: {} }));

jest.mock('@plugin/controller/home-controller', () => ({
  homeMethods: {
    getProjectType: jest.fn(async () => ({ projectType: '' })),
    getSelectedOperators: jest.fn(async () => undefined),
    getSelectedOperatorIds: jest.fn(async () => undefined),
    getSelectedOperatorEntries: jest.fn(async () => []),
    checkMultipleOperators: jest.fn(async () => ({
      isStandardCustom: false,
      operators: undefined,
    })),
    setSelectedOperators: jest.fn(async () => undefined),
    validatePyascForAnalysis: jest.fn(async () => ({ valid: true })),
    resolveDebugOperatorEntry: jest.fn(async () => undefined),
    resolveBuildExampleTargetFile: jest.fn(() => undefined),
  },
}));

jest.mock('@plugin/controller/task-controller', () => ({
  taskMethods: {
    runCpuDebug: jest.fn(async () => undefined),
    runDebug: jest.fn(async () => undefined),
    debugConfig: jest.fn(async () => undefined),
    importDumpTensorBinFile: jest.fn(async () => undefined),
  },
}));

jest.mock('@plugin/controller/st-test-controller', () => ({
  registerStTestControllerContext: jest.fn(),
  registerStTestOptionsPanelCloser: jest.fn(),
  stTestMethods: { ensureOptionsAvailable: jest.fn(async () => undefined) },
}));

jest.mock('@plugin/controller/performance-controller', () => ({ performanceDataMethods: { jumpToFile: jest.fn(async () => undefined) } }));

jest.mock('@plugin/core/project/project-manager', () => ({
  ProjectManager: {
    getInstance: jest.fn(() => ({
      projectPath: '',
      resetCachedProject: jest.fn(),
    })),
  },
}));

jest.mock('@plugin/service/sanitizer-diagnostics.service', () => ({ sanitizerDiagnosticsService: { activate: jest.fn() } }));

jest.mock('@plugin/service/performance-hints-diagnostics.service', () => ({
  ...jest.requireActual('@plugin/service/performance-hints-diagnostics.service'),
  performanceHintsDiagnosticsService: {
    activate: jest.fn(),
    clear: jest.fn(),
    clearIfOwns: jest.fn(),
    publishFromFile: jest.fn(async () => ({
      published: 0,
      failed: false,
    })),
    showPerformanceHintsForFile: jest.fn(async () => undefined),
  },
}));

jest.mock('@plugin/domain/utils/debug-target', () => ({ registerMsdebugTargetAutoAdapt: jest.fn() }));

jest.mock('@plugin/service/sanitizer-service', () => ({ sanitizerService: { captureActiveFileTargetForOptionsPanel: jest.fn(async () => true) } }));

jest.mock('@plugin/service/build-service', () => ({ buildService: { captureActiveFileTargetForOptionsPanel: jest.fn(async () => true) } }));

jest.mock('@plugin/service/ms-agent-bridge.service', () => ({
  msAgentBridgeService: {
    isMsAgentIntegrationAvailable: jest.fn(async () => true),
    fixMsAgentProblem: jest.fn(async () => undefined),
  },
}));

jest.mock('@plugin/class/dump-tensor-panel-view', () => ({
  getDumpTensorPanelViewProvider: jest.fn(() => ({
    dumpTensorPanelView: { dispose: jest.fn() },
    openDumpTensorDisposable: { dispose: jest.fn() },
    getWebview: jest.fn(() => mockDumpTensorWebview),
  })),
}));

jest.mock('@plugin/service/insight-service', () => ({
  insightService: {
    initializeInsightPathConfig: jest.fn(async () => undefined),
    initializeInsight: jest.fn(async () => undefined),
  },
}));

jest.mock('@plugin/helpers/main-config-watch', () => ({ createMainConfigWatcher: jest.fn(() => ({ dispose: jest.fn() })) }));

jest.mock('@plugin/helpers/post-activate-bootstrap', () => ({ startPostActivateBootstrap: jest.fn() }));

jest.mock('@plugin/domain/plugins', () => ({ registerOperatorPlugins: jest.fn() }));

jest.mock('@plugin/domain/utils/npu-hardware-probe', () => ({ startNpuHardwareProbe: jest.fn(async () => true) }));

jest.mock('@plugin/domain/plugins/operator-plugin.registry', () => ({ OperatorPluginRegistry: { isProjectTypeSupported: jest.fn(() => true) } }));

jest.mock('@plugin/domain/models/project-model', () => ({ getProjectByPath: jest.fn(() => undefined) }));

jest.mock('@plugin/domain/services/operator-project-detector', () => ({ OperatorProjectDetector: { detectOperatorProject: jest.fn(async () => ({ projectType: undefined })) } }));

jest.mock('@plugin/service/folder-context-menu-service', () => ({
  FolderContextMenuService: {
    checkIsOperatorProject: jest.fn(async () => ({
      isOperatorProject: true,
      isMultiProject: false,
      projectType: 'cann',
    })),
    markAsOperatorProject: jest.fn(async () => undefined),
    markAsMultiOperatorProject: jest.fn(async () => undefined),
    unmarkAsOperatorProject: jest.fn(async () => undefined),
    unmarkAsMultiOperatorProject: jest.fn(async () => undefined),
    buildOperatorProject: jest.fn(async () => undefined),
    runOperatorProject: jest.fn(async () => undefined),
    cpuDebugOperatorProject: jest.fn(async () => undefined),
    npuDebugOperatorProject: jest.fn(async () => undefined),
    cpuDebugConfigOperatorProject: jest.fn(async () => undefined),
    npuDebugConfigOperatorProject: jest.fn(async () => undefined),
    sanitizerOperatorProject: jest.fn(async () => undefined),
    onBoardOperatorProject: jest.fn(async () => undefined),
    simulationOperatorProject: jest.fn(async () => undefined),
    addReportToFileMapList: jest.fn(async () => undefined),
  },
}));

jest.mock('@plugin/service/config-service', () => ({
  configService: { checkDevtoolConfig: jest.fn(async () => false) },
  ConfigService: {
    writeOpDevtoolsDottedSettings: jest.fn(async () => false),
    // A5 new-tool switches default to false (non-A5 → legacy on-board/simulation flow).
    shouldUseNewOnBoardTool: jest.fn(() => false),
    shouldUseNewSimulationTool: jest.fn(() => false),
  },
}));

jest.mock('@plugin/service/config-reset-service', () => ({ resetCurrentProjectConfiguration: jest.fn(async () => undefined) }));

jest.mock('@plugin/service/settings-loader', () => ({ SettingsLoader: { read: jest.fn((_key: string, defaultValue: unknown) => defaultValue) } }));

jest.mock('@plugin/helpers/operator-project-workspace-config', () => ({ readWorkspaceProjectTypeSetting: jest.fn(() => undefined) }));

jest.mock('@plugin/service/project-service', () => ({ projectService: {} }));

jest.mock('@plugin/class/operator-project-icon-theme', () => {
  class MockOperatorProjectIconTheme {
    static getInstance = jest.fn(() => new MockOperatorProjectIconTheme());
    fireDecorationUpdate = jest.fn();
  }

  return { OperatorProjectIconTheme: MockOperatorProjectIconTheme };
});

jest.mock('@plugin/helpers/sidebar-context-refresh', () => ({ registerSidebarContextsRefresh: jest.fn() }));

jest.mock('@plugin/helpers/legacy-state-importer', () => ({ importLegacyWorkspaceState: jest.fn(async () => undefined) }));

jest.mock('@plugin/helpers/task-method-dispatch', () => ({
  dispatchStartBuild: jest.fn(async () => undefined),
  dispatchStartRun: jest.fn(async () => undefined),
  dispatchStartBuildExample: jest.fn(async () => undefined),
  dispatchRunSanitizer: jest.fn(async () => undefined),
  dispatchStartOnBoard: jest.fn(async () => undefined),
  dispatchStartSimulate: jest.fn(async () => undefined),
  dispatchStartUtTest: jest.fn(async () => undefined),
  dispatchStartDumpTensor: jest.fn(async () => undefined),
  dispatchEnqueueNativeOperatorAction: jest.fn(async () => undefined),
  dispatchGetOperatorActionQueueStatus: jest.fn(async () => ({ items: [] })),
  dispatchStopOperatorAction: jest.fn(async () => true),
  dispatchStopAllFlowActions: jest.fn(async () => undefined),
  dispatchStopCompileRunFlow: jest.fn(async () => true),
  dispatchStopTask: jest.fn(async () => undefined),
  isFlowStopAllVisible: jest.fn(async () => false),
  registerFlowPreemptListener: jest.fn((cb: ()=> void) => {
    mockFlowPreemptHandlers.push(cb);

    return jest.fn();
  }),
  subscribeCompileRunGateUiState: jest.fn((cb: (state: unknown)=> void) => {
    mockGateUiHandlers.push(cb);

    return jest.fn();
  }),
}));

jest.mock('@plugin/domain/utils/global-env-snapshot', () => ({ logGlobalEnvSnapshot: jest.fn() }));

import * as vscode from 'vscode';

import * as constants from '@plugin/constants';

import {
  CONTEXT_PREFIX,
  EXTENSION_ID,
  TREE_VIEW_HOME,
  TREE_VIEW_OPERATE,
  TREE_VIEW_OPERATOR_PROJECTS,
  TREE_VIEW_PERFORMANCE_RESULTS,
  TREE_VIEW_SANITIZER_RESULTS,
  TREE_VIEW_ST_TEST_HISTORY,
  contextKey,
  settingsKey,
  workbenchViewContainerCommand,
} from '@shared/flavor';
import {
  activate,
  deactivate,
} from '@plugin/extension';
import {
  configService,
  ConfigService,
} from '@plugin/service/config-service';
import { FolderContextMenuService } from '@plugin/service/folder-context-menu-service';
import { homeMethods } from '@plugin/controller/home-controller';
import { taskMethods } from '@plugin/controller/task-controller';
import {
  registerStTestControllerContext,
  registerStTestOptionsPanelCloser,
  stTestMethods,
} from '@plugin/controller/st-test-controller';
import { performanceDataMethods } from '@plugin/controller/performance-controller';
import { msAgentBridgeService } from '@plugin/service/ms-agent-bridge.service';
import { sanitizerService } from '@plugin/service/sanitizer-service';
import { buildService } from '@plugin/service/build-service';
import { resetCurrentProjectConfiguration } from '@plugin/service/config-reset-service';
import { SettingsLoader } from '@plugin/service/settings-loader';
import { importLegacyWorkspaceState } from '@plugin/helpers/legacy-state-importer';
import { getDumpTensorPanelViewProvider } from '@plugin/class/dump-tensor-panel-view';
import { startPostActivateBootstrap } from '@plugin/helpers/post-activate-bootstrap';
import { createMainConfigWatcher } from '@plugin/helpers/main-config-watch';
import { OperatorProjectDetector } from '@plugin/domain/services/operator-project-detector';
import { getProjectByPath } from '@plugin/domain/models/project-model';
import { OperatorProjectIconTheme } from '@plugin/class/operator-project-icon-theme';
import { WebviewProvider } from '@plugin/class/webview-provider';
import { StTestRunHistoryTreeProvider } from '@plugin/class/st-test-run-history-tree-provider';
import { StTestResultsPanel } from '@plugin/class/st-test-results-panel';
import { OperateTreeProvider } from '@plugin/class/operate-tree-provider';
import { ApiServer } from '@plugin/core/api-server';
import { ViewServer } from '@plugin/core/view/view-server';
import { registerOperatorPlugins } from '@plugin/domain/plugins';
import { OperatorPluginRegistry } from '@plugin/domain/plugins/operator-plugin.registry';
import { registerMsdebugTargetAutoAdapt } from '@plugin/domain/utils/debug-target';
import { sanitizerDiagnosticsService } from '@plugin/service/sanitizer-diagnostics.service';
import { insightService } from '@plugin/service/insight-service';
import { startNpuHardwareProbe } from '@plugin/domain/utils/npu-hardware-probe';
import { readWorkspaceProjectTypeSetting } from '@plugin/helpers/operator-project-workspace-config';
import { ProjectManager } from '@plugin/core/project/project-manager';
import { registerSidebarContextsRefresh } from '@plugin/helpers/sidebar-context-refresh';
import { handleOperatorProjectDirectoryFile } from '@plugin/class/webview-message-list';
import { CsvEditorProvider } from '@plugin/class/csv-editor-provider';
import * as taskDispatch from '@plugin/helpers/task-method-dispatch';

type MockOperateTreeProviderShape = {
  refreshState: jest.Mock;
  isStandardCustomContext: jest.Mock;
  hasMultipleOperators: jest.Mock;
  getSearchKeyword: jest.Mock;
  getAllOperatorsSelected: jest.Mock;
  getPreparedAllSelected: jest.Mock;
  setQueuedFlowStates: jest.Mock;
  setCompileRunGateUiState: jest.Mock;
  clearFlowExecutionState: jest.Mock;
  setSanitizerResultsTreeView: jest.Mock;
  setPerformanceResultsTreeView: jest.Mock;
  onDidChangeTreeData: jest.Mock;
  onDidChangePerformanceTreeData: jest.Mock;
  getTreeItem: jest.Mock;
  getSanitizerTreeParent: jest.Mock;
  getPerformanceTreeParent: jest.Mock;
  resolveTreeItem: jest.Mock;
  getSanitizerResultsPanelNodes: jest.Mock;
  getPerformanceResultsPanelNodes: jest.Mock;
  getChildren: jest.Mock;
  runFlowAction: jest.Mock;
  selectPerformanceReport: jest.Mock;
  getSelectedPerformanceReport: jest.Mock;
  getSanitizerReportByPath: jest.Mock;
  toggleSanitizerReportMark: jest.Mock;
  isSanitizerMarkedOnlyEnabled: jest.Mock;
  isSanitizerHideDuplicatesEnabled: jest.Mock;
  isPerformanceMarkedOnlyEnabled: jest.Mock;
  getSanitizerResultsGroupBy: jest.Mock;
  selectSanitizerReport: jest.Mock;
  copySanitizerReportPath: jest.Mock;
  toggleSanitizerSortOrder: jest.Mock;
  setSanitizerMarkedOnly: jest.Mock;
  addSanitizerReportFromPath: jest.Mock;
  jumpToSanitizerMessage: jest.Mock;
  getSanitizerMessageAiFixIndex: jest.Mock;
  setSanitizerResultsGroupBy: jest.Mock;
  setSanitizerHideDuplicates: jest.Mock;
  openSanitizerResultGroupFile: jest.Mock;
  flashSanitizerRunData: jest.Mock;
  refreshPerformanceReports: jest.Mock;
  copyPerformanceReportPath: jest.Mock;
  downloadPerformanceReport: jest.Mock;
  getPerformanceReportByKey: jest.Mock;
  togglePerformanceReportMark: jest.Mock;
  openPerformanceFile: jest.Mock;
  togglePerformanceSortOrder: jest.Mock;
  setSearchKeyword: jest.Mock;
  toggleOperator: jest.Mock;
  selectAllOperators: jest.Mock;
  toggleCompiledAll: jest.Mock;
  togglePreparedAll: jest.Mock;
};

const OperateTreeProviderMock = OperateTreeProvider as unknown as {
  instances: Array<MockOperateTreeProviderShape>;
  registerOperateFlowTreeProvider: jest.Mock;
};
const WebviewProviderMock = WebviewProvider as unknown as {
  instances: Array<{
    show: jest.Mock;
    postMessage: jest.Mock;
    dispose: jest.Mock;
  }>;
};
const ApiServerMock = ApiServer as unknown as { instances: Array<{ addWebview: jest.Mock;
  removeWebview: jest.Mock }> };
const ViewServerMock = ViewServer as unknown as {
  instances: Array<{ onViewActivated: jest.Mock;
    onViewDisposed: jest.Mock }>;
};
const StTestHistoryProviderMock = StTestRunHistoryTreeProvider as unknown as {
  instances: Array<{ getRecord: jest.Mock;
    refresh: jest.Mock;
    clear: jest.Mock;
    setTreeView: jest.Mock }>;
};

const flowProvider = (): MockOperateTreeProviderShape => OperateTreeProviderMock.instances[0];
const operatorProjectsProvider = (): MockOperateTreeProviderShape => OperateTreeProviderMock.instances[1];

type MockContext = {
  subscriptions: Array<{ dispose: ()=> unknown }>;
  globalState: { get: jest.Mock;
    update: jest.Mock };
  extensionUri: unknown;
  extension: { id: string;
    packageJSON: { version: string } };
};

const makeContext = (): MockContext => ({
  subscriptions: [],
  globalState: {
    get: jest.fn(() => undefined),
    update: jest.fn(async () => undefined),
  },
  extensionUri: vscode.Uri.file('/test/extension'),
  extension: {
    id: 'test.ext-id',
    packageJSON: { version: '1.0.0-test' },
  },
});

const invokeCommand = async (id: string, ...args: unknown[]): Promise<unknown> => {
  const handler = mockCommandHandlers.get(id);

  if (!handler) {
    throw new Error(`Command not registered: ${id}`);
  }

  return handler(...args);
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const refreshSidebar = (): (()=> Promise<void>) => {
  const calls = (registerSidebarContextsRefresh as jest.Mock).mock.calls;

  return calls[calls.length - 1][0] as ()=> Promise<void>;
};

const workspaceFolder = (root: string): { uri: { fsPath: string };
  name: string } => ({
  uri: { fsPath: root },
  name: 'ws',
});

describe('extension activation', () => {
  let context: MockContext;
  let tmpRoot: string;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockCommandHandlers.clear();
    mockTreeViews.clear();
    mockWorkspaceFoldersHandlers.length = 0;
    mockColorThemeHandlers.length = 0;
    mockWatcherState.create.length = 0;
    mockWatcherState.change.length = 0;
    mockWatcherState.delete.length = 0;
    mockGateUiHandlers.length = 0;
    mockFlowPreemptHandlers.length = 0;
    OperateTreeProviderMock.instances.length = 0;
    WebviewProviderMock.instances.length = 0;
    ApiServerMock.instances.length = 0;
    ViewServerMock.instances.length = 0;
    StTestHistoryProviderMock.instances.length = 0;
    (configService.checkDevtoolConfig as jest.Mock).mockResolvedValue(false);
    (ConfigService.writeOpDevtoolsDottedSettings as jest.Mock).mockResolvedValue(false);
    (SettingsLoader.read as jest.Mock).mockImplementation((_key: string, defaultValue: unknown) => defaultValue);
    (homeMethods.getSelectedOperatorIds as jest.Mock).mockResolvedValue(undefined);
    (homeMethods.getSelectedOperatorEntries as jest.Mock).mockResolvedValue([]);
    (homeMethods.checkMultipleOperators as jest.Mock).mockResolvedValue({
      isStandardCustom: false,
      operators: undefined,
    });
    (homeMethods.getProjectType as jest.Mock).mockResolvedValue({ projectType: '' });
    (homeMethods.validatePyascForAnalysis as jest.Mock).mockResolvedValue({ valid: true });
    (msAgentBridgeService.isMsAgentIntegrationAvailable as jest.Mock).mockResolvedValue(true);
    (sanitizerService.captureActiveFileTargetForOptionsPanel as jest.Mock).mockResolvedValue(true);
    (buildService.captureActiveFileTargetForOptionsPanel as jest.Mock).mockResolvedValue(true);
    (taskDispatch.dispatchGetOperatorActionQueueStatus as jest.Mock).mockResolvedValue({ items: [] });
    (taskDispatch.isFlowStopAllVisible as jest.Mock).mockResolvedValue(false);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({ projectType: undefined });
    (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock).mockReturnValue(true);
    (insightService.initializeInsight as jest.Mock).mockResolvedValue(undefined);
    (FolderContextMenuService.checkIsOperatorProject as jest.Mock).mockResolvedValue({
      isOperatorProject: true,
      isMultiProject: false,
      projectType: 'cann',
    });
    (getDumpTensorPanelViewProvider as jest.Mock).mockReturnValue({
      dumpTensorPanelView: { dispose: jest.fn() },
      openDumpTensorDisposable: { dispose: jest.fn() },
      getWebview: jest.fn(() => mockDumpTensorWebview),
    });
    (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
    (vscode.commands.getCommands as jest.Mock).mockResolvedValue([]);
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-activation-'));
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = [workspaceFolder(tmpRoot)];
    context = makeContext();
  });

  afterEach(() => {
    context.subscriptions.forEach((sub) => sub.dispose());
    jest.useRealTimers();
    fs.rmSync(tmpRoot, {
      recursive: true,
      force: true,
    });
  });

  const activateWith = async (): Promise<void> => {
    await activate(context as unknown as vscode.ExtensionContext);
  };

  it('boots the activation pipeline in order', async () => {
    await activateWith();

    expect(registerStTestControllerContext)
      .toHaveBeenCalledWith(context);
    expect((globalThis as unknown as { extensionContext: unknown }).extensionContext)
      .toBe(context);
    expect(registerOperatorPlugins)
      .toHaveBeenCalledTimes(1);
    expect(sanitizerDiagnosticsService.activate)
      .toHaveBeenCalledWith(context);
    expect(registerMsdebugTargetAutoAdapt)
      .toHaveBeenCalledWith(
        context,
        expect.any(Function),
        expect.any(Function),
      );
    expect(insightService.initializeInsightPathConfig)
      .toHaveBeenCalledWith(context);
    expect(insightService.initializeInsight)
      .toHaveBeenCalledWith(context);
    expect(startNpuHardwareProbe).not.toHaveBeenCalled();
    expect(OperateTreeProviderMock.registerOperateFlowTreeProvider)
      .toHaveBeenCalledWith(flowProvider());
    expect(StTestResultsPanel.setHistoryTreeProvider)
      .toHaveBeenCalledWith(StTestHistoryProviderMock.instances[0]);
    expect(startPostActivateBootstrap)
      .toHaveBeenCalledWith({
        context,
        operateTreeProvider: flowProvider(),
        logDebug: expect.any(Function),
      });
    expect(createMainConfigWatcher)
      .toHaveBeenCalledWith({
        projectService: {},
        operateTreeProvider: flowProvider(),
        operatorProjectsTreeProvider: operatorProjectsProvider(),
        logDebug: expect.any(Function),
        promptReloadWindow: expect.any(Function),
      });
    expect(importLegacyWorkspaceState)
      .toHaveBeenCalledWith('1.0.0-test', { targetProjectPath: tmpRoot });
    expect(context.subscriptions.length)
      .toBeGreaterThan(20);
  });

  it('falls back to the default plugin version when the extension descriptor is missing', async () => {
    context = {
      ...makeContext(),
      extension: undefined,
    } as unknown as MockContext;

    await activateWith();

    expect(importLegacyWorkspaceState)
      .toHaveBeenCalledWith('0.0.0', { targetProjectPath: tmpRoot });
  });

  it('opens the welcome page once for a fresh install and records the count', async () => {
    // Activation now focuses the view container via focusOpsOperateViewContainer(),
    // which resolves the first registered focus command — expose it so the helper
    // executes workbench.view.extension.<id> instead of skipping.
    (vscode.commands.getCommands as jest.Mock).mockResolvedValue([workbenchViewContainerCommand()]);

    await activateWith();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(constants.COMMAND_WELCOME);
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(workbenchViewContainerCommand());
    expect(context.globalState.update)
      .toHaveBeenCalledWith('welcomeShowCount', 1);
    expect(WebviewProviderMock.instances[1].show)
      .toHaveBeenCalledWith(constants.VIEW_WELCOME);
  });

  it('skips the welcome page when the count is already set', async () => {
    context.globalState.get.mockReturnValue(2);

    await activateWith();

    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(constants.COMMAND_WELCOME);
    expect(context.globalState.update).not.toHaveBeenCalled();
  });

  it('refreshes sidebar contexts without a devtool config on activation', async () => {
    await activateWith();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        contextKey('hasDevtoolConfig'),
        false,
      );
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.showHomeTree`,
        true,
      );
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.showOperateTree`,
        false,
      );
    expect(flowProvider().refreshState)
      .toHaveBeenCalledWith(false);
    expect(operatorProjectsProvider().refreshState)
      .toHaveBeenCalledWith(false);
    expect(StTestHistoryProviderMock.instances[0].clear)
      .toHaveBeenCalled();
    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledWith({});
  });

  it('shows the operate tree and ST test history for a supported devtool config', async () => {
    (configService.checkDevtoolConfig as jest.Mock).mockResolvedValue(true);
    (homeMethods.getProjectType as jest.Mock).mockResolvedValue({ projectType: 'standard-custom' });
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue('standard-custom');
    fs.mkdirSync(path.join(tmpRoot, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, '.vscode', 'devtool_config.json'), '{}');

    await activateWith();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        contextKey('hasDevtoolConfig'),
        true,
      );
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.showStTestHistory`,
        true,
      );
    expect(StTestHistoryProviderMock.instances[0].refresh)
      .toHaveBeenCalled();
    expect(flowProvider().isStandardCustomContext)
      .toHaveBeenCalled();
  });

  it('treats an unsupported project type as no devtool config', async () => {
    (configService.checkDevtoolConfig as jest.Mock).mockResolvedValue(true);
    (homeMethods.getProjectType as jest.Mock).mockResolvedValue({ projectType: 'pyasc' });
    (OperatorPluginRegistry.isProjectTypeSupported as jest.Mock).mockReturnValue(false);

    await activateWith();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        contextKey('hasDevtoolConfig'),
        false,
      );
  });

  it('falls back to the operator project detector for workspace type', async () => {
    (configService.checkDevtoolConfig as jest.Mock).mockResolvedValue(true);
    (readWorkspaceProjectTypeSetting as jest.Mock).mockReturnValue(undefined);
    (getProjectByPath as jest.Mock).mockReturnValue(undefined);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockResolvedValue({ projectType: 'standard-custom' });
    fs.mkdirSync(path.join(tmpRoot, '.vscode'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, '.vscode', 'devtool_config.json'), '{}');

    await activateWith();

    expect(OperatorProjectDetector.detectOperatorProject)
      .toHaveBeenCalledWith(tmpRoot);
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.showStTestHistory`,
        true,
      );
  });

  it('excludes the workspace when detection fails', async () => {
    (configService.checkDevtoolConfig as jest.Mock).mockResolvedValue(true);
    (OperatorProjectDetector.detectOperatorProject as jest.Mock).mockRejectedValue(new Error('probe failed'));

    await activateWith();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.showStTestHistory`,
        false,
      );
    expect(StTestHistoryProviderMock.instances[0].clear)
      .toHaveBeenCalled();
  });

  it('publishes the operator search and selection contexts', async () => {
    (configService.checkDevtoolConfig as jest.Mock).mockResolvedValue(true);

    await activateWith();

    flowProvider().refreshState.mockResolvedValue({
      showOperatorSearch: true,
      showOperatorProjects: true,
    });
    operatorProjectsProvider().getSearchKeyword.mockReturnValue('kernel');
    operatorProjectsProvider().getAllOperatorsSelected.mockReturnValue(true);
    operatorProjectsProvider().getPreparedAllSelected.mockReturnValue(true);
    await refreshSidebar()();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.showOperatorSearch`,
        true,
      );
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.operatorProjectsSearchActive`,
        true,
      );
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.allOperatorsSelected`,
        true,
      );
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.preparedAllSelected`,
        true,
      );
  });

  it('coalesces concurrent sidebar refreshes into two passes', async () => {
    await activateWith();
    const refresh = refreshSidebar();
    const first = refresh();
    const second = refresh();

    await Promise.all([
      first,
      second,
    ]);

    expect(ConfigService.writeOpDevtoolsDottedSettings)
      .toHaveBeenCalledTimes(2);
  });

  it('syncs the native queue state on the periodic timer', async () => {
    await activateWith();
    const queueStatus = taskDispatch.dispatchGetOperatorActionQueueStatus as jest.Mock;

    expect(queueStatus)
      .toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(queueStatus)
      .toHaveBeenCalledTimes(2);
    expect(flowProvider().setQueuedFlowStates)
      .toHaveBeenCalledWith({});
  });

  it('maps queued flow states by node id and skips unknown action types', async () => {
    await activateWith();
    (taskDispatch.dispatchGetOperatorActionQueueStatus as jest.Mock).mockResolvedValue({
      items: [
        {
          actionType: 'sanitizer',
          internalState: 'running',
        },
        {
          actionType: 'stTest',
          internalState: 'queued',
        },
        {
          actionType: 'unknown-action',
          internalState: 'running',
        },
      ],
    });

    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(flowProvider().setQueuedFlowStates)
      .toHaveBeenLastCalledWith({
        sanitizer: 'running',
        stTest: 'queued',
      });
  });

  it('disables the stop-all context when the queue status call fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    await activateWith();
    (taskDispatch.dispatchGetOperatorActionQueueStatus as jest.Mock).mockRejectedValueOnce(new Error('queue down'));

    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(warnSpy)
      .toHaveBeenCalled();
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.operatorActionQueueStopAllVisible`,
        false,
      );
  });

  it('routes compile-run gate and preempt notifications to the tree provider', async () => {
    await activateWith();

    mockGateUiHandlers[0]('running');
    expect(flowProvider().setCompileRunGateUiState)
      .toHaveBeenCalledWith('running');

    mockFlowPreemptHandlers[0]();
    expect(flowProvider().clearFlowExecutionState)
      .toHaveBeenCalled();
  });

  it('refreshes sidebar contexts on theme change', async () => {
    await activateWith();
    const before = (configService.checkDevtoolConfig as jest.Mock).mock.calls.length;

    await mockColorThemeHandlers[0]();

    expect((configService.checkDevtoolConfig as jest.Mock).mock.calls.length)
      .toBeGreaterThan(before);
  });

  it('refreshes sidebar contexts on devtool config watcher events', async () => {
    await activateWith();
    const watcherMock = vscode.workspace.createFileSystemWatcher as jest.Mock;
    const watcher = watcherMock.mock.results[0].value as {
      createHandlers: Array<(uri: { fsPath: string })=> Promise<void>>;
      changeHandlers: Array<(uri: { fsPath: string })=> Promise<void>>;
      deleteHandlers: Array<(uri: { fsPath: string })=> Promise<void>>;
    };

    expect(watcherMock)
      .toHaveBeenCalledWith('**/.vscode/devtool_config.json');

    await watcher.createHandlers[0]({ fsPath: tmpRoot });
    await watcher.changeHandlers[0]({ fsPath: tmpRoot });
    await watcher.deleteHandlers[0]({ fsPath: tmpRoot });

    expect((configService.checkDevtoolConfig as jest.Mock).mock.calls.length)
      .toBeGreaterThanOrEqual(4);
  });

  it('handles a workspace folder change with no open folders', async () => {
    (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = undefined;

    await activateWith();
    await mockWorkspaceFoldersHandlers[0]();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(constants.COMMAND_FLASH_MS_SANITIZER_RUN_DATA);
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(constants.COMMAND_FLASH_PERFORMANCE_RUN_DATA);
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(constants.COMMAND_FLASH_DUMP_TENSOR_DATA);
    expect(flowProvider().flashSanitizerRunData)
      .toHaveBeenCalled();
    expect((configService.checkDevtoolConfig as jest.Mock).mock.calls.length)
      .toBeGreaterThanOrEqual(2);
  });

  it('discards the cached project when the primary folder changed', async () => {
    await activateWith();
    const getInstance = ProjectManager.getInstance as jest.Mock;
    const resetCachedProject = jest.fn();

    getInstance.mockReturnValue({
      projectPath: '/some/other/workspace',
      resetCachedProject,
    });

    await mockWorkspaceFoldersHandlers[0]()
      .catch(() => undefined);

    expect(resetCachedProject)
      .toHaveBeenCalled();
  });

  it('keeps the cached project when the primary folder is unchanged', async () => {
    await activateWith();
    const getInstance = ProjectManager.getInstance as jest.Mock;
    const resetCachedProject = jest.fn();

    getInstance.mockReturnValue({
      projectPath: path.normalize(tmpRoot),
      resetCachedProject,
    });

    await mockWorkspaceFoldersHandlers[0]()
      .catch(() => undefined);

    expect(resetCachedProject).not.toHaveBeenCalled();
  });

  it('wires view activation and disposal into the api server', async () => {
    await activateWith();
    const viewServer = ViewServerMock.instances[0];
    const apiServer = ApiServerMock.instances[0];

    viewServer.onViewActivated.mock.calls[0][0]('panel-path', { id: 'webview-1' });
    expect(apiServer.addWebview)
      .toHaveBeenCalledWith('panel-path', { id: 'webview-1' });

    viewServer.onViewDisposed.mock.calls[0][0]('panel-path');
    expect(apiServer.removeWebview)
      .toHaveBeenCalledWith('panel-path');
  });

  it('creates all tree views and custom editor registrations', async () => {
    await activateWith();

    for (const viewId of [
      TREE_VIEW_HOME,
      TREE_VIEW_OPERATE,
      TREE_VIEW_SANITIZER_RESULTS,
      TREE_VIEW_PERFORMANCE_RESULTS,
      TREE_VIEW_ST_TEST_HISTORY,
      TREE_VIEW_OPERATOR_PROJECTS,
    ]) {
      expect(mockTreeViews.get(viewId))
        .toBeDefined();
    }

    expect(vscode.window.registerCustomEditorProvider)
      .toHaveBeenCalledWith(
        'test.csvEditor',
        expect.any(Object),
        {
          webviewOptions: { retainContextWhenHidden: true },
          supportsMultipleEditorsPerDocument: false,
        },
      );
    expect(vscode.window.registerCustomEditorProvider)
      .toHaveBeenCalledWith(
        'test.npuRepEditor',
        expect.any(Object),
        {
          supportsMultipleEditorsPerDocument: false,
          webviewOptions: { retainContextWhenHidden: true },
        },
      );
    expect(StTestHistoryProviderMock.instances[0].setTreeView)
      .toHaveBeenCalled();
  });

  it('delegates sanitizer panel provider calls to the operate tree', async () => {
    await activateWith();
    const view = mockTreeViews.get(TREE_VIEW_SANITIZER_RESULTS);
    const provider = (view?.options as { treeDataProvider: {
      getChildren: (element?: unknown)=> unknown;
      getTreeItem: (element: unknown)=> unknown;
      getParent: (element: unknown)=> unknown;
      resolveTreeItem: (item: unknown, element: unknown, token: unknown)=> unknown;
    } }).treeDataProvider;

    flowProvider().getSanitizerResultsPanelNodes.mockReturnValue(['root-node']);
    expect(provider.getChildren(undefined))
      .toEqual(['root-node']);

    flowProvider().getChildren.mockReturnValue(['report-child']);
    expect(provider.getChildren({ nodeId: 'sanitizerReportItem' }))
      .toEqual(['report-child']);
    expect(provider.getChildren({ nodeId: 'sanitizerClass' }))
      .toEqual(['report-child']);
    expect(provider.getChildren({ nodeId: 'other' }))
      .toEqual([]);

    expect(provider.getTreeItem({ id: 'x' }))
      .toEqual({ id: 'x' });
    expect(provider.getParent({ id: 'x' }))
      .toBeUndefined();

    flowProvider().resolveTreeItem.mockResolvedValue({ resolved: true });
    await expect(provider.resolveTreeItem({ id: 'x' }, { id: 'x' }, { isCancellationRequested: false }))
      .resolves
      .toEqual({ resolved: true });
  });

  it('delegates performance panel provider calls to the operate tree', async () => {
    await activateWith();
    const view = mockTreeViews.get(TREE_VIEW_PERFORMANCE_RESULTS);
    const provider = (view?.options as { treeDataProvider: { getChildren: (element?: unknown)=> unknown } }).treeDataProvider;

    flowProvider().getPerformanceResultsPanelNodes.mockReturnValue(['perf-root']);
    expect(provider.getChildren(undefined))
      .toEqual(['perf-root']);

    flowProvider().getChildren.mockReturnValue(['perf-child']);
    expect(provider.getChildren({ nodeId: 'performanceReportItem' }))
      .toEqual(['perf-child']);
    expect(provider.getChildren({ nodeId: 'performanceFolder' }))
      .toEqual(['perf-child']);
    expect(provider.getChildren({ nodeId: 'other' }))
      .toEqual([]);
  });

  it('selects a performance report from the tree selection', async () => {
    await activateWith();
    const view = mockTreeViews.get(TREE_VIEW_PERFORMANCE_RESULTS);
    const selectionHandler = view?.selectionHandlers[0];

    await selectionHandler!({
      selection: [
        {
          nodeId: 'performanceReportItem',
          id: 'performance-report:run%201',
        },
      ],
    });

    expect(flowProvider().selectPerformanceReport)
      .toHaveBeenCalledWith('run 1');
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.performanceReportSelected`,
        false,
      );
  });

  it('skips the selection handler for non-report nodes, empty selections and repeats', async () => {
    await activateWith();
    const view = mockTreeViews.get(TREE_VIEW_PERFORMANCE_RESULTS);
    const selectionHandler = view?.selectionHandlers[0];

    await selectionHandler!({ selection: [] });
    await selectionHandler!({ selection: [{ nodeId: 'someNode' }] });
    expect(flowProvider().selectPerformanceReport).not.toHaveBeenCalled();

    flowProvider().getSelectedPerformanceReport.mockReturnValue({ key: 'same' });
    await selectionHandler!({
      selection: [
        {
          nodeId: 'performanceReportItem',
          id: 'performance-report:same',
        },
      ],
    });

    expect(flowProvider().selectPerformanceReport).not.toHaveBeenCalled();
  });

  it('registers the initial sanitizer and performance contexts', async () => {
    await activateWith();

    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.sanitizerDuplicatesHidden`,
        false,
      );
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.sanitizerResultsGroupBy`,
        'type',
      );
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.sanitizerAiFixAvailable`,
        true,
      );
    expect(vscode.commands.executeCommand)
      .toHaveBeenCalledWith(
        'setContext',
        `${CONTEXT_PREFIX}.performanceReportSelected`,
        false,
      );
  });

  it('exposes an empty deactivate hook', () => {
    expect(deactivate())
      .toBeUndefined();
  });

  describe('basic command handlers', () => {
    it('opens the new-project webview', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_OPEN);

      expect(WebviewProviderMock.instances[0].show)
        .toHaveBeenCalledWith(constants.VIEW_NEW_PROJECT);
    });

    it('opens the native folder dialog', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_OPEN_PROJECT);

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith('workbench.action.files.openFolder');
    });

    it('warns when creating an operator project without an open workspace', async () => {
      await activateWith();
      (vscode.workspace as { workspaceFolders?: unknown }).workspaceFolders = undefined;

      await invokeCommand(constants.COMMAND_CREATE_OPERATOR_IN_WORKSPACE);

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalled();
    });

    it('creates an operator project at the workspace root', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_CREATE_OPERATOR_IN_WORKSPACE);
      jest.advanceTimersByTime(500);
      await flushPromises();

      expect(WebviewProviderMock.instances[0].show)
        .toHaveBeenCalledWith(constants.VIEW_NEW_PROJECT);
      expect(WebviewProviderMock.instances[0].postMessage)
        .toHaveBeenCalledWith({
          command: 'iframeSetProjectPath',
          data: tmpRoot,
        });
    });

    it('creates an operator project at the passed uri path', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_CREATE_OPERATOR_IN_WORKSPACE, vscode.Uri.file(path.join(tmpRoot, 'custom')));
      jest.advanceTimersByTime(500);
      await flushPromises();

      expect(WebviewProviderMock.instances[0].postMessage)
        .toHaveBeenCalledWith({
          command: 'iframeSetProjectPath',
          data: path.join(tmpRoot, 'custom'),
        });
    });

    it('focuses the plugin view container when the focus command exists', async () => {
      await activateWith();
      (vscode.commands.getCommands as jest.Mock).mockResolvedValue([workbenchViewContainerCommand()]);

      await invokeCommand(constants.COMMAND_TOGGLE_OPS_OPERATE);

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(workbenchViewContainerCommand());
    });

    it('warns when no focus command is registered', async () => {
      const warnSpy = jest.spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      await activateWith();
      (vscode.commands.getCommands as jest.Mock).mockResolvedValue([]);
      const callsBefore = (vscode.commands.executeCommand as jest.Mock).mock.calls.length;

      await invokeCommand(constants.COMMAND_TOGGLE_OPS_OPERATE);

      expect(warnSpy)
        .toHaveBeenCalled();
      // The handler must skip execution entirely — other activation paths also
      // call the container command, so compare call counts, not arguments.
      expect((vscode.commands.executeCommand as jest.Mock).mock.calls.length)
        .toBe(callsBefore);
    });

    it('swallows command listing failures', async () => {
      const logSpy = jest.spyOn(console, 'log')
        .mockImplementation(() => undefined);

      await activateWith();
      (vscode.commands.getCommands as jest.Mock).mockRejectedValue(new Error('list failed'));

      await invokeCommand(constants.COMMAND_TOGGLE_OPS_OPERATE);

      expect(logSpy)
        .toHaveBeenCalled();
    });

    it('warns when the st test history argument is not a string', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_ST_TEST_HISTORY_OPEN, 42);

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalled();
      expect(StTestHistoryProviderMock.instances[0].getRecord).not.toHaveBeenCalled();
    });

    it('warns when the st test history record is missing', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_ST_TEST_HISTORY_OPEN, 'missing-key');

      expect(StTestHistoryProviderMock.instances[0].getRecord)
        .toHaveBeenCalledWith('missing-key');
      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalled();
    });

    it('opens the st test history panel for a resolved record', async () => {
      const entry = {
        workspaceRoot: tmpRoot,
        record: {
          runId: 'r1',
          runDirectory: '/runs/r1',
        },
      };

      await activateWith();
      StTestHistoryProviderMock.instances[0].getRecord.mockReturnValue(entry);

      await invokeCommand(constants.COMMAND_ST_TEST_HISTORY_OPEN, 'key-1');

      expect(StTestResultsPanel.createOrShowHistorical)
        .toHaveBeenCalledWith(
          context,
          entry,
          expect.any(Function),
        );
    });

    it('warns when the st test history panel fails to open', async () => {
      await activateWith();
      StTestHistoryProviderMock.instances[0].getRecord.mockReturnValue({
        workspaceRoot: tmpRoot,
        record: {
          runId: 'r1',
          runDirectory: '/runs/r1',
        },
      });
      (StTestResultsPanel.createOrShowHistorical as jest.Mock).mockRejectedValue(new Error('panel boom'));

      await invokeCommand(constants.COMMAND_ST_TEST_HISTORY_OPEN, 'key-1');

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalled();
    });

    it('stringifies a non-Error st test history open failure', async () => {
      await activateWith();
      StTestHistoryProviderMock.instances[0].getRecord.mockReturnValue({
        workspaceRoot: tmpRoot,
        record: {
          runId: 'r1',
          runDirectory: '/runs/r1',
        },
      });
      (StTestResultsPanel.createOrShowHistorical as jest.Mock).mockRejectedValue('panel boom');

      await invokeCommand(constants.COMMAND_ST_TEST_HISTORY_OPEN, 'key-1');

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalled();
    });

    it('opens the welcome page', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_WELCOME);

      expect(WebviewProviderMock.instances[1].show)
        .toHaveBeenCalledWith(constants.VIEW_WELCOME);
    });

    it('clears the welcome counter', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_CLEAR_WELCOME_COUNT);

      expect(context.globalState.update)
        .toHaveBeenCalledWith('welcomeShowCount', undefined);
    });

    it('shows a toast for the legacy clear-project-path command', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_CLEAR_LAST_PROJECT_PATH);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
    });

    it('resets the project configuration', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_RESET_PROJECT_CONFIGURATION);

      expect(resetCurrentProjectConfiguration)
        .toHaveBeenCalledTimes(1);
    });

    it('forwards directory creation to the webview message handler', async () => {
      await activateWith();
      const data = { createOperatorProjectDirectoryFileType: 2 };
      const progress = { report: jest.fn() };

      await invokeCommand(constants.COMMAND_CREATE_DIRECTORY, data, progress);

      expect(handleOperatorProjectDirectoryFile)
        .toHaveBeenCalledWith(data, WebviewProviderMock.instances[0], progress);
    });

    it('returns the home directory from the get-home command', async () => {
      await activateWith();

      const result = await invokeCommand(constants.COMMAND_GET_HOME);

      expect(result)
        .toBe(process.env.HOME);
    });

    it('opens simulator options when the target capture succeeds', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIMULATOR_OPTIONS);

      expect(buildService.captureActiveFileTargetForOptionsPanel)
        .toHaveBeenCalledTimes(1);
      expect(WebviewProviderMock.instances[3].show)
        .toHaveBeenCalledWith(constants.VIEW_OPTIONS_SIMULATOR);
    });

    it('skips simulator options when the target capture fails', async () => {
      await activateWith();
      (buildService.captureActiveFileTargetForOptionsPanel as jest.Mock).mockResolvedValue(false);

      await invokeCommand(constants.COMMAND_SIMULATOR_OPTIONS);

      expect(WebviewProviderMock.instances[3].show).not.toHaveBeenCalled();
    });

    it('opens on-board options when the target capture succeeds', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_ON_BOARD_OPTIONS);

      expect(buildService.captureActiveFileTargetForOptionsPanel)
        .toHaveBeenCalledTimes(1);
      expect(WebviewProviderMock.instances[4].show)
        .toHaveBeenCalledWith(constants.VIEW_OPTIONS_ON_BOARD);
    });

    it('skips on-board options when the target capture fails', async () => {
      await activateWith();
      (buildService.captureActiveFileTargetForOptionsPanel as jest.Mock).mockResolvedValue(false);

      await invokeCommand(constants.COMMAND_ON_BOARD_OPTIONS);

      expect(WebviewProviderMock.instances[4].show).not.toHaveBeenCalled();
    });

    it('opens sanitizer options when the target capture succeeds', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SANITIZER_OPTIONS);

      expect(sanitizerService.captureActiveFileTargetForOptionsPanel)
        .toHaveBeenCalledTimes(1);
      expect(WebviewProviderMock.instances[5].show)
        .toHaveBeenCalledWith(constants.VIEW_OPTIONS_SANITIZER);
    });

    it('skips sanitizer options when the target capture fails', async () => {
      await activateWith();
      (sanitizerService.captureActiveFileTargetForOptionsPanel as jest.Mock).mockResolvedValue(false);

      await invokeCommand(constants.COMMAND_SANITIZER_OPTIONS);

      expect(WebviewProviderMock.instances[5].show).not.toHaveBeenCalled();
    });

    it('refreshes folder decorations from the sidebar command', async () => {
      await activateWith();
      const iconTheme = (OperatorProjectIconTheme.getInstance as jest.Mock).mock.results[0].value as { fireDecorationUpdate: jest.Mock };

      await invokeCommand(constants.COMMAND_REFRESH_FOLDER_DECORATIONS);

      expect(iconTheme.fireDecorationUpdate)
        .toHaveBeenCalled();
      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
    });

    it('opens the CSV picker and opens the chosen file with the custom editor', async () => {
      await activateWith();
      const csvUri = vscode.Uri.file(path.join(tmpRoot, 'data.csv'));

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([csvUri]);

      await invokeCommand(constants.COMMAND_OPEN_CSV);

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'vscode.openWith',
          csvUri,
          'test.csvEditor',
        );
    });

    it('does nothing when the CSV picker is cancelled', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_OPEN_CSV);

      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('vscode.openWith');
    });

    it('flashes sanitizer run data with the given options', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_FLASH_MS_SANITIZER_RUN_DATA, { openLatest: true });

      expect(flowProvider().flashSanitizerRunData)
        .toHaveBeenCalledWith({ openLatest: true });
    });

    it('flashes performance run data with the given options', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_FLASH_PERFORMANCE_RUN_DATA, { focusIfNew: true });

      expect(flowProvider().refreshPerformanceReports)
        .toHaveBeenCalledWith({ focusIfNew: true });
    });

    it('refreshes the dump tensor panel webview', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_FLASH_DUMP_TENSOR_DATA);

      expect(mockDumpTensorWebview.postMessage)
        .toHaveBeenCalledWith({ command: 'dumpTensorRefreshData' });
    });

    it('logs when the dump tensor webview is unavailable', async () => {
      const logSpy = jest.spyOn(console, 'log')
        .mockImplementation(() => undefined);

      await activateWith();
      const getWebview = (getDumpTensorPanelViewProvider as jest.Mock).mock.results[0].value.getWebview;

      getWebview.mockReturnValue(undefined);

      await invokeCommand(constants.COMMAND_FLASH_DUMP_TENSOR_DATA);

      expect(logSpy)
        .toHaveBeenCalled();
      expect(mockDumpTensorWebview.postMessage).not.toHaveBeenCalled();
    });

    it('imports a dump tensor bin file from a uri', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_IMPORT_DUMP_TENSOR_BIN_FILE, { fsPath: '/bin/file.bin' });

      expect(taskMethods.importDumpTensorBinFile)
        .toHaveBeenCalledWith({ binFilePath: '/bin/file.bin' });
    });

    it('ignores a uri-less dump tensor import', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_IMPORT_DUMP_TENSOR_BIN_FILE);

      expect(taskMethods.importDumpTensorBinFile).not.toHaveBeenCalled();
    });

    it('shows an error when the dump tensor import fails', async () => {
      await activateWith();
      (taskMethods.importDumpTensorBinFile as jest.Mock).mockRejectedValue(new Error('bad bin'));

      await invokeCommand(constants.COMMAND_IMPORT_DUMP_TENSOR_BIN_FILE, { fsPath: '/bin/file.bin' });

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalled();
    });
  });

  describe('sidebar flow commands', () => {
    it('runs a build flow for the selected operators', async () => {
      await activateWith();
      (homeMethods.getSelectedOperators as jest.Mock).mockResolvedValue(['op1']);
      (homeMethods.getSelectedOperatorIds as jest.Mock).mockResolvedValue(['1']);
      (homeMethods.checkMultipleOperators as jest.Mock).mockResolvedValue({
        isStandardCustom: true,
        operators: [
          {
            id: '1',
            isExperimental: true,
          },
        ],
      });

      await invokeCommand(constants.COMMAND_SIDEBAR_BUILD);

      expect(flowProvider().runFlowAction)
        .toHaveBeenCalledWith('build', expect.any(Function));
      expect(taskDispatch.dispatchStartBuild)
        .toHaveBeenCalledWith({
          operatorNames: ['op1'],
          compileOption: '--experimental',
        });
    });

    it('runs a plain run flow for single-operator contexts', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_RUN);

      expect(flowProvider().runFlowAction)
        .toHaveBeenCalledWith('run', expect.any(Function));
      expect(taskDispatch.dispatchStartRun)
        .toHaveBeenCalled();
      expect(taskDispatch.dispatchStartBuildExample).not.toHaveBeenCalled();
    });

    it('builds an example for multi-operator contexts', async () => {
      await activateWith();
      flowProvider().hasMultipleOperators.mockReturnValue(true);
      (homeMethods.getSelectedOperators as jest.Mock).mockResolvedValue(['op1']);

      await invokeCommand(constants.COMMAND_SIDEBAR_RUN);

      expect(taskDispatch.dispatchStartBuildExample)
        .toHaveBeenCalledWith({
          operatorNames: ['op1'],
          operatorType: undefined,
          compileOption: undefined,
        }, 'run');
    });

    it('builds an example with the standard-custom operator type', async () => {
      await activateWith();
      flowProvider().isStandardCustomContext.mockReturnValue(true);
      (homeMethods.getSelectedOperators as jest.Mock).mockResolvedValue(undefined);

      await invokeCommand(constants.COMMAND_SIDEBAR_RUN);

      expect(taskDispatch.dispatchStartBuildExample)
        .toHaveBeenCalledWith({
          operatorNames: undefined,
          operatorType: 'standard-custom',
          compileOption: undefined,
        }, 'run');
    });

    it('rejects cpu debug with multiple operators selected', async () => {
      await activateWith();
      (homeMethods.getSelectedOperatorIds as jest.Mock).mockResolvedValue([
        '1',
        '2',
      ]);

      await invokeCommand(constants.COMMAND_SIDEBAR_CPU_DEBUG);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
      expect(taskMethods.runCpuDebug).not.toHaveBeenCalled();
    });

    it('runs cpu debug for a single operator through the operator-action queue', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_CPU_DEBUG);

      expect(flowProvider().runFlowAction)
        .toHaveBeenCalledWith('cpuDebug', expect.any(Function));
      expect(taskDispatch.dispatchEnqueueNativeOperatorAction)
        .toHaveBeenCalledWith(
          'cpuDebug',
          {},
          expect.any(Function),
        );
    });

    it('rejects npu debug with multiple operators selected', async () => {
      await activateWith();
      (homeMethods.getSelectedOperatorIds as jest.Mock).mockResolvedValue([
        '1',
        '2',
      ]);

      await invokeCommand(constants.COMMAND_SIDEBAR_NPU_DEBUG);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
      expect(taskMethods.runDebug).not.toHaveBeenCalled();
    });

    it('runs npu debug for a single operator through the operator-action queue', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_NPU_DEBUG);

      expect(flowProvider().runFlowAction)
        .toHaveBeenCalledWith('npuDebug', expect.any(Function));
      expect(taskDispatch.dispatchEnqueueNativeOperatorAction)
        .toHaveBeenCalledWith(
          'npuDebug',
          {},
          expect.any(Function),
        );
    });

    it('routes the sidebar sanitizer action to the options panel when quick options are enabled', async () => {
      await activateWith();
      (SettingsLoader.read as jest.Mock).mockReturnValue(true);

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER);

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(constants.COMMAND_SANITIZER_OPTIONS);
      expect(WebviewProviderMock.instances[5].show)
        .toHaveBeenCalledWith(constants.VIEW_OPTIONS_SANITIZER);
    });

    it('enqueues a native sanitizer action when quick options are disabled', async () => {
      await activateWith();
      (SettingsLoader.read as jest.Mock).mockReturnValue(false);
      (homeMethods.getSelectedOperators as jest.Mock).mockResolvedValue(['op1']);

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER);

      expect(taskDispatch.dispatchEnqueueNativeOperatorAction)
        .toHaveBeenCalledWith(
          'sanitizer',
          { operatorNames: ['op1'] },
          taskDispatch.dispatchRunSanitizer,
        );
    });

    it('rejects the sidebar sanitizer action with multiple operators', async () => {
      await activateWith();
      (homeMethods.getSelectedOperatorIds as jest.Mock).mockResolvedValue([
        '1',
        '2',
      ]);

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
      expect(flowProvider().runFlowAction).not.toHaveBeenCalled();
    });

    it('routes the sidebar on-board action to the options panel when quick options are enabled', async () => {
      await activateWith();
      (SettingsLoader.read as jest.Mock).mockReturnValue(true);

      await invokeCommand(constants.COMMAND_SIDEBAR_ON_BOARD);

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(constants.COMMAND_ON_BOARD_OPTIONS);
      expect(WebviewProviderMock.instances[4].show)
        .toHaveBeenCalledWith(constants.VIEW_OPTIONS_ON_BOARD);
    });

    it('warns when the pyasc file is invalid for on-board analysis', async () => {
      await activateWith();
      (SettingsLoader.read as jest.Mock).mockReturnValue(false);
      (homeMethods.validatePyascForAnalysis as jest.Mock).mockResolvedValue({
        valid: false,
        message: 'no pyasc file',
      });

      await invokeCommand(constants.COMMAND_SIDEBAR_ON_BOARD);

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalledWith('no pyasc file');
      expect(taskDispatch.dispatchEnqueueNativeOperatorAction).not.toHaveBeenCalled();
    });

    it('falls back to the default warning when the pyasc check has no message', async () => {
      await activateWith();
      (SettingsLoader.read as jest.Mock).mockReturnValue(false);
      (homeMethods.validatePyascForAnalysis as jest.Mock).mockResolvedValue({ valid: false });

      await invokeCommand(constants.COMMAND_SIDEBAR_ON_BOARD);

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalled();
      expect(taskDispatch.dispatchEnqueueNativeOperatorAction).not.toHaveBeenCalled();
    });

    it('enqueues an on-board action and refreshes performance reports on completion', async () => {
      await activateWith();
      (SettingsLoader.read as jest.Mock).mockReturnValue(false);
      (homeMethods.getSelectedOperators as jest.Mock).mockResolvedValue(['op1']);

      await invokeCommand(constants.COMMAND_SIDEBAR_ON_BOARD);

      expect(taskDispatch.dispatchEnqueueNativeOperatorAction)
        .toHaveBeenCalledWith(
          'onboard',
          {
            operatorNames: ['op1'],
            compileOption: undefined,
          },
          taskDispatch.dispatchStartOnBoard,
          expect.any(Function),
        );
      const onComplete = (taskDispatch.dispatchEnqueueNativeOperatorAction as jest.Mock).mock.calls[0][3] as ()=> Promise<void>;

      await onComplete();

      expect(flowProvider().refreshPerformanceReports)
        .toHaveBeenCalledWith({ focusIfNew: true });
    });

    it('routes the sidebar simulation action to the options panel when quick options are enabled', async () => {
      await activateWith();
      (SettingsLoader.read as jest.Mock).mockReturnValue(true);

      await invokeCommand(constants.COMMAND_SIDEBAR_SIMULATION);

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(constants.COMMAND_SIMULATOR_OPTIONS);
      expect(WebviewProviderMock.instances[3].show)
        .toHaveBeenCalledWith(constants.VIEW_OPTIONS_SIMULATOR);
    });

    it('warns when the pyasc file is invalid for simulation', async () => {
      await activateWith();
      (SettingsLoader.read as jest.Mock).mockReturnValue(false);
      (homeMethods.validatePyascForAnalysis as jest.Mock).mockResolvedValue({ valid: false });

      await invokeCommand(constants.COMMAND_SIDEBAR_SIMULATION);

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalled();
      expect(taskDispatch.dispatchEnqueueNativeOperatorAction).not.toHaveBeenCalled();
    });

    it('enqueues a simulation action and refreshes performance reports on completion', async () => {
      await activateWith();
      (SettingsLoader.read as jest.Mock).mockReturnValue(false);
      (homeMethods.getSelectedOperators as jest.Mock).mockResolvedValue(undefined);

      await invokeCommand(constants.COMMAND_SIDEBAR_SIMULATION);

      expect(taskDispatch.dispatchEnqueueNativeOperatorAction)
        .toHaveBeenCalledWith(
          'simulation',
          {
            operatorNames: undefined,
            compileOption: undefined,
          },
          taskDispatch.dispatchStartSimulate,
          expect.any(Function),
        );
      const onComplete = (taskDispatch.dispatchEnqueueNativeOperatorAction as jest.Mock).mock.calls[0][3] as ()=> Promise<void>;

      await onComplete();

      expect(flowProvider().refreshPerformanceReports)
        .toHaveBeenCalledWith({ focusIfNew: true });
    });

    it('enqueues a ut-test action', async () => {
      await activateWith();
      (homeMethods.getSelectedOperators as jest.Mock).mockResolvedValue(['op1']);

      await invokeCommand(constants.COMMAND_SIDEBAR_UT_TEST);

      expect(taskDispatch.dispatchEnqueueNativeOperatorAction)
        .toHaveBeenCalledWith(
          'utTest',
          {
            operatorNames: ['op1'],
            compileOption: undefined,
          },
          taskDispatch.dispatchStartUtTest,
        );
    });

    it('rejects ut-test with multiple operators', async () => {
      await activateWith();
      (homeMethods.getSelectedOperatorIds as jest.Mock).mockResolvedValue([
        '1',
        '2',
      ]);

      await invokeCommand(constants.COMMAND_SIDEBAR_UT_TEST);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
    });

    it('requires a standard-custom context for st-test', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_ST_TEST);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
      expect(WebviewProviderMock.instances[2].show).not.toHaveBeenCalled();
    });

    it('requires exactly one operator for st-test', async () => {
      await activateWith();
      flowProvider().isStandardCustomContext.mockReturnValue(true);
      (homeMethods.getSelectedOperatorEntries as jest.Mock).mockResolvedValue([]);

      await invokeCommand(constants.COMMAND_SIDEBAR_ST_TEST);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
      expect(WebviewProviderMock.instances[2].show).not.toHaveBeenCalled();
    });

    it('opens the st-test options panel for a single operator', async () => {
      await activateWith();
      flowProvider().isStandardCustomContext.mockReturnValue(true);
      (homeMethods.getSelectedOperatorEntries as jest.Mock).mockResolvedValue([{ name: 'op1' }]);

      await invokeCommand(constants.COMMAND_SIDEBAR_ST_TEST);

      expect(WebviewProviderMock.instances[2].show)
        .toHaveBeenCalledWith(constants.VIEW_OPTIONS_ST_TEST);
    });

    it('shows a message when st-test options are unavailable', async () => {
      await activateWith();
      flowProvider().isStandardCustomContext.mockReturnValue(true);
      (homeMethods.getSelectedOperatorEntries as jest.Mock).mockResolvedValue([{ name: 'op1' }]);
      (stTestMethods.ensureOptionsAvailable as jest.Mock).mockRejectedValue(new Error('no options'));

      await invokeCommand(constants.COMMAND_SIDEBAR_ST_TEST);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('no options');
      expect(WebviewProviderMock.instances[2].show).not.toHaveBeenCalled();
    });

    it('stringifies a non-Error st-test options failure', async () => {
      await activateWith();
      flowProvider().isStandardCustomContext.mockReturnValue(true);
      (homeMethods.getSelectedOperatorEntries as jest.Mock).mockResolvedValue([{ name: 'op1' }]);
      (stTestMethods.ensureOptionsAvailable as jest.Mock).mockRejectedValue('no options');

      await invokeCommand(constants.COMMAND_SIDEBAR_ST_TEST);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledWith('no options');
      expect(WebviewProviderMock.instances[2].show).not.toHaveBeenCalled();
    });

    it('enqueues a dump-tensor action', async () => {
      await activateWith();
      (homeMethods.getSelectedOperators as jest.Mock).mockResolvedValue(['op1']);

      await invokeCommand(constants.COMMAND_SIDEBAR_DUMP_TENSOR);

      expect(taskDispatch.dispatchEnqueueNativeOperatorAction)
        .toHaveBeenCalledWith(
          'dumpTensor',
          {
            operatorNames: ['op1'],
            compileOption: undefined,
          },
          taskDispatch.dispatchStartDumpTensor,
        );
    });

    it('opens the debug settings flow', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_DEBUG_SETTINGS);

      expect(flowProvider().runFlowAction)
        .toHaveBeenCalledWith(
          'debug',
          expect.any(Function),
          {
            skipEnvironmentScriptCheck: true,
            skipFlowExecutionUi: true,
          },
        );
      expect(taskMethods.debugConfig)
        .toHaveBeenCalled();
    });

    it('opens the sanitizer settings flow', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_SETTINGS);

      expect(flowProvider().runFlowAction)
        .toHaveBeenCalledWith(
          'sanitizer',
          expect.any(Function),
          {
            skipEnvironmentScriptCheck: true,
            skipFlowExecutionUi: true,
          },
        );
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'workbench.action.openWorkspaceSettings',
          `@ext:${EXTENSION_ID} ${settingsKey('sanitizer')}`,
        );
    });

    it('opens the on-board settings flow', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_ON_BOARD_SETTINGS);

      expect(flowProvider().runFlowAction)
        .toHaveBeenCalledWith(
          'onboard',
          expect.any(Function),
          {
            skipEnvironmentScriptCheck: true,
            skipFlowExecutionUi: true,
          },
        );
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'workbench.action.openWorkspaceSettings',
          `@ext:${EXTENSION_ID} ${settingsKey('performanceTuning.onBoard')}`,
        );
    });

    it('opens the simulation settings flow', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SIMULATION_SETTINGS);

      expect(flowProvider().runFlowAction)
        .toHaveBeenCalledWith(
          'simulation',
          expect.any(Function),
          {
            skipEnvironmentScriptCheck: true,
            skipFlowExecutionUi: true,
          },
        );
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'workbench.action.openWorkspaceSettings',
          `@ext:${EXTENSION_ID} ${settingsKey('performanceTuning.simulation')}`,
        );
    });

    it('opens the workspace settings for the extension', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_PROJECT_CONFIG);

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'workbench.action.openWorkspaceSettings',
          '@ext:test.ext-id',
        );
    });

    it('resets the sidebar project configuration', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_RESET_PROJECT_CONFIGURATION);

      expect(resetCurrentProjectConfiguration)
        .toHaveBeenCalledTimes(1);
    });

    it('opens the welcome page from the sidebar', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_OPEN_WELCOME);

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(constants.COMMAND_WELCOME);
      expect(WebviewProviderMock.instances[1].show)
        .toHaveBeenCalledWith(constants.VIEW_WELCOME);
    });

    it('opens the help link in the external browser', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_OPEN_HELP);

      expect(vscode.env.openExternal)
        .toHaveBeenCalledWith(vscode.Uri.parse('https://gitcode.com/opdevtools/plugin_release'));
    });
  });

  describe('sidebar operator selection commands', () => {
    it('shows a hint when the workspace is not standard-custom', async () => {
      await activateWith();
      (homeMethods.checkMultipleOperators as jest.Mock).mockResolvedValue({
        isStandardCustom: false,
        operators: undefined,
      });

      await invokeCommand(constants.COMMAND_SIDEBAR_SELECT_OPERATORS);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
      expect(homeMethods.setSelectedOperators).not.toHaveBeenCalled();
    });

    it('shows a hint when no operators exist', async () => {
      await activateWith();
      (homeMethods.checkMultipleOperators as jest.Mock).mockResolvedValue({
        isStandardCustom: true,
        operators: [],
      });

      await invokeCommand(constants.COMMAND_SIDEBAR_SELECT_OPERATORS);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
    });

    it('does nothing when the quick pick is cancelled', async () => {
      await activateWith();
      (homeMethods.checkMultipleOperators as jest.Mock).mockResolvedValue({
        isStandardCustom: true,
        operators: [
          {
            id: 1,
            name: 'A',
            isExperimental: false,
          },
        ],
      });
      (homeMethods.getSelectedOperatorIds as jest.Mock).mockResolvedValue([1]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      await invokeCommand(constants.COMMAND_SIDEBAR_SELECT_OPERATORS);

      expect(homeMethods.setSelectedOperators).not.toHaveBeenCalled();
    });

    it('rejects mixing experimental and stable operators', async () => {
      await activateWith();
      (homeMethods.checkMultipleOperators as jest.Mock).mockResolvedValue({
        isStandardCustom: true,
        operators: [
          {
            id: 1,
            name: 'A',
            isExperimental: false,
          },
          {
            id: 2,
            name: 'B',
            isExperimental: true,
          },
        ],
      });
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue([
        {
          operator: {
            id: 1,
            isExperimental: false,
          },
        },
        {
          operator: {
            id: 2,
            isExperimental: true,
          },
        },
      ]);

      await invokeCommand(constants.COMMAND_SIDEBAR_SELECT_OPERATORS);

      expect(vscode.window.showWarningMessage)
        .toHaveBeenCalled();
      expect(homeMethods.setSelectedOperators).not.toHaveBeenCalled();
    });

    it('persists the chosen operators and refreshes the sidebar', async () => {
      await activateWith();
      (homeMethods.checkMultipleOperators as jest.Mock).mockResolvedValue({
        isStandardCustom: true,
        operators: [
          {
            id: 1,
            name: 'A',
            isExperimental: false,
          },
          {
            id: 2,
            name: 'B',
            isExperimental: false,
          },
        ],
      });
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue([
        {
          operator: {
            id: 1,
            isExperimental: false,
          },
        },
      ]);

      await invokeCommand(constants.COMMAND_SIDEBAR_SELECT_OPERATORS);

      expect(homeMethods.setSelectedOperators)
        .toHaveBeenCalledWith({ operatorIds: [1] });
      expect(ConfigService.writeOpDevtoolsDottedSettings)
        .toHaveBeenCalled();
    });

    it('clears the selected operators and refreshes', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_CLEAR_SELECTED_OPERATORS);

      expect(homeMethods.setSelectedOperators)
        .toHaveBeenCalledWith({ operatorIds: [] });
    });

    it('applies the searched keyword when the input box returns a value', async () => {
      await activateWith();
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('kernel');

      await invokeCommand(constants.COMMAND_SIDEBAR_SEARCH_OPERATORS);

      expect(operatorProjectsProvider().setSearchKeyword)
        .toHaveBeenCalledWith('kernel');
      expect(ConfigService.writeOpDevtoolsDottedSettings)
        .toHaveBeenCalled();
    });

    it('keeps the keyword unchanged when the input box is cancelled', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SEARCH_OPERATORS);

      expect(operatorProjectsProvider().setSearchKeyword).not.toHaveBeenCalled();
    });

    it('clears the operator projects search', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_CLEAR_OPERATOR_PROJECTS_SEARCH);

      expect(operatorProjectsProvider().setSearchKeyword)
        .toHaveBeenCalledWith('');
    });

    it('toggles a single operator', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_TOGGLE_OPERATOR, 3);

      expect(operatorProjectsProvider().toggleOperator)
        .toHaveBeenCalledWith(3);
    });

    it('selects all operators', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SELECT_ALL_OPERATORS);

      expect(operatorProjectsProvider().selectAllOperators)
        .toHaveBeenCalled();
    });

    it('selects all compiled operators', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SELECT_ALL_COMPILED_OPERATORS);

      expect(operatorProjectsProvider().toggleCompiledAll)
        .toHaveBeenCalled();
    });

    it('selects and deselects all prepared operators', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SELECT_ALL_PREPARED_OPERATORS);
      await invokeCommand(constants.COMMAND_SIDEBAR_DESELECT_ALL_PREPARED_OPERATORS);

      expect(operatorProjectsProvider().togglePreparedAll)
        .toHaveBeenCalledTimes(2);
    });

    it('stops a queued flow action by node id', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_STOP_FLOW_TASK, { nodeId: 'sanitizer' });

      expect(taskDispatch.dispatchStopOperatorAction)
        .toHaveBeenCalledWith({ actionType: 'sanitizer' });
    });

    it('stops a compile-run flow for build and run nodes', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_STOP_FLOW_TASK, { nodeId: 'run' });

      expect(taskDispatch.dispatchStopCompileRunFlow)
        .toHaveBeenCalledWith({ nodeId: 'run' });
      expect(flowProvider().clearFlowExecutionState)
        .toHaveBeenCalled();
    });

    it('stops the generic task for unknown nodes', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_STOP_FLOW_TASK, { nodeId: 'mystery' });

      expect(taskDispatch.dispatchStopTask)
        .toHaveBeenCalled();
      expect(flowProvider().clearFlowExecutionState)
        .toHaveBeenCalled();
    });

    it('stops the generic task without a node argument', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_STOP_FLOW_TASK);

      expect(taskDispatch.dispatchStopTask)
        .toHaveBeenCalled();
    });

    it('stops all operator actions', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_STOP_ALL_OPERATOR_ACTIONS);

      expect(taskDispatch.dispatchStopAllFlowActions)
        .toHaveBeenCalled();
      expect(flowProvider().clearFlowExecutionState)
        .toHaveBeenCalled();
    });
  });

  describe('sidebar sanitizer report commands', () => {
    it('selects a sanitizer report', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_SELECT, '/reports/san.log');

      expect(flowProvider().selectSanitizerReport)
        .toHaveBeenCalledWith('/reports/san.log');
    });

    it('copies a sanitizer report path from a raw string', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_COPY_PATH, '/reports/san.log');

      expect(flowProvider().copySanitizerReportPath)
        .toHaveBeenCalledWith('/reports/san.log');
    });

    it('copies a sanitizer report path from a prefixed id', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_COPY_PATH, 'sanitizer-report:/reports/san%20a.log');

      expect(flowProvider().copySanitizerReportPath)
        .toHaveBeenCalledWith('/reports/san a.log');
    });

    it('skips copying an empty sanitizer report path', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_COPY_PATH, '');

      expect(flowProvider().copySanitizerReportPath).not.toHaveBeenCalled();
    });

    it('toggles the sanitizer report mark', async () => {
      await activateWith();
      flowProvider().getSanitizerReportByPath.mockReturnValue({ id: 7 });

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_TOGGLE_MARK, '/reports/san.log');

      expect(flowProvider().toggleSanitizerReportMark)
        .toHaveBeenCalledWith(7);
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          `${CONTEXT_PREFIX}.sanitizerMarkedOnly`,
          false,
        );
    });

    it('skips marking an unknown sanitizer report', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_TOGGLE_MARK, '/reports/missing.log');

      expect(flowProvider().toggleSanitizerReportMark).not.toHaveBeenCalled();
    });

    it('marks and unmarks a sanitizer report', async () => {
      await activateWith();
      flowProvider().getSanitizerReportByPath.mockReturnValue({ id: 7 });

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_MARK, '/reports/san.log');
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_UNMARK, '/reports/san.log');

      expect(flowProvider().toggleSanitizerReportMark)
        .toHaveBeenCalledTimes(2);
    });

    it('skips marking an unknown sanitizer report in mark and unmark', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_MARK, 'sanitizer-report:/reports/missing.log');
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_UNMARK, 'sanitizer-report:/reports/missing.log');

      expect(flowProvider().toggleSanitizerReportMark).not.toHaveBeenCalled();
    });

    it('resolves non-string arguments in the sanitizer copy command', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_COPY_PATH, { command: { arguments: ['x'] } });
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_COPY_PATH, {
        command: { arguments: [undefined] },
        id: 'y',
      });
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_COPY_PATH, {});

      expect(flowProvider().copySanitizerReportPath)
        .toHaveBeenCalledWith('x');
      expect(flowProvider().copySanitizerReportPath)
        .toHaveBeenCalledWith('y');
      expect(flowProvider().copySanitizerReportPath)
        .toHaveBeenCalledTimes(2);
    });

    it('resolves non-string arguments in the sanitizer toggle-mark command', async () => {
      await activateWith();
      flowProvider().getSanitizerReportByPath.mockReturnValue({ id: 7 });

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_TOGGLE_MARK, { command: { arguments: ['sanitizer-report:/r/san.log'] } });
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_TOGGLE_MARK, {
        command: { arguments: [undefined] },
        id: 'y',
      });
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_TOGGLE_MARK, {});

      expect(flowProvider().toggleSanitizerReportMark)
        .toHaveBeenCalledTimes(2);
      expect(flowProvider().toggleSanitizerReportMark)
        .toHaveBeenCalledWith(7);
    });

    it('resolves non-string arguments in the sanitizer mark command', async () => {
      await activateWith();
      flowProvider().getSanitizerReportByPath.mockReturnValue({ id: 7 });

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_MARK, { command: { arguments: ['x'] } });
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_MARK, {
        command: { arguments: [undefined] },
        id: 'y',
      });
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_MARK, {});

      expect(flowProvider().toggleSanitizerReportMark)
        .toHaveBeenCalledTimes(2);
    });

    it('resolves non-string arguments in the sanitizer unmark command', async () => {
      await activateWith();
      flowProvider().getSanitizerReportByPath.mockReturnValue({ id: 7 });

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_UNMARK, { command: { arguments: ['x'] } });
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_UNMARK, {
        command: { arguments: [undefined] },
        id: 'y',
      });
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_UNMARK, {});

      expect(flowProvider().toggleSanitizerReportMark)
        .toHaveBeenCalledTimes(2);
    });

    it('toggles the sanitizer sort order', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_SORT_TIME);

      expect(flowProvider().toggleSanitizerSortOrder)
        .toHaveBeenCalled();
    });

    it('filters marked sanitizer reports', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_FILTER_MARKED);

      expect(flowProvider().setSanitizerMarkedOnly)
        .toHaveBeenCalledWith(true);
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          `${CONTEXT_PREFIX}.sanitizerMarkedOnly`,
          true,
        );
    });

    it('shows all sanitizer reports', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_SHOW_ALL);

      expect(flowProvider().setSanitizerMarkedOnly)
        .toHaveBeenCalledWith(false);
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          `${CONTEXT_PREFIX}.sanitizerMarkedOnly`,
          false,
        );
    });

    it('adds a picked sanitizer report under progress', async () => {
      await activateWith();
      const reportUri = vscode.Uri.file('/reports/san.log');

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([reportUri]);

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_ADD);

      expect(vscode.window.withProgress)
        .toHaveBeenCalled();
      expect(flowProvider().addSanitizerReportFromPath)
        .toHaveBeenCalledWith('/reports/san.log');
    });

    it('skips adding a sanitizer report when the dialog is cancelled', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_ADD);

      expect(flowProvider().addSanitizerReportFromPath).not.toHaveBeenCalled();
    });

    it('jumps to a sanitizer message', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_MESSAGE_JUMP, 'msg-1');

      expect(flowProvider().jumpToSanitizerMessage)
        .toHaveBeenCalledWith('msg-1');
    });

    it('skips the AI fix when the agent integration is unavailable', async () => {
      await activateWith();
      (msAgentBridgeService.isMsAgentIntegrationAvailable as jest.Mock).mockResolvedValue(false);

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_MESSAGE_AI_FIX, { id: 'x' });

      expect(msAgentBridgeService.fixMsAgentProblem).not.toHaveBeenCalled();
    });

    it('skips the AI fix when no fix index is resolved', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_MESSAGE_AI_FIX, { id: 'x' });

      expect(msAgentBridgeService.fixMsAgentProblem).not.toHaveBeenCalled();
    });

    it('forwards the AI fix index to the agent bridge', async () => {
      await activateWith();
      flowProvider().getSanitizerMessageAiFixIndex.mockReturnValue(3);

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_MESSAGE_AI_FIX, { id: 'x' });

      expect(msAgentBridgeService.fixMsAgentProblem)
        .toHaveBeenCalledWith(3);
    });

    it('jumps to a file from the sanitizer stack', async () => {
      await activateWith();
      const params = {
        fileLink: '/a/b.cpp',
        row: 12,
        col: 3,
      };

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_STACK_JUMP, params);

      expect(performanceDataMethods.jumpToFile)
        .toHaveBeenCalledWith(params);
    });

    it('groups sanitizer results by class, severity, type and file', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_CLASS);
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_CLASS_ACTIVE);
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_SEVERITY);
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_SEVERITY_ACTIVE);
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_TYPE);
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_TYPE_ACTIVE);
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_FILE);
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_GROUP_BY_FILE_ACTIVE);

      expect(flowProvider().setSanitizerResultsGroupBy)
        .toHaveBeenCalledWith('class');
      expect(flowProvider().setSanitizerResultsGroupBy)
        .toHaveBeenCalledWith('severity');
      expect(flowProvider().setSanitizerResultsGroupBy)
        .toHaveBeenCalledWith('type');
      expect(flowProvider().setSanitizerResultsGroupBy)
        .toHaveBeenCalledWith('file');
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          `${CONTEXT_PREFIX}.sanitizerResultsGroupBy`,
          'file',
        );
    });

    it('hides and shows duplicate sanitizer messages', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_HIDE_DUPLICATES);
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_SHOW_DUPLICATES);

      expect(flowProvider().setSanitizerHideDuplicates)
        .toHaveBeenCalledWith(true);
      expect(flowProvider().setSanitizerHideDuplicates)
        .toHaveBeenCalledWith(false);
    });

    it('opens a grouped file from a sanitizer report', async () => {
      await activateWith();

      await invokeCommand(
        constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_OPEN_GROUP_FILE,
        'sanitizer-report-group:/reports/san.log:file:/src/a%2Fb.cpp',
      );

      expect(flowProvider().openSanitizerResultGroupFile)
        .toHaveBeenCalledWith('/src/a/b.cpp');
    });

    it('ignores malformed group-file arguments', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_OPEN_GROUP_FILE, 'plain-string');
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_OPEN_GROUP_FILE, 'sanitizer-report-group:/a:other:/b');
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_OPEN_GROUP_FILE, 'sanitizer-report-group:/a:file:');

      expect(flowProvider().openSanitizerResultGroupFile).not.toHaveBeenCalled();
    });

    it('opens a grouped file from a non-string argument', async () => {
      await activateWith();

      await invokeCommand(
        constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_OPEN_GROUP_FILE,
        { id: 'sanitizer-report-group::file:groupKey' },
      );

      expect(flowProvider().openSanitizerResultGroupFile)
        .toHaveBeenCalledWith('groupKey');
    });

    it('ignores an empty non-string group-file argument', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_RESULTS_OPEN_GROUP_FILE, {});

      expect(flowProvider().openSanitizerResultGroupFile).not.toHaveBeenCalled();
    });
  });

  describe('sidebar performance report commands', () => {
    it('selects a performance report and publishes the marked context', async () => {
      await activateWith();
      flowProvider().getSelectedPerformanceReport.mockReturnValue({
        key: 'run-1',
        marked: true,
      });

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_SELECT, 'run-1');

      expect(flowProvider().selectPerformanceReport)
        .toHaveBeenCalledWith('run-1');
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          `${CONTEXT_PREFIX}.performanceReportSelected`,
          true,
        );
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          `${CONTEXT_PREFIX}.performanceSelectedReportMarked`,
          true,
        );
    });

    it('copies a performance report path from a prefixed id', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_COPY_PATH, 'performance-report:/reports/perf%20x.log');

      expect(flowProvider().copyPerformanceReportPath)
        .toHaveBeenCalledWith('/reports/perf x.log');
    });

    it('copies the selected report path when the argument is empty', async () => {
      await activateWith();
      flowProvider().getSelectedPerformanceReport.mockReturnValue({ key: 'selected-run' });

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_COPY_PATH, '');

      expect(flowProvider().copyPerformanceReportPath)
        .toHaveBeenCalledWith('selected-run');
    });

    it('skips copying when no report key resolves', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_COPY_PATH, '');

      expect(flowProvider().copyPerformanceReportPath).not.toHaveBeenCalled();
    });

    it('resolves a non-string argument in the performance report copy command', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_COPY_PATH, { command: { arguments: ['performance-report:key-a'] } });
      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_COPY_PATH, {
        command: { arguments: [undefined] },
        id: 'perf-id',
      });
      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_COPY_PATH, {});

      expect(flowProvider().copyPerformanceReportPath)
        .toHaveBeenCalledWith('key-a');
      expect(flowProvider().copyPerformanceReportPath)
        .toHaveBeenCalledWith('perf-id');
      expect(flowProvider().copyPerformanceReportPath)
        .toHaveBeenCalledTimes(2);
    });

    it('downloads a performance report', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_DOWNLOAD, { id: 'perf-dl' });

      expect(flowProvider().downloadPerformanceReport)
        .toHaveBeenCalledWith('perf-dl');
    });

    it('marks an unmarked performance report', async () => {
      await activateWith();
      flowProvider().getPerformanceReportByKey.mockReturnValue({ marked: false });
      flowProvider().getSelectedPerformanceReport.mockReturnValue({
        key: 'run-1',
        marked: true,
      });

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_MARK, 'run-1');

      expect(flowProvider().togglePerformanceReportMark)
        .toHaveBeenCalledWith('run-1');
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          `${CONTEXT_PREFIX}.performanceSelectedReportMarked`,
          true,
        );
    });

    it('keeps an already-marked performance report unchanged', async () => {
      await activateWith();
      flowProvider().getPerformanceReportByKey.mockReturnValue({ marked: true });

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_MARK, 'run-1');

      expect(flowProvider().togglePerformanceReportMark).not.toHaveBeenCalled();
    });

    it('unmarks a marked performance report', async () => {
      await activateWith();
      flowProvider().getPerformanceReportByKey.mockReturnValue({ marked: true });

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_UNMARK, 'run-1');

      expect(flowProvider().togglePerformanceReportMark)
        .toHaveBeenCalledWith('run-1');
    });

    it('keeps an unmarked performance report unchanged', async () => {
      await activateWith();
      flowProvider().getPerformanceReportByKey.mockReturnValue({ marked: false });

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_UNMARK, 'run-1');

      expect(flowProvider().togglePerformanceReportMark).not.toHaveBeenCalled();
    });

    it('toggles the performance sort order', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_SORT_TIME);

      expect(flowProvider().togglePerformanceSortOrder)
        .toHaveBeenCalled();
    });

    it('filters marked performance reports', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_FILTER_MARKED);

      expect(flowProvider().setPerformanceMarkedOnly)
        .toHaveBeenCalledWith(true);
    });

    it('shows all performance reports', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_SHOW_ALL);

      expect(flowProvider().setPerformanceMarkedOnly)
        .toHaveBeenCalledWith(false);
    });

    it('opens a performance file with a type', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN, '/data/perf.csv', 'csv');

      expect(flowProvider().openPerformanceFile)
        .toHaveBeenCalledWith('/data/perf.csv', 'csv');
    });

    it('skips opening a performance file without a path or type', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN, '', 'csv');
      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_FILE_OPEN, '/data/perf.csv', '');

      expect(flowProvider().openPerformanceFile).not.toHaveBeenCalled();
    });
  });

  describe('sidebar actions quick pick', () => {
    const actionNode = (nodeId: string, label: string, commandId?: string) => ({
      label,
      nodeId,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: commandId ? { command: commandId } : undefined,
    });

    const groupNode = (nodeId: string, label: string) => ({
      label,
      nodeId,
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
    });

    it('shows a hint when the operate tree has no root actions', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_ACTIONS_QUICK_PICK);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
      expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    });

    it('shows a hint when no actionable pick is collected', async () => {
      await activateWith();
      flowProvider().getChildren.mockReturnValue([actionNode('leaf', 'Leaf Node')]);

      await invokeCommand(constants.COMMAND_SIDEBAR_ACTIONS_QUICK_PICK);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
      expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    });

    it('flattens nested actions with group headers and executes the chosen command', async () => {
      await activateWith();
      flowProvider().getChildren.mockImplementation((node?: unknown) => {
        if (node === undefined) {
          return [groupNode('build', 'Build')];
        }

        if ((node as { nodeId: string }).nodeId === 'build') {
          return [actionNode('compile', 'Compile', 'test.action.compile')];
        }

        return [];
      });
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'Compile',
        commandId: 'test.action.compile',
      });

      await invokeCommand(constants.COMMAND_SIDEBAR_ACTIONS_QUICK_PICK);

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith('test.action.compile');
      expect(ConfigService.writeOpDevtoolsDottedSettings)
        .toHaveBeenCalled();
      expect(taskDispatch.dispatchGetOperatorActionQueueStatus)
        .toHaveBeenCalled();

      const picks = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0] as Array<{
        kind: number;
        label: string;
        commandId?: string;
      }>;

      expect(picks)
        .toContainEqual({
          kind: vscode.QuickPickItemKind.Separator,
          label: 'Build',
        });
      expect(picks)
        .toContainEqual(expect.objectContaining({
          label: 'Compile',
          commandId: 'test.action.compile',
        }));
    });

    it('inserts unnamed separators between debug/sanitizer and power/utTest roots', async () => {
      await activateWith();
      flowProvider().getChildren.mockReturnValue([
        actionNode('build', 'Build', 'test.action.build'),
        actionNode('debug', 'Debug', 'test.action.debug'),
        actionNode('sanitizer', 'Sanitizer', 'test.action.sanitizer'),
        actionNode('power', 'Power', 'test.action.power'),
        actionNode('utTest', 'UT Test', 'test.action.ut'),
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ commandId: 'test.action.build' });

      await invokeCommand(constants.COMMAND_SIDEBAR_ACTIONS_QUICK_PICK);

      const picks = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0] as Array<{
        kind: number;
        label: string;
      }>;

      expect(picks.filter((pick) => pick.kind === vscode.QuickPickItemKind.Separator && pick.label === ''))
        .toHaveLength(2);
    });

    it('deduplicates repeated command ids across root nodes', async () => {
      await activateWith();
      flowProvider().getChildren.mockReturnValue([
        actionNode('a', 'Alpha', 'test.action.same'),
        actionNode('b', 'Beta', 'test.action.same'),
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ commandId: 'test.action.same' });

      await invokeCommand(constants.COMMAND_SIDEBAR_ACTIONS_QUICK_PICK);

      const picks = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0] as Array<{
        commandId?: string;
      }>;

      expect(picks.filter((pick) => pick.commandId === 'test.action.same'))
        .toHaveLength(1);
    });

    it('does nothing when the quick pick is cancelled', async () => {
      await activateWith();
      flowProvider().getChildren.mockReturnValue([actionNode('a', 'Alpha', 'test.action.a')]);

      await invokeCommand(constants.COMMAND_SIDEBAR_ACTIONS_QUICK_PICK);

      expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith('test.action.a');
    });

    it('tolerates an object label without a nested label property', async () => {
      await activateWith();
      flowProvider().getChildren.mockReturnValue([
        {
          label: {},
          nodeId: 'x',
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          command: { command: 'test.action.x' },
        },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ commandId: 'test.action.x' });

      await invokeCommand(constants.COMMAND_SIDEBAR_ACTIONS_QUICK_PICK);

      const picks = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0] as Array<{
        label: string;
        commandId?: string;
      }>;

      expect(picks)
        .toContainEqual(expect.objectContaining({
          label: '',
          commandId: 'test.action.x',
        }));
    });

    it('carries string descriptions into the quick pick detail', async () => {
      await activateWith();
      flowProvider().getChildren.mockReturnValue([
        {
          label: 'Alpha',
          description: 'the description',
          nodeId: 'a',
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          command: { command: 'test.action.a' },
        },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ commandId: 'test.action.a' });

      await invokeCommand(constants.COMMAND_SIDEBAR_ACTIONS_QUICK_PICK);

      const picks = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0] as Array<{
        label: string;
        detail?: string;
      }>;

      expect(picks)
        .toContainEqual(expect.objectContaining({
          label: 'Alpha',
          detail: 'the description',
        }));
    });

    it('drops string icon paths from the quick pick items', async () => {
      await activateWith();
      flowProvider().getChildren.mockReturnValue([
        {
          label: 'Alpha',
          iconPath: 'icon.svg',
          nodeId: 'a',
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          command: { command: 'test.action.a' },
        },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ commandId: 'test.action.a' });

      await invokeCommand(constants.COMMAND_SIDEBAR_ACTIONS_QUICK_PICK);

      const picks = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0] as Array<{
        label: string;
        iconPath?: unknown;
      }>;

      const pick = picks.find((candidate) => candidate.label === 'Alpha');

      expect(pick)
        .toBeDefined();
      expect(pick?.iconPath)
        .toBeUndefined();
    });
  });

  describe('folder context menu commands', () => {
    it('warns when marking a project without a folder uri', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_MARK_AS_OPERATOR_PROJECT);
      await invokeCommand(constants.COMMAND_MARK_AS_MULTI_OPERATOR_PROJECT);
      await invokeCommand(constants.COMMAND_UNMARK_AS_OPERATOR_PROJECT);
      await invokeCommand(constants.COMMAND_UNMARK_AS_MULTI_OPERATOR_PROJECT);

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledTimes(4);
      expect(FolderContextMenuService.markAsOperatorProject).not.toHaveBeenCalled();
      expect(FolderContextMenuService.markAsMultiOperatorProject).not.toHaveBeenCalled();
    });

    it('marks a folder as an operator project and refreshes the contexts', async () => {
      await activateWith();
      const iconTheme = (OperatorProjectIconTheme.getInstance as jest.Mock).mock.results[0].value as {
        fireDecorationUpdate: jest.Mock;
      };
      const uri = vscode.Uri.file(path.join(tmpRoot, 'op'));

      await invokeCommand(constants.COMMAND_MARK_AS_OPERATOR_PROJECT, uri);

      expect(FolderContextMenuService.markAsOperatorProject)
        .toHaveBeenCalledWith(uri);
      expect(iconTheme.fireDecorationUpdate)
        .toHaveBeenCalledTimes(2);
      expect(iconTheme.fireDecorationUpdate)
        .toHaveBeenCalledWith(uri);
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          contextKey('operatorProjectMarked'),
          true,
        );
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          contextKey('multiOperatorProjectMarked'),
          false,
        );
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          contextKey('operatorProjectType'),
          'cann',
        );
    });

    it('publishes an empty operator project type when the check has none', async () => {
      await activateWith();
      (FolderContextMenuService.checkIsOperatorProject as jest.Mock).mockResolvedValue({
        isOperatorProject: false,
        isMultiProject: false,
        projectType: '',
      });
      const uri = vscode.Uri.file(path.join(tmpRoot, 'op'));

      await invokeCommand(constants.COMMAND_MARK_AS_OPERATOR_PROJECT, uri);

      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          contextKey('operatorProjectType'),
          '',
        );
    });

    it('marks a folder as a multi-operator project', async () => {
      await activateWith();
      (FolderContextMenuService.checkIsOperatorProject as jest.Mock).mockResolvedValue({
        isOperatorProject: true,
        isMultiProject: true,
        projectType: 'multi',
      });
      const uri = vscode.Uri.file(path.join(tmpRoot, 'multi'));

      await invokeCommand(constants.COMMAND_MARK_AS_MULTI_OPERATOR_PROJECT, uri);

      expect(FolderContextMenuService.markAsMultiOperatorProject)
        .toHaveBeenCalledWith(uri);
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          contextKey('operatorProjectMarked'),
          false,
        );
      expect(vscode.commands.executeCommand)
        .toHaveBeenCalledWith(
          'setContext',
          contextKey('multiOperatorProjectMarked'),
          true,
        );
    });

    it('unmarks a folder as an operator project', async () => {
      await activateWith();
      const uri = vscode.Uri.file(path.join(tmpRoot, 'op'));

      await invokeCommand(constants.COMMAND_UNMARK_AS_OPERATOR_PROJECT, uri);

      expect(FolderContextMenuService.unmarkAsOperatorProject)
        .toHaveBeenCalledWith(uri);
      expect(FolderContextMenuService.unmarkAsMultiOperatorProject).not.toHaveBeenCalled();
    });

    it('unmarks a folder as a multi-operator project', async () => {
      await activateWith();
      const uri = vscode.Uri.file(path.join(tmpRoot, 'multi'));

      await invokeCommand(constants.COMMAND_UNMARK_AS_MULTI_OPERATOR_PROJECT, uri);

      expect(FolderContextMenuService.unmarkAsMultiOperatorProject)
        .toHaveBeenCalledWith(uri);
    });
  });

  describe('operator project commands', () => {
    const operatorProjectCommands = [
      constants.COMMAND_OPERATOR_PROJECT_BUILD,
      constants.COMMAND_OPERATOR_PROJECT_RUN,
      constants.COMMAND_OPERATOR_PROJECT_CPU_DEBUG,
      constants.COMMAND_OPERATOR_PROJECT_NPU_DEBUG,
      constants.COMMAND_OPERATOR_PROJECT_CPU_DEBUG_CONFIG,
      constants.COMMAND_OPERATOR_PROJECT_NPU_DEBUG_CONFIG,
      constants.COMMAND_OPERATOR_PROJECT_SANITIZER,
      constants.COMMAND_OPERATOR_PROJECT_ON_BOARD,
      constants.COMMAND_OPERATOR_PROJECT_SIMULATION,
    ] as const;

    it('warns when invoked without a folder or file uri', async () => {
      await activateWith();

      for (const commandId of operatorProjectCommands) {
        await invokeCommand(commandId);
      }

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledTimes(operatorProjectCommands.length);
      expect(FolderContextMenuService.buildOperatorProject).not.toHaveBeenCalled();
      expect(FolderContextMenuService.cpuDebugOperatorProject).not.toHaveBeenCalled();
    });

    it('builds and runs an operator project at the passed uri', async () => {
      await activateWith();
      const uri = vscode.Uri.file(path.join(tmpRoot, 'op'));

      await invokeCommand(constants.COMMAND_OPERATOR_PROJECT_BUILD, uri);
      await invokeCommand(constants.COMMAND_OPERATOR_PROJECT_RUN, uri);

      expect(FolderContextMenuService.buildOperatorProject)
        .toHaveBeenCalledWith(uri);
      expect(FolderContextMenuService.runOperatorProject)
        .toHaveBeenCalledWith(uri);
    });

    it('resolves the containing folder for a file uri in cpu debug', async () => {
      const sourceFile = path.join(tmpRoot, 'src', 'kernel.cpp');

      fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
      fs.writeFileSync(sourceFile, 'int main() { return 0; }');
      await activateWith();

      await invokeCommand(constants.COMMAND_OPERATOR_PROJECT_CPU_DEBUG, vscode.Uri.file(sourceFile));

      expect(FolderContextMenuService.cpuDebugOperatorProject)
        .toHaveBeenCalledWith(expect.objectContaining({ fsPath: path.dirname(sourceFile) }));
    });

    it('falls back to the parent directory for a nonexistent path', async () => {
      const missing = path.join(tmpRoot, 'missing', 'x.cpp');

      await activateWith();

      await invokeCommand(constants.COMMAND_OPERATOR_PROJECT_NPU_DEBUG, vscode.Uri.file(missing));

      expect(FolderContextMenuService.npuDebugOperatorProject)
        .toHaveBeenCalledWith(expect.objectContaining({ fsPath: path.dirname(missing) }));
    });

    it('passes a folder uri through unchanged', async () => {
      await activateWith();
      const uri = vscode.Uri.file(tmpRoot);

      await invokeCommand(constants.COMMAND_OPERATOR_PROJECT_CPU_DEBUG, uri);
      await invokeCommand(constants.COMMAND_OPERATOR_PROJECT_NPU_DEBUG, uri);
      await invokeCommand(constants.COMMAND_OPERATOR_PROJECT_CPU_DEBUG_CONFIG, uri);
      await invokeCommand(constants.COMMAND_OPERATOR_PROJECT_NPU_DEBUG_CONFIG, uri);
      await invokeCommand(constants.COMMAND_OPERATOR_PROJECT_SANITIZER, uri);
      await invokeCommand(constants.COMMAND_OPERATOR_PROJECT_ON_BOARD, uri);
      await invokeCommand(constants.COMMAND_OPERATOR_PROJECT_SIMULATION, uri);

      expect(FolderContextMenuService.cpuDebugOperatorProject)
        .toHaveBeenCalledWith(expect.objectContaining({ fsPath: tmpRoot }));
      expect(FolderContextMenuService.npuDebugOperatorProject)
        .toHaveBeenCalledWith(expect.objectContaining({ fsPath: tmpRoot }));
      expect(FolderContextMenuService.cpuDebugConfigOperatorProject)
        .toHaveBeenCalledWith(expect.objectContaining({ fsPath: tmpRoot }));
      expect(FolderContextMenuService.npuDebugConfigOperatorProject)
        .toHaveBeenCalledWith(expect.objectContaining({ fsPath: tmpRoot }));
      expect(FolderContextMenuService.sanitizerOperatorProject)
        .toHaveBeenCalledWith(expect.objectContaining({ fsPath: tmpRoot }));
      expect(FolderContextMenuService.onBoardOperatorProject)
        .toHaveBeenCalledWith(expect.objectContaining({ fsPath: tmpRoot }));
      expect(FolderContextMenuService.simulationOperatorProject)
        .toHaveBeenCalledWith(expect.objectContaining({ fsPath: tmpRoot }));
    });
  });

  describe('report visualization commands', () => {
    it('warns when a sanitizer report visualization has no file uri', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_REPORT_VISUALIZATION_SANITIZER);
      await invokeCommand(constants.COMMAND_REPORT_VISUALIZATION_ON_BOARD);
      await invokeCommand(constants.COMMAND_REPORT_VISUALIZATION_SIMULATION);

      expect(vscode.window.showErrorMessage)
        .toHaveBeenCalledTimes(3);
      expect(FolderContextMenuService.addReportToFileMapList).not.toHaveBeenCalled();
    });

    it('adds a sanitizer report from the passed uri', async () => {
      await activateWith();
      const uri = vscode.Uri.file(path.join(tmpRoot, 'san.log'));

      await invokeCommand(constants.COMMAND_REPORT_VISUALIZATION_SANITIZER, uri);

      expect(FolderContextMenuService.addReportToFileMapList)
        .toHaveBeenCalledWith(uri, 'sanitizer');
    });

    it('adds on-board and simulation reports from the passed uri', async () => {
      await activateWith();
      const uri = vscode.Uri.file(path.join(tmpRoot, 'data.csv'));

      await invokeCommand(constants.COMMAND_REPORT_VISUALIZATION_ON_BOARD, uri);
      await invokeCommand(constants.COMMAND_REPORT_VISUALIZATION_SIMULATION, uri);

      expect(FolderContextMenuService.addReportToFileMapList)
        .toHaveBeenCalledWith(uri, 'on_board');
      expect(FolderContextMenuService.addReportToFileMapList)
        .toHaveBeenCalledWith(uri, 'simulate');
    });

    it('visualizes a performance report from an explorer file uri', async () => {
      await activateWith();
      const uri = vscode.Uri.file(path.join(tmpRoot, 'perf.csv'));

      await invokeCommand(constants.COMMAND_REPORT_VISUALIZATION_PERFORMANCE, uri);

      expect(FolderContextMenuService.addReportToFileMapList)
        .toHaveBeenCalledWith(uri, 'on_board');
      expect(vscode.window.showOpenDialog).not.toHaveBeenCalled();
    });

    it('falls back to the folder picker for non-file arguments', async () => {
      await activateWith();
      const picked = vscode.Uri.file(tmpRoot);

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([picked]);

      await invokeCommand(constants.COMMAND_REPORT_VISUALIZATION_PERFORMANCE, { viewId: 'tree-view' });

      expect(vscode.window.showOpenDialog)
        .toHaveBeenCalled();
      expect(FolderContextMenuService.addReportToFileMapList)
        .toHaveBeenCalledWith(picked, 'on_board');
    });

    it('ignores non-file uri schemes in the performance visualization', async () => {
      await activateWith();
      const picked = vscode.Uri.file(tmpRoot);

      (vscode.window.showOpenDialog as jest.Mock).mockResolvedValue([picked]);

      await invokeCommand(constants.COMMAND_REPORT_VISUALIZATION_PERFORMANCE, vscode.Uri.parse('vscode://virtual/path'));

      expect(vscode.window.showOpenDialog)
        .toHaveBeenCalled();
      expect(FolderContextMenuService.addReportToFileMapList)
        .toHaveBeenCalledWith(picked, 'on_board');
    });

    it('does nothing when the folder picker is cancelled', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_REPORT_VISUALIZATION_PERFORMANCE);

      expect(vscode.window.showOpenDialog)
        .toHaveBeenCalled();
      expect(FolderContextMenuService.addReportToFileMapList).not.toHaveBeenCalled();
    });
  });

  describe('activation edge branches', () => {
    it('rejects multi-operator selections in the remaining sidebar commands', async () => {
      await activateWith();
      (homeMethods.getSelectedOperatorIds as jest.Mock).mockResolvedValue([
        '1',
        '2',
      ]);

      await invokeCommand(constants.COMMAND_SIDEBAR_ON_BOARD);
      await invokeCommand(constants.COMMAND_SIDEBAR_SIMULATION);
      await invokeCommand(constants.COMMAND_SIDEBAR_DUMP_TENSOR);
      await invokeCommand(constants.COMMAND_SIDEBAR_DEBUG_SETTINGS);
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_SETTINGS);
      await invokeCommand(constants.COMMAND_SIDEBAR_ON_BOARD_SETTINGS);
      await invokeCommand(constants.COMMAND_SIDEBAR_SIMULATION_SETTINGS);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalledTimes(7);
      expect(taskDispatch.dispatchEnqueueNativeOperatorAction).not.toHaveBeenCalled();
      expect(flowProvider().runFlowAction).not.toHaveBeenCalled();
    });

    it('skips marking sanitizer reports when the argument is empty', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_TOGGLE_MARK, '');
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_MARK, '');
      await invokeCommand(constants.COMMAND_SIDEBAR_SANITIZER_REPORT_UNMARK, '');

      expect(flowProvider().getSanitizerReportByPath).not.toHaveBeenCalled();
      expect(flowProvider().toggleSanitizerReportMark).not.toHaveBeenCalled();
    });

    it('skips performance report operations without a resolvable key', async () => {
      await activateWith();

      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_DOWNLOAD, '');
      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_MARK, '');
      await invokeCommand(constants.COMMAND_SIDEBAR_PERFORMANCE_REPORT_UNMARK, '');

      expect(flowProvider().downloadPerformanceReport).not.toHaveBeenCalled();
      expect(flowProvider().togglePerformanceReportMark).not.toHaveBeenCalled();
    });

    it('treats a non-array children result as an empty root action list', async () => {
      await activateWith();
      flowProvider().getChildren.mockReturnValue(undefined);

      await invokeCommand(constants.COMMAND_SIDEBAR_ACTIONS_QUICK_PICK);

      expect(vscode.window.showInformationMessage)
        .toHaveBeenCalled();
      expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
    });

    it('skips the selection handler for unprefixed report ids', async () => {
      await activateWith();
      const view = mockTreeViews.get(TREE_VIEW_PERFORMANCE_RESULTS);
      const selectionHandler = view?.selectionHandlers[0];

      await selectionHandler!({
        selection: [
          {
            nodeId: 'performanceReportItem',
            id: 'plain-id',
          },
        ],
      });
      await selectionHandler!({
        selection: [
          {
            nodeId: 'performanceReportItem',
            id: '',
          },
        ],
      });

      expect(flowProvider().selectPerformanceReport).not.toHaveBeenCalled();
    });

    it('skips the selection handler when the report item carries no id', async () => {
      await activateWith();
      const view = mockTreeViews.get(TREE_VIEW_PERFORMANCE_RESULTS);
      const selectionHandler = view?.selectionHandlers[0];

      await selectionHandler!({ selection: [{ nodeId: 'performanceReportItem' }] });

      expect(flowProvider().selectPerformanceReport).not.toHaveBeenCalled();
    });

    it('delegates item rendering calls to the performance tree provider', async () => {
      await activateWith();
      const view = mockTreeViews.get(TREE_VIEW_PERFORMANCE_RESULTS);
      const provider = (view?.options as { treeDataProvider: {
        getTreeItem: (element: unknown)=> unknown;
        getParent: (element: unknown)=> unknown;
        resolveTreeItem: (item: unknown, element: unknown, token: unknown)=> unknown;
      } }).treeDataProvider;

      flowProvider().getTreeItem.mockReturnValue({ id: 'item' });
      expect(provider.getTreeItem({ id: 'x' }))
        .toEqual({ id: 'item' });

      flowProvider().getPerformanceTreeParent.mockReturnValue({ id: 'parent' });
      expect(provider.getParent({ id: 'x' }))
        .toEqual({ id: 'parent' });

      flowProvider().resolveTreeItem.mockResolvedValue({ resolved: true });
      await expect(provider.resolveTreeItem({ id: 'x' }, { id: 'x' }, { isCancellationRequested: false }))
        .resolves
        .toEqual({ resolved: true });
    });

    it('disposes the st-test options provider through the registered closer', async () => {
      await activateWith();

      const closer = (registerStTestOptionsPanelCloser as jest.Mock).mock.calls[0][0] as ()=> void;

      closer();

      expect(WebviewProviderMock.instances[2].dispose)
        .toHaveBeenCalled();
    });

    it('invokes the debug-target adaptation callbacks', async () => {
      await activateWith();
      const calls = (registerMsdebugTargetAutoAdapt as jest.Mock).mock.calls[0];

      await (calls[1] as ()=> Promise<void>)();
      expect(homeMethods.resolveDebugOperatorEntry)
        .toHaveBeenCalled();

      const exampleTarget = await (calls[2] as (_root: string, operator: { name: string })=> unknown)('/ws', { name: 'op1' });

      expect(homeMethods.resolveBuildExampleTargetFile)
        .toHaveBeenCalledWith('op1');
      expect(exampleTarget)
        .toBeNull();
    });

    it('reads the st-test history workspaces through the registered provider', async () => {
      await activateWith();
      const getWorkspaces = (StTestHistoryProviderMock.instances[0] as unknown as {
        getWorkspaces: { getWorkspaces: ()=> Array<{ root: string;
          name: string }> };
      }).getWorkspaces.getWorkspaces;

      expect(Array.isArray(getWorkspaces()))
        .toBe(true);
    });

    it('supports object labels in the actions quick pick', async () => {
      await activateWith();
      flowProvider().getChildren.mockReturnValue([
        {
          label: { label: 'Grouped' },
          nodeId: 'grouped',
          collapsibleState: vscode.TreeItemCollapsibleState.None,
          command: { command: 'test.action.grouped' },
        },
      ]);
      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({ commandId: 'test.action.grouped' });

      await invokeCommand(constants.COMMAND_SIDEBAR_ACTIONS_QUICK_PICK);

      const picks = (vscode.window.showQuickPick as jest.Mock).mock.calls[0][0] as Array<{ label: string }>;

      expect(picks)
        .toContainEqual(expect.objectContaining({ label: 'Grouped' }));
    });

    it('logs and continues when insight initialization fails', async () => {
      const errorSpy = jest.spyOn(console, 'error')
        .mockImplementation(() => undefined);

      (insightService.initializeInsight as jest.Mock).mockRejectedValue(new Error('insight boom'));

      await activateWith();

      expect(errorSpy)
        .toHaveBeenCalled();
      expect(context.subscriptions.length)
        .toBeGreaterThan(0);
    });
  });
});
