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
import {
  dispatchStartBuild,
  dispatchStartRun,
  dispatchStartBuildExample,
  dispatchStartDumpTensor,
  dispatchStartUtTest,
  dispatchStopTask,
  dispatchOnBoard,
  dispatchSimulator,
  dispatchSanitizer,
} from './helpers/task-method-dispatch';

// Aggregate all methods under the ops namespace
// Dynamically select v1 or v2 through Feature Flags
const opsMethods = {
  ...welcomeMethods, // init, createOps, createOpsByPrototype

  // Build related - support v1/v2 switching
  startBuild: dispatchStartBuild,
  startRun: dispatchStartRun,
  startBuildExample: dispatchStartBuildExample,

  // Emulation - supports v1/v2 switching (webview "Start now" uses same flow row UI as the tree)
  startSimulate: dispatchSimulator,

  // On-board - supports v1/v2 switching
  startOnBoard: dispatchOnBoard,

  // StopTask - If any V2 features are enabled, use the V2 version of stopTask
  stopTask: dispatchStopTask,

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
  startDumpTensor: dispatchStartDumpTensor,
  importDumpTensorBinFile: taskMethods.importDumpTensorBinFile,
  startUtTest: dispatchStartUtTest,

  ...configMethods, // getConfigData, getBuildConfigs, saveBuildConfig, saveConfig, openConfig
  ...scriptMethods, // updateShScript
  ...linkMethods, // checkVscode, checkDevtoolConfig

  // Sanitizer related - supports v1/v2 switching
  getSanitizerConfigs: sanitizerViewMethods.getSanitizerConfigs,
  getSanitizerConfigId: sanitizerViewMethods.getSanitizerConfigId,
  getSanitizerForm: sanitizerViewMethods.getSanitizerForm,
  saveSanitizerForm: sanitizerViewMethods.saveSanitizerForm,
  runSanitizer: dispatchSanitizer,

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
