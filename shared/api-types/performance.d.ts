/**
 * Copyright (c) 2025 Huawei Technologies Co., Ltd.
 * This program is free software, you can redistribute it and/or modify it under the terms and conditions of
 * CANN Open Software License Agreement Version 2.0 (the "License").
 * Please refer to the License for details. You may not use this file except in compliance with the License.
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE.
 * See LICENSE in the root of the software repository for the full text of the License.
 */
export type PerformanceExecutionRecord = {
  key: string;
  title: string;
  timestamp: number;
  dirPath: string;
  children: (PerformanceRunDataFolder | PerformanceRunDataFile)[];
  marked?: boolean;
};

export type PerformanceRunDataFolder = {
  title: string;
  children: (PerformanceRunDataFolder | PerformanceRunDataFile)[];
};

export type PerformanceRunDataFile = {
  key: string;
  title: string;
  filePath: string;
  fileType: string;
};

export type GetPerformanceRunDataParams = {
  sort: { by: 'timestamp';
    order: 'asc' | 'desc' };
};

export type GetPerformanceRunDataResult = {
  data: PerformanceExecutionRecord[];
};

export type MarkRecordParams = {
  key: string;
  marked: boolean;
};
