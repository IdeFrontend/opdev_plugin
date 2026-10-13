/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
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
  dispatchNewToolCollection,
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

  // A5 new-tool (npu-compute / npu-emulate) data-collection dialog.
  getDataCollectionConfig: configMethods.getDataCollectionConfig,
  saveDataCollectionConfig: configMethods.saveDataCollectionConfig,
  startNewToolCollection: dispatchNewToolCollection,

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
