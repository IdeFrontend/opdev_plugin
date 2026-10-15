/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
import { homeMethods } from './home-controller';
import { configMethods } from './config-controller';
import { performanceDataMethods } from './performance-controller';
import { welcomeMethods } from './welcome-controller';

export const webviewMethods = {
  getHome: homeMethods.getHome,
  getWorkspace: homeMethods.getWorkspace,
  getProjectType: homeMethods.getProjectType,

  remotePathSearch: configMethods.remotePathSearch,

  createdProject: welcomeMethods.createdProject,

  selectFolder: performanceDataMethods.selectFolder,
  selectFile: performanceDataMethods.selectFile,
};
