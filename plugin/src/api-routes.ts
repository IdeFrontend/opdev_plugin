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

// V2 版本控制器
import { taskMethodsV2 } from '../src-v2/presentation/controllers-v2';
import { getFeatureFlag } from './feature-flags';

// 聚合 ops 命名空间下的所有方法
// 通过 Feature Flags 动态选择 v1 或 v2 实现
const opsMethods = {
  ...welcomeMethods, // init, createOps, createOpsByPrototype

  // 构建相关 - 支持 v1/v2 切换
  startBuild: getFeatureFlag('USE_V2_BUILD')
    ? taskMethodsV2.startBuild
    : taskMethods.startBuild,

  startRun: getFeatureFlag('USE_V2_RUN')
    ? taskMethodsV2.startRun
    : taskMethods.startRun,

  startBuildExample: getFeatureFlag('USE_V2_BUILD_EXAMPLE')
    ? taskMethodsV2.startBuildExample
    : taskMethods.startBuildExample,

  // 仿真 - 支持 v1/v2 切换
  startSimulate: getFeatureFlag('USE_V2_SIMULATE')
    ? taskMethodsV2.startSimulate
    : taskMethods.startSimulate,

  // 上板 - 支持 v1/v2 切换
  startOnBoard: getFeatureFlag('USE_V2_ON_BOARD')
    ? taskMethodsV2.startOnBoard
    : taskMethods.startOnBoard,

  // 其他方法继续使用 v1
  stopTask: taskMethods.stopTask,
  buildOp: taskMethods.buildOp,
  buildExample: taskMethods.buildExample,
  runExample: taskMethods.runExample,
  simulate: taskMethods.simulate,
  onBoard: taskMethods.onBoard,
  runDebug: taskMethods.runDebug,
  debugConfig: taskMethods.debugConfig,

  ...configMethods, // getConfigData, getBuildConfigs, saveBuildConfig, saveConfig, openConfig
  ...scriptMethods, // updateShScript
  ...linkMethods, // checkVscode, checkDevtoolConfig

  // Sanitizer 相关 - 支持 v1/v2 切换
  getSanitizerConfigs: sanitizerViewMethods.getSanitizerConfigs,
  getSanitizerConfigId: sanitizerViewMethods.getSanitizerConfigId,
  getSanitizerForm: sanitizerViewMethods.getSanitizerForm,
  saveSanitizerForm: sanitizerViewMethods.saveSanitizerForm,
  runSanitizer: getFeatureFlag('USE_V2_SANITIZER')
    ? taskMethodsV2.runSanitizer
    : sanitizerViewMethods.runSanitizer,

  ...homeMethods, // getProjectId
};

export const apis = {
  webview: webviewMethods,
  common: commonMethods,
  msSanitizer: msSanitizerMethods,
  view: viewMethods,
  ops: opsMethods,
  performance: performanceMethods,
};
