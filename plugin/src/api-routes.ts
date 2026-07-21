import { webviewMethods } from './controller/index';
import { commonMethods } from './controller/common-controller';
import { viewMethods } from './controller/view-controller';
import { configMethods } from './controller/config-controller';
import { scriptMethods } from './controller/script-controller';
import { sanitizerViewMethods } from './controller/sanitizer-controller';
import { homeMethods } from './controller/home-controller';
import { performanceMethods } from './controller/performance-data-controller';
import { taskMethods } from './controller/task-controller';
import { stTestMethods } from './controller/st-test-controller';
import {
  dispatchOnBoard,
  dispatchSimulator,
  dispatchSanitizer,
} from './helpers/task-method-dispatch';

const opsMethods = {
  getConfigData: configMethods.getConfigData,
  saveConfig: configMethods.saveConfig,

  startSimulate: dispatchSimulator,
  startOnBoard: dispatchOnBoard,

  getProjectEnv: scriptMethods.getProjectEnv,
  getNpuHardwareAvailable: scriptMethods.getNpuHardwareAvailable,
  getSimulatorSupportedMetrics: scriptMethods.getSimulatorSupportedMetrics,

  getSanitizerConfigs: sanitizerViewMethods.getSanitizerConfigs,
  saveSanitizerForm: sanitizerViewMethods.saveSanitizerForm,
  runSanitizer: dispatchSanitizer,

  importDumpTensorBinFile: taskMethods.importDumpTensorBinFile,

  getSelectedOperators: homeMethods.getSelectedOperators,

  loadStTestOptions: stTestMethods.loadOptions,
  runStTestOptions: stTestMethods.runOptions,
};

export const apis = {
  webview: webviewMethods,
  common: commonMethods,
  view: viewMethods,
  ops: opsMethods,
  performance: performanceMethods,
};
