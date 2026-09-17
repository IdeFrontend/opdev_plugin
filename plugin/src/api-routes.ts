import { webviewMethods } from './controller/index';
import { commonMethods } from './controller/common-controller';
import { configMethods } from './controller/config-controller';
import { scriptMethods } from './controller/script-controller';
import { homeMethods } from './controller/home-controller';
import { stTestMethods } from './controller/st-test-controller';
import {
  dispatchOnBoard,
  dispatchSimulator,
  dispatchSanitizer,
} from './helpers/task-method-dispatch';

const opsMethods = {
  getOnBoardOptions: configMethods.getOnBoardOptions,
  saveOnBoardOptions: configMethods.saveOnBoardOptions,
  getSimulateOptions: configMethods.getSimulateOptions,
  saveSimulateOptions: configMethods.saveSimulateOptions,
  getSanitizerOptions: configMethods.getSanitizerOptions,
  saveSanitizerOptions: configMethods.saveSanitizerOptions,

  startSimulate: dispatchSimulator,
  startOnBoard: dispatchOnBoard,

  getProjectEnv: scriptMethods.getProjectEnv,
  getNpuHardwareAvailable: scriptMethods.getNpuHardwareAvailable,
  getOnBoardExecutionAvailable: scriptMethods.getOnBoardExecutionAvailable,
  getSimulatorSupportedMetrics: scriptMethods.getSimulatorSupportedMetrics,

  runSanitizer: dispatchSanitizer,

  getSelectedOperators: homeMethods.getSelectedOperators,

  loadStTestOptions: stTestMethods.loadOptions,
  runStTestOptions: stTestMethods.runOptions,
};

export const apis = {
  webview: webviewMethods,
  common: commonMethods,
  ops: opsMethods,
};
