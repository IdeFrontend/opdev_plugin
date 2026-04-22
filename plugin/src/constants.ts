export const COMMAND_PREFIX = 'huawei-op-devtools';

export const COMMAND_OPEN = `${COMMAND_PREFIX}.open`;

export const COMMAND_PROJECT_SH = `${COMMAND_PREFIX}.projectSH`;

export const COMMAND_WELCOME = `${COMMAND_PREFIX}.welcome`;

export const COMMAND_CONFIG = `${COMMAND_PREFIX}.config`;

export const COMMAND_OPEN_MS_SANITIZER_PANEL_VIEW = `${COMMAND_PREFIX}.open-ms-sanitizer-panel-view`;

export const COMMAND_OPEN_PERFORMANCE_PANEL_VIEW = `${COMMAND_PREFIX}.open-performance-panel-view`;

export const COMMAND_OPEN_DUMP_TENSOR_PANEL_VIEW = `${COMMAND_PREFIX}.open-dump-tensor-panel-view`;

export const COMMAND_CREATE_OPERATOR_IN_WORKSPACE = `${COMMAND_PREFIX}.createOperatorInWorkspace`;

export const COMMAND_TOGGLE_OPS_OPERATE = `${COMMAND_PREFIX}.toggleOpsOperate`;

export const COMMAND_CLEAR_WELCOME_COUNT = `${COMMAND_PREFIX}.clearWelcomeCount`;

export const COMMAND_CLEAR_LAST_PROJECT_PATH = `${COMMAND_PREFIX}.clearLastProjectPath`;

export const COMMAND_CREATE_DIRECTORY = `${COMMAND_PREFIX}.createDictory`;

export const COMMAND_GET_HOME = `${COMMAND_PREFIX}.getHome`;

export const COMMAND_FLASH_MS_SANITIZER_RUN_DATA = `${COMMAND_PREFIX}.flashMsSanitizerRunData`;

export const COMMAND_FLASH_PERFORMANCE_RUN_DATA = `${COMMAND_PREFIX}.flashPerformanceRunData`;

export const COMMAND_FLASH_DUMP_TENSOR_DATA = `${COMMAND_PREFIX}.flashDumpTensorData`;

export const COMMAND_SIMULATOR_OPTIONS = `${COMMAND_PREFIX}.simulatorOptions`;

export const COMMAND_ON_BOARD_OPTIONS = `${COMMAND_PREFIX}.onBoardOptions`;

export const COMMAND_SANITIZER_OPTIONS = `${COMMAND_PREFIX}.sanitizerOptions`;

export const COMMAND_OPEN_PROJECT = `${COMMAND_PREFIX}.openProject`;

// View name constant (corresponding to the directory name under web/src/views)
export const VIEW_HOME = 'home';

export const VIEW_CONFIG = 'config';

export const VIEW_LINK = 'link';

export const VIEW_WELCOME = 'welcome';

export const VIEW_PROJECT_SH = 'project-sh';

export const VIEW_OPERATE = 'operate';

export const VIEW_MS_SANITIZER = 'ms-sanitizer-panel-view';

export const VIEW_PERFORMANCE_PANEL = 'performance-panel-view';

export const VIEW_PERFORMANCE_RUN_DATA = 'performance-run-data';

export const VIEW_MS_SANITIZER_RUN_DATA = 'ms-sanitizer-run-data';

export const VIEW_DUMP_TENSOR_DATA = 'dump-tensor-data';

export const VIEW_OPS_CONFIG = 'ops-config';

export const VIEW_OPTIONS_SIMULATOR = 'options-simulator';

export const VIEW_OPTIONS_ON_BOARD = 'options-on-board';

export const VIEW_OPTIONS_SANITIZER = 'options-sanitizer';

export const VIEW_OPEN_PROJECT = 'open-project';

// Folder right-click menu commands
export const COMMAND_MARK_AS_OPERATOR_PROJECT = `${COMMAND_PREFIX}.markAsOperatorProject`;

export const COMMAND_MARK_AS_MULTI_OPERATOR_PROJECT = `${COMMAND_PREFIX}.markAsMultiOperatorProject`;

export const COMMAND_UNMARK_AS_OPERATOR_PROJECT = `${COMMAND_PREFIX}.unmarkAsOperatorProject`;

export const COMMAND_UNMARK_AS_MULTI_OPERATOR_PROJECT = `${COMMAND_PREFIX}.unmarkAsMultiOperatorProject`;

export const COMMAND_OPERATOR_PROJECT_BUILD = `${COMMAND_PREFIX}.operatorProjectBuild`;

export const COMMAND_OPERATOR_PROJECT_BUILD_EXAMPLE = `${COMMAND_PREFIX}.operatorProjectBuildExample`;

export const COMMAND_OPERATOR_PROJECT_RUN = `${COMMAND_PREFIX}.operatorProjectRun`;

export const COMMAND_OPERATOR_PROJECT_CPU_DEBUG = `${COMMAND_PREFIX}.operatorProjectCpuDebug`;

export const COMMAND_OPERATOR_PROJECT_NPU_DEBUG = `${COMMAND_PREFIX}.operatorProjectNpuDebug`;

export const COMMAND_OPERATOR_PROJECT_CPU_DEBUG_CONFIG = `${COMMAND_PREFIX}.operatorProjectCpuDebugConfig`;

export const COMMAND_OPERATOR_PROJECT_NPU_DEBUG_CONFIG = `${COMMAND_PREFIX}.operatorProjectNpuDebugConfig`;

export const COMMAND_OPERATOR_PROJECT_SANITIZER = `${COMMAND_PREFIX}.operatorProjectSanitizer`;

export const COMMAND_OPERATOR_PROJECT_ON_BOARD = `${COMMAND_PREFIX}.operatorProjectOnBoard`;

export const COMMAND_OPERATOR_PROJECT_SIMULATION = `${COMMAND_PREFIX}.operatorProjectSimulation`;

export const COMMAND_REPORT_VISUALIZATION_SANITIZER = `${COMMAND_PREFIX}.reportVisualizationSanitizer`;

export const COMMAND_REPORT_VISUALIZATION_ON_BOARD = `${COMMAND_PREFIX}.reportVisualizationOnBoard`;

export const COMMAND_REPORT_VISUALIZATION_SIMULATION = `${COMMAND_PREFIX}.reportVisualizationSimulation`;

export const COMMAND_REPORT_VISUALIZATION_PERFORMANCE = `${COMMAND_PREFIX}.reportVisualizationPerformance`;

export const COMMAND_REFRESH_FOLDER_DECORATIONS = `${COMMAND_PREFIX}.refreshFolderDecorations`;

// Sidebar tree commands
export const COMMAND_SIDEBAR_PROJECT_CONFIG = `${COMMAND_PREFIX}.sidebar.projectConfig`;
export const COMMAND_SIDEBAR_BUILD = `${COMMAND_PREFIX}.sidebar.build`;
export const COMMAND_SIDEBAR_RUN = `${COMMAND_PREFIX}.sidebar.run`;
export const COMMAND_SIDEBAR_CPU_DEBUG = `${COMMAND_PREFIX}.sidebar.cpuDebug`;
export const COMMAND_SIDEBAR_NPU_DEBUG = `${COMMAND_PREFIX}.sidebar.npuDebug`;
export const COMMAND_SIDEBAR_SANITIZER = `${COMMAND_PREFIX}.sidebar.sanitizer`;
export const COMMAND_SIDEBAR_ON_BOARD = `${COMMAND_PREFIX}.sidebar.onBoard`;
export const COMMAND_SIDEBAR_SIMULATION = `${COMMAND_PREFIX}.sidebar.simulation`;
export const COMMAND_SIDEBAR_UT_TEST = `${COMMAND_PREFIX}.sidebar.utTest`;
export const COMMAND_SIDEBAR_DUMP_TENSOR = `${COMMAND_PREFIX}.sidebar.dumpTensor`;
export const COMMAND_SIDEBAR_DEBUG_SETTINGS = `${COMMAND_PREFIX}.operate.debugSettings`;
export const COMMAND_SIDEBAR_SANITIZER_SETTINGS = `${COMMAND_PREFIX}.operate.sanitizerSettings`;
export const COMMAND_SIDEBAR_ON_BOARD_SETTINGS = `${COMMAND_PREFIX}.operate.onBoardSettings`;
export const COMMAND_SIDEBAR_SIMULATION_SETTINGS = `${COMMAND_PREFIX}.operate.simulationSettings`;
export const COMMAND_SIDEBAR_SELECT_OPERATORS = `${COMMAND_PREFIX}.sidebar.selectOperators`;
export const COMMAND_SIDEBAR_CLEAR_SELECTED_OPERATORS = `${COMMAND_PREFIX}.sidebar.clearSelectedOperators`;
export const COMMAND_SIDEBAR_SEARCH_OPERATORS = `${COMMAND_PREFIX}.sidebar.searchOperators`;
export const COMMAND_SIDEBAR_CLEAR_OPERATOR_PROJECTS_SEARCH = `${COMMAND_PREFIX}.sidebar.clearOperatorProjectsSearch`;
export const COMMAND_SIDEBAR_TOGGLE_OPERATOR = `${COMMAND_PREFIX}.sidebar.toggleOperator`;
export const COMMAND_SIDEBAR_SELECT_ALL_OPERATORS = `${COMMAND_PREFIX}.sidebar.selectAllOperators`;
export const COMMAND_SIDEBAR_SELECT_ALL_COMPILED_OPERATORS = `${COMMAND_PREFIX}.sidebar.selectAllCompiledOperators`;
export const COMMAND_SIDEBAR_SELECT_ALL_PREPARED_OPERATORS = `${COMMAND_PREFIX}.sidebar.selectAllPreparedOperators`;
export const COMMAND_SIDEBAR_DESELECT_ALL_PREPARED_OPERATORS = `${COMMAND_PREFIX}.sidebar.deselectAllPreparedOperators`;
/** Stops the task started from the Actions tree (inline on the running row). */
export const COMMAND_SIDEBAR_STOP_FLOW_TASK = `${COMMAND_PREFIX}.sidebar.stopFlowTask`;
/** Clears the operator action queue and stops the current task (Actions view title). */
export const COMMAND_SIDEBAR_STOP_ALL_OPERATOR_ACTIONS = `${COMMAND_PREFIX}.sidebar.stopAllOperatorActions`;
export const COMMAND_SIDEBAR_OPEN_WELCOME = `${COMMAND_PREFIX}.sidebar.openWelcome`;
export const COMMAND_SIDEBAR_OPEN_HELP = `${COMMAND_PREFIX}.sidebar.openHelp`;
