import { webviewMethods } from './controller/index';
import { commonMethods } from './controller/common-controller';
import { msSanitizerMethods } from './controller/ms-sanitizer-controller';
import { viewMethods } from './controller/view-controller';
import { welcomeMethods } from './controller/welcome-controller';
import { taskMethods } from './controller/task-controller';
import { configMethods } from './controller/config-controller';
import { scriptMethods } from './controller/script-controller';
import { linkMethods } from './controller/link-controller';
import { sanitizerViewMethods } from './controller/sanitizer-controller';
import { homeMethods } from './controller/home-controller';
import { performanceMethods } from './controller/performance-data-controller';
import { navigationController } from './controller/navigation-controller';
import { OperateTreeProvider } from './class/operate-tree-provider';

// V2 version controller
import { taskMethodsV2 } from '../src-v2/presentation/controllers-v2';
import { getFeatureFlag } from './feature-flags';

// Aggregate all methods under the ops namespace
// Dynamically select v1 or v2 through Feature Flags
const opsMethods = {
  ...welcomeMethods, // init, createOps, createOpsByPrototype

  // Build related - support v1/v2 switching
  startBuild: getFeatureFlag('USE_V2_BUILD')
    ? taskMethodsV2.startBuild
    : taskMethods.startBuild,

  startRun: getFeatureFlag('USE_V2_RUN')
    ? taskMethodsV2.startRun
    : taskMethods.startRun,

  startBuildExample: getFeatureFlag('USE_V2_BUILD_EXAMPLE')
    ? taskMethodsV2.startBuildExample
    : taskMethods.startBuildExample,

  // Emulation - supports v1/v2 switching (webview "Start now" uses same flow row UI as the tree)
  startSimulate: getFeatureFlag('USE_V2_SIMULATE')
    ? () => OperateTreeProvider.runFlowActionFromWebview('simulation', () => taskMethodsV2.startSimulate())
    : (params: { operatorNames?: string } = {}) =>
        OperateTreeProvider.runFlowActionFromWebview('simulation', () => taskMethods.startSimulate(params)),

  // On-board - supports v1/v2 switching
  startOnBoard: getFeatureFlag('USE_V2_ON_BOARD')
    ? () => OperateTreeProvider.runFlowActionFromWebview('onboard', () => taskMethodsV2.startOnBoard())
    : (params: { operatorNames?: string } = {}) =>
        OperateTreeProvider.runFlowActionFromWebview('onboard', () => taskMethods.startOnBoard(params)),

  // StopTask - If any V2 features are enabled, use the V2 version of stopTask
  stopTask: (
    getFeatureFlag('USE_V2_BUILD') ||
    getFeatureFlag('USE_V2_RUN') ||
    getFeatureFlag('USE_V2_BUILD_EXAMPLE') ||
    getFeatureFlag('USE_V2_SIMULATE') ||
    getFeatureFlag('USE_V2_ON_BOARD') ||
    getFeatureFlag('USE_V2_SANITIZER')
  )
    ? taskMethodsV2.stopTask
    : taskMethods.stopTask,

  // Other methods continue to use v1
  buildOp: taskMethods.buildOp,
  buildExample: taskMethods.buildExample,
  runExample: taskMethods.runExample,
  simulate: taskMethods.simulate,
  onBoard: taskMethods.onBoard,
  runDebug: taskMethods.runDebug,
  debugConfig: taskMethods.debugConfig,
  checkTaskStatus: taskMethods.checkTaskStatus,
  getCurrentTaskName: taskMethods.getCurrentTaskName,
  showConfirmDialog: taskMethods.showConfirmDialog,
  startDumpTensor: taskMethods.startDumpTensor,
  importDumpTensorBinFile: taskMethods.importDumpTensorBinFile,
  startUtTest: taskMethods.startUtTest,

  ...configMethods, // getConfigData, getBuildConfigs, saveBuildConfig, saveConfig, openConfig
  ...scriptMethods, // updateShScript
  ...linkMethods, // checkVscode, checkDevtoolConfig

  // Sanitizer related - supports v1/v2 switching
  getSanitizerConfigs: sanitizerViewMethods.getSanitizerConfigs,
  getSanitizerConfigId: sanitizerViewMethods.getSanitizerConfigId,
  getSanitizerForm: sanitizerViewMethods.getSanitizerForm,
  saveSanitizerForm: sanitizerViewMethods.saveSanitizerForm,
  runSanitizer: getFeatureFlag('USE_V2_SANITIZER')
    ? () => OperateTreeProvider.runFlowActionFromWebview('sanitizer', () => taskMethodsV2.runSanitizer())
    : (params: { operatorNames?: string } = {}) =>
        OperateTreeProvider.runFlowActionFromWebview('sanitizer', () => taskMethods.runSanitizer(params)),

  ...homeMethods, // getProjectId
};

export const apis = {
  webview: webviewMethods,
  common: commonMethods,
  msSanitizer: msSanitizerMethods,
  view: viewMethods,
  ops: opsMethods,
  performance: performanceMethods,
  navigation: navigationController,
};
