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

// 聚合 ops 命名空间下的所有方法
const opsMethods = {
  ...welcomeMethods, // init, createOps, createOpsByPrototype
  ...taskMethods, // startBuild, startRun, startBuildExample, startSimulate, startOnBoard, stopTask
  ...configMethods, // getConfigData, getBuildConfigs, saveBuildConfig, saveConfig
  ...scriptMethods, // updateShScript
  ...linkMethods, // checkVscode, checkDevtoolConfig
  ...sanitizerViewMethods, // getSanitizerConfigs, saveSanitizerForm, runSanitizer
};

export const apis = {
  webview: webviewMethods,
  common: commonMethods,
  msSanitizer: msSanitizerMethods,
  view: viewMethods,
  ops: opsMethods,
};
