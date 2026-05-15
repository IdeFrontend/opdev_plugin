import {
  GetWorkspaceResult,
  GetProjectIdResult,
} from '@shared/api-types';
import {
  PerformanceExecutionRecord,
  GetPerformanceRunDataResult,
} from '@shared/api-types';
import {
  OperatorInfo,
  BuildConfig,
} from '@shared/api-types';

/**
 * Mock versions of all API methods for E2E tests.
 * These simulate a full project workspace environment.
 */

// ============================================================
// HOME METHODS - Project and operator management
// ============================================================

export const mockHomeMethods = {
  async checkMultipleOperators() {
    return {
      hasMultiple: true,
      operators: [
        {
          id: 10001,
          name: 'e2e-operator-matmul',
          path: '/mock/workspace/e2e-operator-matmul',
          isExperimental: false,
          isCompiled: true,
        },
        {
          id: 10002,
          name: 'e2e-operator-conv2d',
          path: '/mock/workspace/e2e-operator-conv2d',
          isExperimental: false,
          isCompiled: true,
        },
        {
          id: 10003,
          name: 'e2e-operator-pooling',
          path: '/mock/workspace/e2e-operator-pooling',
          isExperimental: false,
          isCompiled: false,
        },
        {
          id: 11001,
          name: 'e2e-experimental-lstm',
          path: '/mock/workspace/e2e-experimental-lstm',
          isExperimental: true,
          isCompiled: false,
        },
        {
          id: 11002,
          name: 'e2e-experimental-attention',
          path: '/mock/workspace/e2e-experimental-attention',
          isExperimental: true,
          isCompiled: false,
        },
      ],
      isStandardCustom: true,
      supportsSanitizerAndTuning: true,
    };
  },

  async getProjectType() {
    return {
      projectType: 'STANDARD_CUSTOM',
      projectTypeName: 'Standard Custom Operator',
      projectTemplateName: '',
    };
  },

  async getProjectId(): Promise<GetProjectIdResult> {
    return '10000';
  },

  async getWorkspace(): Promise<GetWorkspaceResult> {
    return '/mock/workspace';
  },

  async getSelectedOperators() {
    return 'e2e-operator-matmul,e2e-operator-conv2d';
  },

  async getSelectedOperatorIds() {
    return [10001, 10002];
  },

  async getLastProjectPath() {
    return '/mock/workspace';
  },

  async validatePyascForAnalysis() {
    return { valid: true };
  },

  async getHome() {
    return '/mock/home';
  },

  async initOps(params: any) {
    console.log('[E2E Mock] initOps called with:', params);
    return 'mock-home-result';
  },

  async updateProject() {
    console.log('[E2E Mock] updateProject called');
  },

  async setSelectedOperators(params: { operatorIds: number[] }) {
    console.log('[E2E Mock] setSelectedOperators called with:', params);
  },
};

// ============================================================
// OPS METHODS - Build, run, simulation, sanitizer
// ============================================================

export const mockOpsMethods = {
  // Config management
  async getConfigData() {
    return {
      build_op: [
        {
          config_id: 1,
          config_name: 'Debug Build',
          config_type: 'build_op',
          user_options: {
            compile_mode: 'debug',
            precision_mode: 'fp32',
            enable_reduce_precision: false,
          },
        },
        {
          config_id: 2,
          config_name: 'Release Build',
          config_type: 'build_op',
          user_options: {
            compile_mode: 'release',
            precision_mode: 'fp16',
            enable_reduce_precision: true,
          },
        },
        {
          config_id: 3,
          config_name: 'Profile Build',
          config_type: 'build_op',
          user_options: {
            compile_mode: 'release',
            precision_mode: 'fp32',
            enable_profiling: true,
          },
        },
      ],
      build_example: [
        {
          config_id: 10,
          config_name: 'Example Debug',
          config_type: 'build_example',
          user_options: {},
        },
      ],
      simulate: [
        {
          config_id: 20,
          config_name: 'Simulate Default',
          config_type: 'simulate',
          user_options: {
            input_shape: '[1,3,224,224]',
            mock_data: true,
          },
        },
      ],
      on_board: [
        {
          config_id: 30,
          config_name: 'Board Deploy',
          config_type: 'on_board',
          user_options: {},
        },
      ],
      sanitizer: [
        {
          config_id: 40,
          config_name: 'Sanitizer Memory',
          config_type: 'sanitizer',
          user_options: {
            sanitizer_type: 'asan',
            detect_leaks: true,
          },
        },
      ],
    };
  },

  async getBuildConfigs() {
    return ['Debug Build', 'Release Build', 'Profile Build'];
  },

  async getActiveConfig() {
    return '2';
  },

  async saveBuildConfig(params: any) {
    console.log('[E2E Mock] saveBuildConfig called with:', params);
    return { success: true };
  },

  async saveConfig(params: any) {
    console.log('[E2E Mock] saveConfig called with:', params);
    return { success: true };
  },

  // Sanitizer configurations
  async getSanitizerConfigs() {
    return [
      {
        config_id: 1,
        config_name: 'Memory Sanitizer (ASAN)',
        config_type: 'sanitizer',
        user_options: {
          sanitizer_type: 'asan',
          detect_leaks: true,
          detect_buffers: true,
        },
      },
      {
        config_id: 2,
        config_name: 'Thread Sanitizer (TSAN)',
        config_type: 'sanitizer',
        user_options: {
          sanitizer_type: 'tsan',
          detect_deadlocks: true,
        },
      },
      {
        config_id: 3,
        config_name: 'Undefined Behavior Sanitizer (UBSAN)',
        config_type: 'sanitizer',
        user_options: {
          sanitizer_type: 'ubsan',
          check_pointer: true,
        },
      },
    ];
  },

  async getSanitizerConfigId() {
    return 1;
  },

  async getSanitizerForm() {
    return {
      config_id: 1,
      config_name: 'Memory Sanitizer (ASAN)',
      config_type: 'sanitizer',
      user_options: {
        sanitizer_type: 'asan',
        detect_leaks: true,
        detect_buffers: true,
        leak_check_level: 'strict',
        print_summary: true,
      },
    };
  },

  async saveSanitizerForm(params: any) {
    console.log('[E2E Mock] saveSanitizerForm called with:', params);
    return {
      config_id: 1,
      config_name: 'Memory Sanitizer (ASAN)',
      config_type: 'sanitizer',
      user_options: params.data || {},
    };
  },

  async runSanitizer(params?: any) {
    console.log('[E2E Mock] runSanitizer called with:', params);
    // Simulate async operation
    return new Promise((resolve) => setTimeout(resolve, 100));
  },

  // Task management
  async checkTaskStatus() {
    return {
      status: 'idle',
      progress: 0,
      message: '',
    };
  },

  async getCurrentTaskName() {
    return 'none';
  },

  async stopTask() {
    console.log('[E2E Mock] stopTask called');
  },

  // Build operations
  async startBuild(params?: any) {
    console.log('[E2E Mock] startBuild called with:', params);
    return { success: true, taskId: 'mock-task-1' };
  },

  async startRun(params?: any) {
    console.log('[E2E Mock] startRun called with:', params);
    return { success: true, taskId: 'mock-task-2' };
  },

  async startBuildExample(params?: any) {
    console.log('[E2E Mock] startBuildExample called with:', params);
    return { success: true, taskId: 'mock-task-3' };
  },

  async startSimulate(params?: any) {
    console.log('[E2E Mock] startSimulate called with:', params);
    return { success: true, taskId: 'mock-task-4' };
  },

  async startOnBoard(params?: any) {
    console.log('[E2E Mock] startOnBoard called with:', params);
    return { success: true, taskId: 'mock-task-5' };
  },

  async buildOp(params?: any) {
    console.log('[E2E Mock] buildOp called with:', params);
    return { success: true };
  },

  async buildExample(params?: any) {
    console.log('[E2E Mock] buildExample called with:', params);
    return { success: true };
  },

  async runExample(params?: any) {
    console.log('[E2E Mock] runExample called with:', params);
    return { success: true };
  },

  async simulate(params?: any) {
    console.log('[E2E Mock] simulate called with:', params);
    return { success: true };
  },

  async onBoard(params?: any) {
    console.log('[E2E Mock] onBoard called with:', params);
    return { success: true };
  },

  async runDebug(params?: any) {
    console.log('[E2E Mock] runDebug called with:', params);
    return { success: true };
  },

  async debugConfig() {
    return {
      debuggerPath: '/mock/debugger',
      port: 5678,
    };
  },

  async startDumpTensor() {
    console.log('[E2E Mock] startDumpTensor called');
    return { success: true };
  },

  // Environment and validation
  async checkDevtoolConfig() {
    return true;
  },

  async checkVscode() {
    return true;
  },

  // Operator list
  async getOperators(): Promise<OperatorInfo[]> {
    return [
      {
        id: 10001,
        op_name: 'e2e-operator-matmul',
        op_type: 'matmul',
        op_path: '/mock/workspace/e2e-operator-matmul',
        config_name: 'Debug Build',
      },
      {
        id: 10002,
        op_name: 'e2e-operator-conv2d',
        op_type: 'conv2d',
        op_path: '/mock/workspace/e2e-operator-conv2d',
        config_name: 'Release Build',
      },
      {
        id: 10003,
        op_name: 'e2e-operator-pooling',
        op_type: 'pooling',
        op_path: '/mock/workspace/e2e-operator-pooling',
        config_name: 'Debug Build',
      },
      {
        id: 11001,
        op_name: 'e2e-experimental-lstm',
        op_type: 'lstm',
        op_path: '/mock/workspace/e2e-experimental-lstm',
        config_name: 'Debug Build',
      },
    ];
  },
};

// ============================================================
// PERFORMANCE METHODS - Performance analysis data
// ============================================================

export const mockPerformanceMethods = {
  async getRunData(params?: any): Promise<GetPerformanceRunDataResult> {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return {
      data: [
        {
          key: 'run-001',
          title: 'MatMul Performance Run 001',
          timestamp: now - dayMs,
          dirPath: '/mock/performance/run-001',
          marked: false,
          children: [
            {
              title: 'profiling_data',
              children: [
                {
                  key: 'run-001-summary',
                  title: 'summary.json',
                  filePath: '/mock/performance/run-001/summary.json',
                  fileType: 'json',
                },
                {
                  key: 'run-001-timeline',
                  title: 'timeline.json',
                  filePath: '/mock/performance/run-001/timeline.json',
                  fileType: 'json',
                },
              ],
            },
            {
              title: 'memory_data',
              children: [
                {
                  key: 'run-001-memory',
                  title: 'memory_profile.bin',
                  filePath: '/mock/performance/run-001/memory_profile.bin',
                  fileType: 'binary',
                },
              ],
            },
          ],
        },
        {
          key: 'run-002',
          title: 'Conv2D Performance Run 002',
          timestamp: now - 2 * dayMs,
          dirPath: '/mock/performance/run-002',
          marked: true,
          children: [
            {
              title: 'profiling_data',
              children: [
                {
                  key: 'run-002-summary',
                  title: 'summary.json',
                  filePath: '/mock/performance/run-002/summary.json',
                  fileType: 'json',
                },
              ],
            },
          ],
        },
        {
          key: 'run-003',
          title: 'Pooling Performance Run 003',
          timestamp: now - 3 * dayMs,
          dirPath: '/mock/performance/run-003',
          marked: false,
          children: [
            {
              title: 'profiling_data',
              children: [
                {
                  key: 'run-003-summary',
                  title: 'summary.json',
                  filePath: '/mock/performance/run-003/summary.json',
                  fileType: 'json',
                },
                {
                  key: 'run-003-ops',
                  title: 'ops_summary.csv',
                  filePath: '/mock/performance/run-003/ops_summary.csv',
                  fileType: 'csv',
                },
              ],
            },
          ],
        },
      ] as PerformanceExecutionRecord[],
    };
  },

  toggleRecordMark(params: { key: string; marked: boolean }) {
    console.log('[E2E Mock] toggleRecordMark called with:', params);
  },

  async copyReport(params: { dirPath: string }) {
    console.log('[E2E Mock] copyReport called with:', params);
  },

  async downloadReport(params: { dirPath: string }) {
    console.log('[E2E Mock] downloadReport called with:', params);
  },

  async diffFiles(params: { filePath1: string; filePath2: string }) {
    console.log('[E2E Mock] diffFiles called with:', params);
  },
};

// ============================================================
// VIEW METHODS - Webview communication and UI state
// ============================================================

export const mockViewMethods = {
  async getHome() {
    return 'mock-view-home';
  },

  async getProjectSH() {
    return '/mock/workspace/build.sh';
  },

  async getBuildConfig() {
    return mockOpsMethods.getConfigData();
  },

  async saveAndStartBuild(params: any) {
    console.log('[E2E Mock] saveAndStartBuild called with:', params);
    return { success: true };
  },

  async saveAndStartBuildExample(params: any) {
    console.log('[E2E Mock] saveAndStartBuildExample called with:', params);
    return { success: true };
  },

  async runSanitizer(params: any) {
    console.log('[E2E Mock] runSanitizer (view) called with:', params);
    return { success: true };
  },

  async runExample(params: any) {
    console.log('[E2E Mock] runExample (view) called with:', params);
    return { success: true };
  },

  async simulate(params: any) {
    console.log('[E2E Mock] simulate (view) called with:', params);
    return { success: true };
  },

  async onBoard(params: any) {
    console.log('[E2E Mock] onBoard (view) called with:', params);
    return { success: true };
  },

  async downloadData(params: { filePath?: string; nodeKey?: string }) {
    console.log('[E2E Mock] downloadData called with:', params);
    return { success: true };
  },

  async deleteNode(params: { nodeKey: string; filePath?: string }) {
    console.log('[E2E Mock] deleteNode called with:', params);
    return { success: true };
  },

  async selectFolder(params?: { defaultPath?: string }) {
    console.log('[E2E Mock] selectFolder called with:', params);
    return '/mock/selected-folder';
  },

  async selectFile(params?: { defaultPath?: string }) {
    console.log('[E2E Mock] selectFile called with:', params);
    return '/mock/selected-file.txt';
  },

  async buildOp(params?: any) {
    console.log('[E2E Mock] buildOp (view) called with:', params);
    return { success: true };
  },

  async buildExample(params?: any) {
    console.log('[E2E Mock] buildExample (view) called with:', params);
    return { success: true };
  },

  async jumpToFile(params: { fileLink: string; row: number; col: number }) {
    console.log('[E2E Mock] jumpToFile called with:', params);
    return { success: true };
  },

  async buildCreateOps(params: any) {
    console.log('[E2E Mock] buildCreateOps called with:', params);
    return { success: true };
  },

  async startLinkCreateOps(params: any) {
    console.log('[E2E Mock] startLinkCreateOps called with:', params);
    return { success: true };
  },

  async openFile(params: { file: string }) {
    console.log('[E2E Mock] openFile called with:', params);
    return { success: true };
  },

  async openLink(params: { url: string }) {
    console.log('[E2E Mock] openLink called with:', params);
    return { success: true };
  },

  async setActiveConfig(params: { configId: string }) {
    console.log('[E2E Mock] setActiveConfig called with:', params);
    return { success: true };
  },
};

// ============================================================
// COMMON METHODS - Shared utilities
// ============================================================

export const mockCommonMethods = {
  async checkPathExists(params: { path: string; mustFile?: boolean }) {
    console.log('[E2E Mock] checkPathExists called with:', params);
    return true;
  },

  async saveFile(params: any) {
    console.log('[E2E Mock] saveFile called with:', params);
    return { success: true, data: '', filename: '' };
  },

  async openTerminal(params?: { cwd?: string }) {
    console.log('[E2E Mock] openTerminal called with:', params);
    return { success: true };
  },

  async showConfirmDialog(params: { title: string; message: string }) {
    console.log('[E2E Mock] showConfirmDialog called with:', params);
    return true;
  },

  async showErrorMessage(params: { message: string }) {
    console.log('[E2E Mock] showErrorMessage called with:', params);
  },

  async showInfoMessage(params: { message: string }) {
    console.log('[E2E Mock] showInfoMessage called with:', params);
  },

  async getLocale() {
    return 'en';
  },
};

// ============================================================
// EXPORT - Aggregated mock API
// ============================================================

export const mockApis = {
  // webview namespace for general webview APIs
  webview: {
    getHome: () => '/mock/home',
    getProjectSH: () => '/mock/workspace/build.sh',
    getLastProjectPath: () => '/mock/workspace',
    getWorkspace: (): GetWorkspaceResult => '/mock/workspace',
    getProjectType: () => ({
      projectType: 'STANDARD_CUSTOM',
      projectTypeName: 'Standard Custom Operator',
      projectTemplateName: '',
    }),
    validatePyascForAnalysis: () => ({ valid: true }),
    getProjectId: (): GetProjectIdResult => '10000',
    getDumpTensorData: () => ({ data: [] }),
    openFile: () => { console.log('[E2E Mock] webview.openFile called'); },
  },

  // ops namespace — merges home, task, config, script, link, sanitizer-view, and welcome methods
  // Must match the structure in api-routes.ts
  ops: {
    // Home methods (spread into ops in real API)
    ...mockHomeMethods,

    // Config and build methods
    getConfigData: mockOpsMethods.getConfigData,
    getBuildConfigs: mockOpsMethods.getBuildConfigs,
    getSanitizerConfigs: mockOpsMethods.getSanitizerConfigs,
    getSanitizerConfigId: mockOpsMethods.getSanitizerConfigId,
    getSanitizerForm: mockOpsMethods.getSanitizerForm,
    saveSanitizerForm: mockOpsMethods.saveSanitizerForm,
    runSanitizer: mockOpsMethods.runSanitizer,
    checkTaskStatus: mockOpsMethods.checkTaskStatus,
    getCurrentTaskName: mockOpsMethods.getCurrentTaskName,
    stopTask: mockOpsMethods.stopTask,
    startBuild: mockOpsMethods.startBuild,
    startRun: mockOpsMethods.startRun,
    startBuildExample: mockOpsMethods.startBuildExample,
    startSimulate: mockOpsMethods.startSimulate,
    startOnBoard: mockOpsMethods.startOnBoard,
    buildOp: mockOpsMethods.buildOp,
    buildExample: mockOpsMethods.buildExample,
    runExample: mockOpsMethods.runExample,
    simulate: mockOpsMethods.simulate,
    onBoard: mockOpsMethods.onBoard,
    runDebug: mockOpsMethods.runDebug,
    debugConfig: mockOpsMethods.debugConfig,
    startDumpTensor: mockOpsMethods.startDumpTensor,
    checkDevtoolConfig: mockOpsMethods.checkDevtoolConfig,
    checkVscode: mockOpsMethods.checkVscode,
    getOperators: mockOpsMethods.getOperators,
    showConfirmDialog: (params: { title: string; content: string }) => {
      console.log('[E2E Mock] ops.showConfirmDialog called', params);

      return true;
    },
    init: (_params: any) => { console.log('[E2E Mock] ops.init called'); return 'mock-result'; },
    createOps: (_params: any) => { console.log('[E2E Mock] ops.createOps called'); return 'mock-result'; },
    createOpsByPrototype: (_params: any) => { console.log('[E2E Mock] ops.createOpsByPrototype called'); },
    updateShScript: (_params: any) => { console.log('[E2E Mock] ops.updateShScript called'); return '/mock/workspace/build.sh'; },
    saveBuildConfig: mockOpsMethods.saveBuildConfig,
    saveConfig: mockOpsMethods.saveConfig,
    getBuildConfig: () => 2,
    getBuildExampleConfig: () => 10,
    getSimulateConfig: () => '20',
    getOnBoardConfig: () => '30',
    openConfig: (_params: any) => { console.log('[E2E Mock] ops.openConfig called'); },
  },

  // performance namespace for performance analysis
  performance: mockPerformanceMethods,

  // view namespace
  view: mockViewMethods,

  // common namespace
  common: mockCommonMethods,
};
